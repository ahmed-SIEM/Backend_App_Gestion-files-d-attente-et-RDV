#!/usr/bin/env python3
"""
FileZen ML - Detection d'anomalies de performance (Isolation Forest)

Usage:
  python3 predict.py <k6-summary.json> <allure-results-dir> <output.html> [history.csv] [model.pkl]
"""

import sys
import os
import json
import pickle
import base64
import datetime
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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
    pass_rate  = round(passed / total * 100, 2) if total > 0 else 100.0
    fail_rate  = round(failed / total * 100, 2) if total > 0 else 0.0
    return {'total': total, 'passed': passed, 'failed': failed,
            'pass_rate': pass_rate, 'fail_rate': fail_rate}

# ── 3. Historique CSV ──────────────────────────────────────────────────────────
COLS = ['build', 'timestamp', 'p95_duration_ms', 'avg_duration_ms',
        'error_rate_pct', 'test_fail_rate_pct', 'requests', 'total_tests']

def load_history(path):
    if not os.path.exists(path):
        return pd.DataFrame(columns=COLS)
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame(columns=COLS)

def append_history(path, build, k6, allure):
    df = load_history(path)
    row = {
        'build':              build,
        'timestamp':          datetime.datetime.now().isoformat(),
        'p95_duration_ms':    k6['p95_duration_ms'],
        'avg_duration_ms':    k6['avg_duration_ms'],
        'error_rate_pct':     k6['error_rate_pct'],
        'test_fail_rate_pct': allure['fail_rate'],
        'requests':           k6['requests'],
        'total_tests':        allure['total'],
    }
    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    df.to_csv(path, index=False)
    return df

# ── 4. Entrainement Isolation Forest ──────────────────────────────────────────
def train_and_predict(df):
    X = df[FEATURES].values.astype(float)

    scaler  = StandardScaler()
    X_sc    = scaler.fit_transform(X)

    clf = IsolationForest(
        n_estimators=200,
        contamination=0.1,
        random_state=42,
        max_features=len(FEATURES),
    )
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
    if hi == lo:
        scores = np.full(len(raw), 50.0)
    else:
        scores = (raw - lo) / (hi - lo) * 100.0

    s = float(scores[-1])
    if s >= 60:
        label, color = 'NORMAL',    '#10b981'
    elif s >= 35:
        label, color = 'ATTENTION', '#f59e0b'
    else:
        label, color = 'ANOMALIE',  '#ef4444'

    return s, label, color, scores

# ── 5. Graphiques ──────────────────────────────────────────────────────────────
def _fig_to_b64(fig):
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=130, bbox_inches='tight', facecolor='#0f172a')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()

def chart_trends(df):
    builds = df['build'].tolist()
    x      = list(range(len(builds)))

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
            ax.annotate(f'{vals[-1]:.1f}', (x[-1], vals[-1]),
                        textcoords='offset points', xytext=(0, 8),
                        color='white', fontsize=8, ha='center')
        ax.set_xticks(x)
        ax.set_xticklabels(['#' + str(b) for b in builds], rotation=45, ha='right', fontsize=7)
        ax.grid(True, alpha=0.2, color='#334155')

    plt.tight_layout()
    return _fig_to_b64(fig)

def chart_anomaly(df, scores):
    builds = df['build'].tolist()
    x      = list(range(len(builds)))

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
                f'{s:.0f}', ha='center', va='bottom', color='white', fontsize=8)

    plt.tight_layout()
    return _fig_to_b64(fig)

