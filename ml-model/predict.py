#!/usr/bin/env python3
"""
FileZen ML - Detection d anomalies de performance (Isolation Forest)

Usage:
  python3 predict.py <k6-summary.json> <allure-results-dir> <output.html> [history.csv] [model.pkl]
"""

import sys
import os
import json
import datetime
import traceback

# ── Imports optionnels (genere rapport meme si packages manquants) ─────────────
ML_AVAILABLE = False
PLOT_AVAILABLE = False

try:
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    import sklearn
    ML_AVAILABLE = True
except ImportError as e:
    print("  [WARN] Packages ML manquants (" + str(e) + ") - mode rapport basique")

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from io import BytesIO
    import base64
    import pickle
    PLOT_AVAILABLE = True
except ImportError as e:
    print("  [WARN] matplotlib manquant (" + str(e) + ") - pas de graphiques")

# ── Configuration ──────────────────────────────────────────────────────────────
K6_SUMMARY   = sys.argv[1] if len(sys.argv) > 1 else 'k6-smoke-summary.json'
ALLURE_DIR   = sys.argv[2] if len(sys.argv) > 2 else 'allure-results'
OUTPUT_HTML  = sys.argv[3] if len(sys.argv) > 3 else 'ml-report.html'
HISTORY_CSV  = sys.argv[4] if len(sys.argv) > 4 else '/var/jenkins_home/ml-history.csv'
MODEL_PKL    = sys.argv[5] if len(sys.argv) > 5 else '/var/jenkins_home/ml-model.pkl'
BUILD_NUMBER = os.environ.get('BUILD_NUMBER', 'N/A')
MIN_SAMPLES  = 5

FEATURES = ['p95_duration_ms', 'avg_duration_ms', 'error_rate_pct', 'test_fail_rate_pct']

# ── 1. Lire metriques k6 ───────────────────────────────────────────────────────
def read_k6(path):
    default = {'p95_duration_ms': 0.0, 'avg_duration_ms': 0.0,
               'error_rate_pct': 0.0, 'requests': 0, 'max_duration_ms': 0.0}
    if not os.path.exists(path):
        print("  Fichier k6 introuvable : " + path)
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            d = json.load(f)
        m = d.get('metrics', {})
        failed = m.get('http_req_failed', {})
        error_rate = float(failed.get('value', 0)) * 100
        dur = m.get('http_req_duration', {})
        return {
            'p95_duration_ms': float(dur.get('p(95)', 0)),
            'avg_duration_ms': float(dur.get('avg', 0)),
            'max_duration_ms': float(dur.get('max', 0)),
            'error_rate_pct':  round(error_rate, 2),
            'requests':        int(m.get('http_reqs', {}).get('count', 0)),
        }
    except Exception as e:
        print("  Erreur lecture k6 : " + str(e))
        return default

# ── 2. Lire resultats Allure ───────────────────────────────────────────────────
def read_allure(path):
    if not os.path.isdir(path):
        return {'total': 0, 'passed': 0, 'failed': 0, 'pass_rate': 100.0, 'fail_rate': 0.0}
    total = passed = 0
    for fname in os.listdir(path):
        if not fname.endswith('-result.json'):
            continue
        try:
            with open(os.path.join(path, fname), 'r', encoding='utf-8') as fh:
                r = json.load(fh)
            total += 1
            if r.get('status') == 'passed':
                passed += 1
        except Exception:
            pass
    failed = total - passed
    pass_rate = round(passed / total * 100, 2) if total > 0 else 100.0
    fail_rate = round(failed / total * 100, 2) if total > 0 else 0.0
    return {'total': total, 'passed': passed, 'failed': failed,
            'pass_rate': pass_rate, 'fail_rate': fail_rate}

# ── 3. Historique CSV (pur Python, sans pandas) ───────────────────────────────
COLS = ['build', 'timestamp', 'p95_duration_ms', 'avg_duration_ms',
        'error_rate_pct', 'test_fail_rate_pct', 'requests', 'total_tests']

