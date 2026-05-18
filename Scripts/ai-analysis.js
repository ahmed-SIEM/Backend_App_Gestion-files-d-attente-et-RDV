#!/usr/bin/env node
/**
 * 🤖 Analyse IA — FileZen CI/CD
 *
 * Analyse les résultats de tests (Allure + k6) avec Groq AI (GRATUIT)
 * Modèle : llama-3.1-8b-instant (rapide, gratuit, très capable)
 *
 * Génère un rapport HTML professionnel avec :
 *   - Résumé exécutif en langage naturel
 *   - Décision de déploiement (OUI / NON / CONDITIONNEL)
 *   - Score qualité et niveau de risque
 *   - Causes des échecs et recommandations
 *
 * Usage : node scripts/ai-analysis.js <allure-results-dir> <k6-summary.json> <output.html>
 */

const fs   = require('fs');
const path = require('path');

const ALLURE_RESULTS = process.argv[2] || './allure-results';
const K6_SUMMARY     = process.argv[3] || './k6-smoke-summary.json';
const OUTPUT_HTML    = process.argv[4] || './ai-report.html';
const BUILD_NUMBER   = process.env.BUILD_NUMBER || 'N/A';
const API_KEY        = process.env.GROQ_API_KEY;

// ── Lire les résultats Allure ─────────────────────────────────────────────────
function readAllureResults(dir) {
  const empty = { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, failures: [] };
  if (!fs.existsSync(dir)) return empty;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('-result.json'));
  const results = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch(_) { return null; }
  }).filter(Boolean);

  if (results.length === 0) return empty;

  const summary = {
    total:   results.length,
    passed:  results.filter(r => r.status === 'passed').length,
    failed:  results.filter(r => r.status === 'failed').length,
    broken:  results.filter(r => r.status === 'broken').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  const failures = results
    .filter(r => r.status === 'failed' || r.status === 'broken')
    .slice(0, 15)
    .map(r => ({
      name:    (r.name || 'Unknown').slice(0, 80),
      status:  r.status,
      message: (r.statusDetails?.message || r.statusDetails?.trace || '').slice(0, 120),
      epic:    r.labels?.find(l => l.name === 'epic')?.value    || 'Non classifié',
      feature: r.labels?.find(l => l.name === 'feature')?.value || '',
    }));

  return { ...summary, failures };
}

// ── Lire les métriques k6 ─────────────────────────────────────────────────────
function readK6Summary(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = d.metrics || {};
    return {
      requests:    m.http_reqs?.count || 0,
      errorRate:   m.http_req_failed  ? (m.http_req_failed.value * 100).toFixed(1) : '0.0',
      avgDuration: m.http_req_duration?.avg?.toFixed(0) || 'N/A',
      p95Duration: m.http_req_duration?.['p(95)']?.toFixed(0) || 'N/A',
      maxDuration: m.http_req_duration?.max?.toFixed(0) || 'N/A',
    };
  } catch(_) { return null; }
}