# ── 6. Rapport HTML ─────────────────────────────────────────────────────────────
def generate_html(k6, allure, df, score, label, color, scores):
    n = len(df)
    is_collecting = n < MIN_SAMPLES

    img_trends  = chart_trends(df)  if n >= 2 else None
    img_anomaly = chart_anomaly(df, scores) if n >= 2 else None

    # KPI cards
    err_color  = '#10b981' if k6['error_rate_pct'] < 5 else '#ef4444'
    pass_color = '#10b981' if allure['pass_rate'] >= 80 else '#f59e0b'

    # History table rows (newest first)
    rows_html = ''
    for idx in range(len(df) - 1, -1, -1):
        row = df.iloc[idx]
        s   = float(scores[idx])
        sc  = '#10b981' if s >= 60 else '#f59e0b' if s >= 35 else '#ef4444'
        sl  = 'NORMAL'  if s >= 60 else 'ATTENTION' if s >= 35 else 'ANOMALIE'
        ts  = str(row['timestamp'])[:16].replace('T', ' ')
        rows_html += (
            '<tr>'
            '<td>#' + str(row['build']) + '</td>'
            '<td>' + ts + '</td>'
            '<td>' + str(round(float(row['p95_duration_ms']))) + ' ms</td>'
            '<td>' + str(round(float(row['avg_duration_ms']))) + ' ms</td>'
            '<td>' + str(round(float(row['error_rate_pct']), 1)) + '%</td>'
            '<td>' + str(round(float(row['test_fail_rate_pct']), 1)) + '%</td>'
            '<td>' + str(int(float(row['total_tests']))) + '</td>'
            '<td><span style="color:' + sc + ';font-weight:600">' + sl + '</span></td>'
            '</tr>'
        )

    # Collecting banner
    progress_pct = min(int(n / MIN_SAMPLES * 100), 100)
    collecting_html = ''
    if is_collecting:
        collecting_html = (
            '<div style="background:#1e3a5f;border-left:4px solid #3b82f6;'
            'padding:14px 18px;border-radius:8px;margin-bottom:24px">'
            '<strong style="color:#60a5fa">Mode collecte de donnees</strong>'
            '<p style="color:#94a3b8;margin:6px 0 0">'
            + str(n) + '/' + str(MIN_SAMPLES) + ' builds collectes. '
            'Le modele s\'entrainera automatiquement a partir du build #' + str(MIN_SAMPLES) + '.</p>'
            '<div style="background:#0f172a;border-radius:4px;height:8px;margin-top:10px">'
            '<div style="background:#3b82f6;width:' + str(progress_pct) + '%;'
            'height:8px;border-radius:4px"></div></div></div>'
        )

    # Prediction card
    if is_collecting:
        pred_html = ''
    else:
        icon = '&#10003;' if label == 'NORMAL' else ('&#9888;' if label == 'ATTENTION' else '&#9888;')
        desc = {
            'NORMAL':    "Comportement conforme a l'historique. Aucune anomalie detectee.",
            'ATTENTION': 'Metriques legerement hors norme. Surveillance recommandee.',
            'ANOMALIE':  'Anomalie detectee ! Performances significativement degradees.',
        }[label]
        sklearn_ver = ''
        try:
            import sklearn
            sklearn_ver = sklearn.__version__
        except Exception:
            pass
        pred_html = (
            '<div class="card" style="border-left:4px solid ' + color + '">'
            '<h2>Prediction du modele — Build #' + str(BUILD_NUMBER) + '</h2>'
            '<div style="display:flex;align-items:center;gap:32px;flex-wrap:wrap">'
            '<div style="text-align:center">'
            '<div style="font-size:3.5rem;font-weight:800;color:' + color + '">' + str(round(score)) + '</div>'
            '<div style="color:#64748b;font-size:.85rem">Score / 100</div>'
            '</div>'
            '<div style="flex:1">'
            '<div style="font-size:1.6rem;font-weight:700;color:' + color + ';margin-bottom:8px">'
            + icon + ' ' + label + '</div>'
            '<div style="color:#94a3b8;font-size:.9rem">' + desc + '</div>'
            '<div style="margin-top:12px;background:#0f172a;border-radius:6px;height:12px">'
            '<div style="background:' + color + ';width:' + str(round(score)) + '%;height:12px;border-radius:6px"></div>'
            '</div>'
            '<div style="display:flex;justify-content:space-between;font-size:.75rem;color:#475569;margin-top:4px">'
            '<span>ANOMALIE (0)</span><span>ATTENTION (35)</span><span>NORMAL (60+)</span>'
            '</div></div></div>'
            '<p style="color:#475569;font-size:.78rem;margin-top:16px">'
            'Algorithme : Isolation Forest | scikit-learn ' + sklearn_ver + ' | '
            'Entraine sur ' + str(n) + ' builds | Features : P95, Avg, Error Rate, Test Fail Rate</p>'
            '</div>'
        )

    trend_html  = ('<img src="data:image/png;base64,' + img_trends + '" style="width:100%;border-radius:8px">'
                   if img_trends else '<p class="txt">Minimum 2 builds pour les tendances.</p>')
    anomaly_html = (
        '<div class="card"><h2>Score de normalite par build</h2>'
        '<img src="data:image/png;base64,' + img_anomaly + '" style="width:100%;border-radius:8px">'
        '</div>'
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
.hdr{{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #1e293b;
      border-radius:12px;padding:24px;margin-bottom:24px}}
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
footer{{text-align:center;color:#334155;font-size:.8rem;margin-top:32px}}
</style>
</head>
<body>
<div class="hdr">
  <h1 style="font-size:1.6rem;margin-bottom:6px">&#129504; Detection d'Anomalies ML &mdash; FileZen</h1>
  <p style="color:#64748b">Build <strong style="color:#e2e8f0">#{build}</strong>
  &nbsp;&middot;&nbsp; Isolation Forest &nbsp;&middot;&nbsp; {n} builds dans l'historique</p>
</div>

{collecting}

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
  <h2>&#128200; Tendances historiques</h2>
  {trends}
</div>

{anomaly_chart}

<div class="card">
  <h2>&#128203; Historique des builds</h2>
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
        collecting=collecting_html, pred=pred_html,
        trends=trend_html, anomaly_chart=anomaly_html, rows=rows_html,
    )

# ── MAIN ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("\nFileZen ML - Detection d'anomalies (Build #" + str(BUILD_NUMBER) + ")")

    k6     = read_k6(K6_SUMMARY)
    allure = read_allure(ALLURE_DIR)

    print("  k6     : p95=" + str(round(k6['p95_duration_ms'])) + "ms"
          " avg=" + str(round(k6['avg_duration_ms'])) + "ms"
          " errors=" + str(k6['error_rate_pct']) + "%")
    print("  Allure : " + str(allure['total']) + " tests ("
          + str(allure['passed']) + " OK, " + str(allure['failed']) + " KO"
          " - " + str(allure['pass_rate']) + "%)")

    df = append_history(HISTORY_CSV, BUILD_NUMBER, k6, allure)
    n  = len(df)
    print("  Historique : " + str(n) + " build(s) enregistres dans " + HISTORY_CSV)

    if n < MIN_SAMPLES:
        print("  Mode collecte (" + str(n) + "/" + str(MIN_SAMPLES) + ") - pas encore de prediction")
        score, label, color = 50.0, 'COLLECTE', '#3b82f6'
        scores = np.full(n, 50.0)
    else:
        score, label, color, scores = train_and_predict(df)
        print("  Prediction : " + label + " (score=" + str(round(score, 1)) + "/100)")

    html = generate_html(k6, allure, df, score, label, color, scores)
    with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
        f.write(html)
    print("  Rapport ML genere : " + OUTPUT_HTML + "\n")