def load_history_raw(path):
    """Retourne une liste de dicts, sans pandas."""
    rows = []
    if not os.path.exists(path):
        return rows
    try:
        import csv
        with open(path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    except Exception as e:
        print("  Erreur lecture historique : " + str(e))
    return rows

def append_history_raw(path, build, k6, allure):
    import csv
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    file_exists = os.path.exists(path)
    row = {
        'build':              str(build),
        'timestamp':          datetime.datetime.now().isoformat(),
        'p95_duration_ms':    str(round(k6['p95_duration_ms'], 2)),
        'avg_duration_ms':    str(round(k6['avg_duration_ms'], 2)),
        'error_rate_pct':     str(k6['error_rate_pct']),
        'test_fail_rate_pct': str(allure['fail_rate']),
        'requests':           str(k6['requests']),
        'total_tests':        str(allure['total']),
    }
    with open(path, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=COLS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
    return load_history_raw(path)

# ── 4. Pandas wrapper (si disponible) ─────────────────────────────────────────
def load_history_df(path):
    if not ML_AVAILABLE:
        return None
    rows = load_history_raw(path)
    if not rows:
        return pd.DataFrame(columns=COLS)
    df = pd.DataFrame(rows)
    for col in FEATURES + ['requests', 'total_tests']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    return df

# ── 5. Entrainement Isolation Forest ──────────────────────────────────────────
def train_and_predict(df):
    X = df[FEATURES].values.astype(float)
    scaler = StandardScaler()
    X_sc   = scaler.fit_transform(X)

    clf = IsolationForest(n_estimators=200, contamination=0.1,
                          random_state=42, max_features=len(FEATURES))
    clf.fit(X_sc)

    try:
        parent = os.path.dirname(MODEL_PKL)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(MODEL_PKL, 'wb') as f:
            pickle.dump({'model': clf, 'scaler': scaler}, f)
    except Exception as e:
        print("  Impossible de sauvegarder le modele : " + str(e))

    raw = clf.decision_function(X_sc)
    lo, hi = raw.min(), raw.max()
    scores = np.full(len(raw), 50.0) if hi == lo else (raw - lo) / (hi - lo) * 100.0

    s = float(scores[-1])
    if s >= 60:
        label, color = 'NORMAL',    '#10b981'
    elif s >= 35:
        label, color = 'ATTENTION', '#f59e0b'
    else:
        label, color = 'ANOMALIE',  '#ef4444'

    return s, label, color, scores

# ── 6. Graphiques matplotlib ───────────────────────────────────────────────────
def _fig_to_b64(fig):
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=120, bbox_inches='tight', facecolor='#0f172a')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()

def chart_trends(df):
    builds = df['build'].tolist()
    x = list(range(len(builds)))
    fig, axes = plt.subplots(2, 2, figsize=(14, 7))
    fig.patch.set_facecolor('#0f172a')
    fig.suptitle('Historique des metriques FileZen', color='#e2e8f0', fontsize=13, y=1.01)
    specs = [
        ('p95_duration_ms',   'P95 Temps de reponse (ms)', '#6366f1'),
        ('error_rate_pct',    "Taux d'erreur (%)",          '#ef4444'),
        ('test_fail_rate_pct','Taux echec tests (%)',        '#f59e0b'),
        ('avg_duration_ms',   'Duree moyenne (ms)',          '#06b6d4'),
    ]
    for ax, (col, title, clr) in zip(axes.flat, specs):
        ax.set_facecolor('#1e293b')
        for spine in ax.spines.values():
            spine.set_color('#334155')
        ax.tick_params(colors='#94a3b8', labelsize=8)
        ax.set_title(title, color='#e2e8f0', fontsize=10, pad=8)
        vals = df[col].tolist()
        ax.plot(x, vals, color=clr, linewidth=2, marker='o', markersize=5)
        ax.fill_between(x, vals, alpha=0.15, color=clr)
        if vals:
            ax.plot(x[-1], vals[-1], color='white', marker='*', markersize=10, zorder=5)
            ax.annotate(str(round(vals[-1], 1)), (x[-1], vals[-1]),
                        textcoords='offset points', xytext=(0, 8),
                        color='white', fontsize=8, ha='center')
        ax.set_xticks(x)
        ax.set_xticklabels(['#' + str(b) for b in builds], rotation=45, ha='right', fontsize=7)
        ax.grid(True, alpha=0.2, color='#334155')
    plt.tight_layout()
    return _fig_to_b64(fig)

def chart_anomaly(df, scores):
    builds = df['build'].tolist()
    x = list(range(len(builds)))
    fig, ax = plt.subplots(figsize=(14, 3.5))
    fig.patch.set_facecolor('#0f172a')
    ax.set_facecolor('#1e293b')
    for spine in ax.spines.values():
        spine.set_color('#334155')
    ax.tick_params(colors='#94a3b8', labelsize=9)
    ax.set_title('Score de normalite par build (Isolation Forest)',
                 color='#e2e8f0', fontsize=11, pad=10)
    bar_colors = ['#10b981' if s >= 60 else '#f59e0b' if s >= 35 else '#ef4444' for s in scores]
    bars = ax.bar(x, scores, color=bar_colors, alpha=0.85, width=0.6)
    ax.axhline(60, color='#10b981', linestyle='--', alpha=0.5, linewidth=1, label='Seuil NORMAL (60)')
    ax.axhline(35, color='#f59e0b', linestyle='--', alpha=0.5, linewidth=1, label='Seuil ATTENTION (35)')
    ax.set_ylim(0, 115)
    ax.set_xticks(x)
    ax.set_xticklabels(['#' + str(b) for b in builds], fontsize=9)
    ax.set_ylabel('Score (0=anomalie, 100=normal)', color='#94a3b8', fontsize=9)
    ax.legend(loc='upper left', fontsize=8, facecolor='#1e293b', labelcolor='#94a3b8')
    ax.grid(True, axis='y', alpha=0.2, color='#334155')
    for bar, s in zip(bars, scores):
        ax.text(bar.get_x() + bar.get_width() / 2.0, bar.get_height() + 1,
                str(round(s)), ha='center', va='bottom', color='white', fontsize=8)
    plt.tight_layout()
    return _fig_to_b64(fig)

# ── 7. Rapport HTML ─────────────────────────────────────────────────────────────
def generate_html(k6, allure, history_rows, score, label, color, scores_list, error_msg=None):
    n = len(history_rows)
    is_collecting = (n < MIN_SAMPLES) or (not ML_AVAILABLE)

    err_color  = '#10b981' if k6['error_rate_pct'] < 5 else '#ef4444'
    pass_color = '#10b981' if allure['pass_rate'] >= 80 else '#f59e0b'

    # Graphiques (si matplotlib dispo et >= 2 builds)
    img_trends = img_anomaly = ''
    if PLOT_AVAILABLE and ML_AVAILABLE and n >= 2:
        try:
            df_plot = load_history_df(HISTORY_CSV)
            if df_plot is not None and len(df_plot) >= 2:
                scores_np = scores_list if hasattr(scores_list, '__len__') else [50.0] * n
                img_trends  = chart_trends(df_plot)
                img_anomaly = chart_anomaly(df_plot, scores_np)
        except Exception as e:
            print("  [WARN] Erreur graphiques : " + str(e))

    # Tableau historique
    rows_html = ''
    for i, row in enumerate(reversed(history_rows)):
        s  = float(scores_list[len(history_rows) - 1 - i]) if (scores_list and len(scores_list) > i) else 50.0
        sc = '#10b981' if s >= 60 else '#f59e0b' if s >= 35 else '#ef4444'
        sl = 'NORMAL' if s >= 60 else ('ATTENTION' if s >= 35 else 'ANOMALIE')
        if is_collecting:
            sc, sl = '#3b82f6', 'COLLECTE'
        ts = str(row.get('timestamp', ''))[:16].replace('T', ' ')
        rows_html += (
            '<tr>'
            '<td>#' + str(row.get('build', '')) + '</td>'
            '<td>' + ts + '</td>'
            '<td>' + str(round(float(row.get('p95_duration_ms', 0)))) + ' ms</td>'
            '<td>' + str(round(float(row.get('avg_duration_ms', 0)))) + ' ms</td>'
            '<td>' + str(round(float(row.get('error_rate_pct', 0)), 1)) + '%</td>'
            '<td>' + str(round(float(row.get('test_fail_rate_pct', 0)), 1)) + '%</td>'
            '<td>' + str(int(float(row.get('total_tests', 0)))) + '</td>'
            '<td><span style="color:' + sc + ';font-weight:600">' + sl + '</span></td>'
            '</tr>'
        )

    # Banniere erreur
    error_banner = ''
    if error_msg:
        error_banner = (
            '<div style="background:#3b0000;border-left:4px solid #ef4444;'
            'padding:14px 18px;border-radius:8px;margin-bottom:24px">'
            '<strong style="color:#f87171">Erreur lors de l\'analyse ML</strong>'
            '<pre style="color:#fca5a5;font-size:.8rem;margin-top:8px;white-space:pre-wrap">'
            + str(error_msg)[:500] + '</pre></div>'
        )

    # Banniere collecte
    collecting_html = ''
    if is_collecting:
        pkg_status = 'Packages ML disponibles' if ML_AVAILABLE else 'Packages ML en cours d\'installation (pip3)'
        progress_pct = min(int(n / MIN_SAMPLES * 100), 100)
        collecting_html = (
            '<div style="background:#1e3a5f;border-left:4px solid #3b82f6;'
            'padding:14px 18px;border-radius:8px;margin-bottom:24px">'
            '<strong style="color:#60a5fa">Mode collecte de donnees</strong>'
            '<p style="color:#94a3b8;margin:6px 0 0">'
            + str(n) + '/' + str(MIN_SAMPLES) + ' builds collectes. '
            'Prediction automatique a partir du build #' + str(MIN_SAMPLES) + '.<br>'
            '<small>' + pkg_status + '</small></p>'
            '<div style="background:#0f172a;border-radius:4px;height:8px;margin-top:10px">'
            '<div style="background:#3b82f6;width:' + str(progress_pct) + '%;'
            'height:8px;border-radius:4px"></div></div></div>'
        )

    # Carte prediction
    pred_html = ''
    if not is_collecting:
        desc = {
            'NORMAL':    "Comportement conforme a l'historique. Aucune anomalie detectee.",
            'ATTENTION': 'Metriques legerement hors norme. Surveillance recommandee.',
            'ANOMALIE':  'Anomalie detectee ! Performances significativement degradees.',
        }.get(label, '')
        sklearn_ver = getattr(sklearn, '__version__', '?') if ML_AVAILABLE else '?'
        pred_html = (
            '<div class="card" style="border-left:4px solid ' + color + '">'
            '<h2>Prediction du modele &#8212; Build #' + str(BUILD_NUMBER) + '</h2>'
            '<div style="display:flex;align-items:center;gap:32px;flex-wrap:wrap">'
            '<div style="text-align:center">'
            '<div style="font-size:3.5rem;font-weight:800;color:' + color + '">' + str(round(score)) + '</div>'
            '<div style="color:#64748b;font-size:.85rem">Score / 100</div></div>'
            '<div style="flex:1">'
            '<div style="font-size:1.6rem;font-weight:700;color:' + color + ';margin-bottom:8px">' + label + '</div>'
            '<div style="color:#94a3b8;font-size:.9rem">' + desc + '</div>'
            '<div style="margin-top:12px;background:#0f172a;border-radius:6px;height:12px">'
            '<div style="background:' + color + ';width:' + str(round(score)) + '%;height:12px;border-radius:6px"></div>'
            '</div>'
            '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:#475569;margin-top:4px">'
            '<span>ANOMALIE (0)</span><span>ATTENTION (35)</span><span>NORMAL (60+)</span>'
            '</div></div></div>'
            '<p style="color:#475569;font-size:.78rem;margin-top:16px">'
            'Isolation Forest | scikit-learn ' + str(sklearn_ver) + ' | '
            + str(n) + ' builds | Features : P95, Avg, Error Rate, Test Fail Rate</p>'
            '</div>'
        )

    trend_section = (
        '<img src="data:image/png;base64,' + img_trends + '" style="width:100%;border-radius:8px">'
        if img_trends else '<p class="txt">Graphiques disponibles apres 2 builds et installation des packages ML.</p>'
    )
    anomaly_section = (
        '<div class="card"><h2>Score de normalite par build</h2>'
        '<img src="data:image/png;base64,' + img_anomaly + '" style="width:100%;border-radius:8px"></div>'
        if img_anomaly else ''
    )

    return """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ML Anomaly Detection - FileZen Build #{build}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}}
.hdr{{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #1e293b;border-radius:12px;padding:24px;margin-bottom:24px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:24px}}
.kpi{{background:#1e293b;border-radius:10px;padding:16px;text-align:center}}
.kpi-val{{font-size:1.8rem;font-weight:700}}
.kpi-lbl{{font-size:.8rem;color:#64748b;margin-top:4px}}
.card{{background:#1e293b;border-radius:10px;padding:20px;margin-bottom:20px}}
.card h2{{font-size:1rem;color:#e2e8f0;margin-bottom:14px}}
table{{width:100%;border-collapse:collapse;font-size:.85rem}}
th{{background:#0f172a;color:#64748b;padding:10px 12px;text-align:left;font-weight:500}}
td{{padding:9px 12px;border-bottom:1px solid #0f172a;color:#cbd5e1}}
tr:hover td{{background:#263244}}
.txt{{color:#64748b;font-size:.88rem}}
footer{{text-align:center;color:#334155;font-size:.8rem;margin-top:32px;padding-top:16px}}
</style>
</head>
<body>
<div class="hdr">
  <h1 style="font-size:1.6rem;margin-bottom:6px">ML Anomaly Detection &mdash; FileZen</h1>
  <p style="color:#64748b">Build <strong style="color:#e2e8f0">#{build}</strong>
  &nbsp;&middot;&nbsp; Isolation Forest (scikit-learn)
  &nbsp;&middot;&nbsp; {n} build(s) dans l'historique</p>
</div>
{error}{collecting}
<div class="grid">
  <div class="kpi"><div class="kpi-val" style="color:#6366f1">{p95:.0f}ms</div><div class="kpi-lbl">P95 Reponse</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#06b6d4">{avg:.0f}ms</div><div class="kpi-lbl">Duree moyenne</div></div>
  <div class="kpi"><div class="kpi-val" style="color:{ec}">{err:.1f}%</div><div class="kpi-lbl">Taux d'erreur</div></div>
  <div class="kpi"><div class="kpi-val" style="color:{pc}">{pr:.0f}%</div><div class="kpi-lbl">Tests reussis</div></div>
  <div class="kpi"><div class="kpi-val">{total}</div><div class="kpi-lbl">Tests total</div></div>
  <div class="kpi"><div class="kpi-val">{reqs}</div><div class="kpi-lbl">Requetes k6</div></div>
</div>
{pred}
<div class="card">
  <h2>Tendances historiques</h2>
  {trends}
</div>
{anomaly}
<div class="card">
  <h2>Historique des builds</h2>
  <table>
    <thead><tr><th>Build</th><th>Date</th><th>P95</th><th>Avg</th><th>Erreur</th><th>Tests KO</th><th>Total</th><th>Statut ML</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
</div>
<footer>FileZen ML Pipeline &nbsp;|&nbsp; Isolation Forest &nbsp;|&nbsp; Jenkins Build #{build}</footer>
</body>
</html>""".format(
        build=BUILD_NUMBER, n=n,
        p95=k6['p95_duration_ms'], avg=k6['avg_duration_ms'],
        err=k6['error_rate_pct'], ec=err_color,
        pr=allure['pass_rate'], pc=pass_color,
        total=allure['total'], reqs=k6['requests'],
        error=error_banner, collecting=collecting_html,
        pred=pred_html, trends=trend_section,
        anomaly=anomaly_section, rows=rows_html,
    )

# ── FALLBACK HTML (si tout plante) ────────────────────────────────────────────
def write_fallback_html(output_path, error_msg):
    html = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>ML Report - FileZen</title>
<style>body{{background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px}}
pre{{background:#1e293b;padding:16px;border-radius:8px;color:#f87171;font-size:.85rem;white-space:pre-wrap}}
</style></head>
<body>
<h1 style="color:#f87171;margin-bottom:16px">Erreur ML - Build #{build}</h1>
<p style="color:#94a3b8;margin-bottom:16px">
Le module ML a rencontre une erreur. Verifiez que scikit-learn, pandas, numpy et matplotlib sont installes.
</p>
<pre>{err}</pre>
<p style="color:#475569;margin-top:24px;font-size:.85rem">
Commande pour installer : pip3 install --user --break-system-packages scikit-learn pandas numpy matplotlib
</p>
</body></html>""".format(build=BUILD_NUMBER, err=str(error_msg)[:1000])
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

# ── MAIN ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("\nFileZen ML - Detection d'anomalies (Build #" + str(BUILD_NUMBER) + ")")
    print("  ML disponible : " + str(ML_AVAILABLE) + " | Matplotlib : " + str(PLOT_AVAILABLE))

    try:
        k6     = read_k6(K6_SUMMARY)
        allure = read_allure(ALLURE_DIR)

        print("  k6     : p95=" + str(round(k6['p95_duration_ms'])) + "ms"
              " avg=" + str(round(k6['avg_duration_ms'])) + "ms"
              " errors=" + str(k6['error_rate_pct']) + "%")
        print("  Allure : " + str(allure['total']) + " tests ("
              + str(allure['passed']) + " OK, " + str(allure['failed']) + " KO"
              " - " + str(allure['pass_rate']) + "%)")

        history_rows = append_history_raw(HISTORY_CSV, BUILD_NUMBER, k6, allure)
        n = len(history_rows)
        print("  Historique : " + str(n) + " build(s) enregistres")

        if not ML_AVAILABLE or n < MIN_SAMPLES:
            reason = "packages ML manquants" if not ML_AVAILABLE else "collecte (" + str(n) + "/" + str(MIN_SAMPLES) + ")"
            print("  Mode collecte : " + reason)
            score, label, color = 50.0, 'COLLECTE', '#3b82f6'
            scores_list = [50.0] * n
        else:
            df = load_history_df(HISTORY_CSV)
            score, label, color, scores_np = train_and_predict(df)
            scores_list = scores_np.tolist()
            print("  Prediction : " + label + " (score=" + str(round(score, 1)) + "/100)")

        html = generate_html(k6, allure, history_rows, score, label, color, scores_list)
        with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
            f.write(html)
        print("  Rapport ML genere : " + OUTPUT_HTML + "\n")

    except Exception as e:
        tb = traceback.format_exc()
        print("  [ERREUR] " + str(e))
        print(tb)
        try:
            write_fallback_html(OUTPUT_HTML, tb)
            print("  Rapport de fallback genere : " + OUTPUT_HTML)
        except Exception as e2:
            print("  Impossible d ecrire le rapport : " + str(e2))