// ── Appel Groq API (gratuit, compatible OpenAI) ───────────────────────────────
async function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert DevOps et QA senior. Réponds toujours en JSON valide uniquement, sans markdown, sans texte avant ou après.'
        },
        { role: 'user', content: prompt }
      ],
    });

    const req = require('https').request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices[0].message.content);
        } catch(e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Construire le prompt et analyser ─────────────────────────────────────────
async function analyzeWithClaude(allure, k6) {
  const passRate = allure.total > 0
    ? Math.round(allure.passed / allure.total * 100) : 0;

  const failList = allure.failures.length > 0
    ? allure.failures
        .map(f => `  - [${f.epic}] ${f.name}: ${f.message || 'assertion échouée'}`)
        .join('\n')
    : '  Aucun échec — tous les tests passent';

  const k6Section = k6 ? `
## Performance k6 (Smoke Test)
- Requêtes: ${k6.requests} | Erreurs: ${k6.errorRate}% | Moy: ${k6.avgDuration}ms | p95: ${k6.p95Duration}ms` : '';

  const prompt = `Tu es un expert DevOps et QA senior. Analyse ces résultats CI/CD pour FileZen (application de gestion de files d'attente et rendez-vous en Tunisie) et génère un rapport JSON professionnel.

## Résultats Build #${BUILD_NUMBER}
- Tests: ${allure.total} total | ${allure.passed} réussis (${passRate}%) | ${allure.failed} échoués | ${allure.broken} cassés | ${allure.skipped} ignorés

## Échecs détectés (top 15)
${failList}
${k6Section}

Réponds UNIQUEMENT avec ce JSON valide (sans markdown, sans texte avant ou après) :
{
  "resume_executif": "2-3 phrases pour le chef de projet non technique",
  "analyse_qualite": "analyse technique des tests en 2-3 phrases",
  "analyse_performance": "analyse des métriques k6 en 1-2 phrases",
  "causes_principales": ["cause 1", "cause 2", "cause 3"],
  "recommandations": ["action 1", "action 2", "action 3"],
  "decision_deploiement": "OUI",
  "justification_decision": "1 phrase courte justifiant OUI/NON/CONDITIONNEL",
  "score_qualite": 85,
  "risque": "FAIBLE"
}`;

  const raw = await callGroq(prompt);
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Générer le rapport HTML ───────────────────────────────────────────────────
function generateHTML(allure, k6, ai) {
  const passRate   = allure.total > 0 ? Math.round(allure.passed / allure.total * 100) : 0;
  const deployClr  = ai.decision_deploiement === 'OUI' ? '#10b981' : ai.decision_deploiement === 'CONDITIONNEL' ? '#f59e0b' : '#ef4444';
  const deployIcon = ai.decision_deploiement === 'OUI' ? '✅' : ai.decision_deploiement === 'CONDITIONNEL' ? '⚠️' : '❌';
  const riskClr    = ai.risque === 'FAIBLE' ? '#10b981' : ai.risque === 'MOYEN' ? '#f59e0b' : '#ef4444';
  const scoreClr   = ai.score_qualite >= 80 ? '#10b981' : ai.score_qualite >= 60 ? '#f59e0b' : '#ef4444';
  const now        = new Date().toLocaleString('fr-FR');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>🤖 Analyse IA — FileZen #${BUILD_NUMBER}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px;min-height:100vh}
  .header{background:linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899);padding:28px;border-radius:14px;margin-bottom:20px;position:relative;overflow:hidden}
  .header::after{content:'🤖';position:absolute;right:24px;top:50%;transform:translateY(-50%);font-size:4em;opacity:.2}
  .header h1{font-size:1.6em;font-weight:700}
  .header p{opacity:.8;margin-top:4px;font-size:.9em}
  .ai-tag{display:inline-block;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:12px;font-size:.75em;margin-top:8px}
  .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
  .card{background:#1e293b;padding:18px;border-radius:12px;border:1px solid #334155}
  .card h2{font-size:.75em;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px}
  .stat{text-align:center}
  .stat .v{font-size:2.2em;font-weight:700}
  .stat .l{font-size:.75em;color:#64748b;margin-top:3px}
  .green{color:#10b981}.red{color:#ef4444}.gray{color:#475569}.purple{color:#a78bfa}
  .decision{text-align:center;background:${deployClr}18;border:2px solid ${deployClr};padding:20px}
  .decision .icon{font-size:2.5em}
  .decision .d{font-size:1.6em;font-weight:700;color:${deployClr};margin-top:4px}
  .decision .j{font-size:.82em;color:#94a3b8;margin-top:8px;line-height:1.5}
  .score-wrap{display:flex;align-items:center;gap:16px}
  .score-num{font-size:3em;font-weight:700;color:${scoreClr}}
  .risk-b{display:inline-flex;align-items:center;padding:5px 12px;border-radius:7px;font-weight:600;font-size:.82em;background:${riskClr}18;color:${riskClr};border:1px solid ${riskClr};margin-top:8px}
  .txt{font-size:.88em;line-height:1.7;color:#cbd5e1}
  ul{list-style:none}
  li{padding:8px 0 8px 18px;position:relative;font-size:.88em;color:#cbd5e1;border-bottom:1px solid #0f172a}
  li:before{content:'→';position:absolute;left:0;color:#6366f1}
  li:last-child{border-bottom:none}
  .krow{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #334155;font-size:.88em}
  .krow:last-child{border-bottom:none}
  .kval{font-weight:600;color:#a78bfa}
  footer{text-align:center;color:#334155;font-size:.78em;margin-top:20px;padding-top:16px;border-top:1px solid #1e293b}
  .pl{color:#6366f1;font-weight:600}
</style>
</head>
<body>

<div class="header">
  <h1>🤖 Analyse IA — FileZen CI/CD</h1>
  <p>Build #${BUILD_NUMBER} &nbsp;·&nbsp; ${now}</p>
  <div class="ai-tag">⚡ Powered by Claude AI (llama-3.1-8b-instant (Groq))</div>
</div>

<div class="g4">
  <div class="card stat"><div class="v purple">${allure.total}</div><div class="l">Tests Total</div></div>
  <div class="card stat"><div class="v green">${allure.passed}</div><div class="l">Réussis (${passRate}%)</div></div>
  <div class="card stat"><div class="v red">${allure.failed + allure.broken}</div><div class="l">Échoués</div></div>
  <div class="card stat"><div class="v gray">${allure.skipped}</div><div class="l">Ignorés</div></div>
</div>

<div class="g2">
  <div class="card decision">
    <h2>Décision de déploiement</h2>
    <div class="icon">${deployIcon}</div>
    <div class="d">${ai.decision_deploiement}</div>
    <div class="j">${ai.justification_decision}</div>
  </div>
  <div class="card">
    <h2>Score Qualité</h2>
    <div class="score-wrap">
      <div class="score-num">${ai.score_qualite}</div>
      <div>
        <div style="color:#64748b;font-size:.85em">/ 100</div>
        <div class="risk-b">Risque : ${ai.risque}</div>
      </div>
    </div>
  </div>
</div>

<div class="g2">
  <div class="card">
    <h2>📋 Résumé Exécutif</h2>
    <p class="txt">${ai.resume_executif}</p>
    <br/>
    <p class="txt" style="color:#a5b4fc">${ai.analyse_qualite}</p>
  </div>
  <div class="card">
    <h2>⚡ Performance k6</h2>
    ${k6 ? `
    <div class="krow"><span>Requêtes totales</span><span class="kval">${k6.requests}</span></div>
    <div class="krow"><span>Taux d'erreur</span><span class="kval" style="color:${parseFloat(k6.errorRate)<5?'#10b981':'#ef4444'}">${k6.errorRate}%</span></div>
    <div class="krow"><span>Durée moyenne</span><span class="kval">${k6.avgDuration} ms</span></div>
    <div class="krow"><span>Percentile 95</span><span class="kval">${k6.p95Duration} ms</span></div>
    <p class="txt" style="margin-top:10px;font-size:.83em">${ai.analyse_performance}</p>
    ` : '<p class="txt">Données k6 non disponibles pour ce build.</p>'}
  </div>
</div>

<div class="g2">
  <div class="card">
    <h2>🔍 Causes Principales</h2>
    <ul>${ai.causes_principales.map(c => `<li>${c}</li>`).join('')}</ul>
  </div>
  <div class="card">
    <h2>💡 Recommandations</h2>
    <ul>${ai.recommandations.map(r => `<li>${r}</li>`).join('')}</ul>
  </div>
</div>

<footer>
  Rapport généré automatiquement par <span class="pl">Claude AI</span>
  dans la pipeline Jenkins CI/CD — FileZen
</footer>

</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🤖 Démarrage analyse IA des résultats CI/CD...');

  const allure = readAllureResults(ALLURE_RESULTS);
  const k6     = readK6Summary(K6_SUMMARY);

  console.log(`   Allure : ${allure.total} tests (${allure.passed} OK, ${allure.failed + allure.broken} KO)`);
  if (k6) console.log(`   k6     : ${k6.requests} requêtes, ${k6.errorRate}% erreurs, ${k6.avgDuration}ms moy`);

  if (!API_KEY) {
    console.log('⚠️  GROQ_API_KEY non définie — génération rapport sans IA');
    const fallback = { resume_executif: 'Clé API Anthropic manquante.', analyse_qualite: 'N/A', analyse_performance: 'N/A', causes_principales: ['Clé API manquante'], recommandations: ['Configurer ANTHROPIC_API_KEY dans Jenkins'], decision_deploiement: 'CONDITIONNEL', justification_decision: 'Analyse IA non disponible', score_qualite: 0, risque: 'INCONNU' };
    fs.writeFileSync(OUTPUT_HTML, generateHTML(allure, k6, fallback));
    return;
  }

  console.log('   Appel Groq API (llama-3.1-8b-instant)...');
  const ai = await analyzeWithClaude(allure, k6);

  console.log(`   ✅ Décision: ${ai.decision_deploiement} | Score: ${ai.score_qualite}/100 | Risque: ${ai.risque}`);

  const html = generateHTML(allure, k6, ai);
  fs.writeFileSync(OUTPUT_HTML, html);
  console.log(`   ✅ Rapport IA généré : ${OUTPUT_HTML}`);
}

main().catch(err => {
  console.error('❌ Erreur analyse IA:', err.message);
  // Ne jamais bloquer la pipeline — générer rapport minimal
  const minimal = { resume_executif: `Erreur IA: ${err.message}`, analyse_qualite:'Analyse non disponible', analyse_performance:'N/A', causes_principales:['Erreur API'], recommandations:['Vérifier la clé API'], decision_deploiement:'CONDITIONNEL', justification_decision:'Analyse IA en erreur', score_qualite:0, risque:'INCONNU' };
  const allure = readAllureResults(ALLURE_RESULTS);
  const k6 = readK6Summary(K6_SUMMARY);
  fs.writeFileSync(OUTPUT_HTML, generateHTML(allure, k6, minimal));
  process.exit(0);
});
