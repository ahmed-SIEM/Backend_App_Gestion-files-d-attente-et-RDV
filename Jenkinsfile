/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          PIPELINE CI — FileZen (Intégration Continue)              ║
 * ║                                                                      ║
 * ║  Git Push → Tests → Qualité → Build Docker → Push DockerHub        ║
 * ║  Pipeline CI uniquement — le déploiement est géré par le CD        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ORDRE CORRECT des stages :
 *   1. Checkout
 *   2. Installation dépendances (parallèle)
 *   3. Build Frontend
 *   4. Tests Unitaires + Intégration (parallèle)
 *   5. Démarrer Backend + MongoDB
 *   6. Démarrer Frontend
 *   7. Tests E2E API + IHM (parallèle)      ← serveurs UP
 *   8. Tests Sécurité OWASP                 ← serveurs UP
 *   9. Tests Performance k6                 ← serveurs UP
 *  10. Arrêter les serveurs
 *  11. Rapport Allure
 *  12. Analyse SonarQube
 *  13. Build & Push Docker → DockerHub      ← artefact final CI
 */

pipeline {

    agent any

    tools {
        nodejs 'Node 18'
    }

    environment {
        BACKEND_PORT     = '5000'
        FRONTEND_PORT    = '4173'
        API_URL          = "http://localhost:${BACKEND_PORT}/api"
        FRONTEND_URL     = "http://localhost:${FRONTEND_PORT}"
        BACKEND_DIR      = '.'
        FRONTEND_DIR     = 'Frontend'
        TESTS_FONCT_DIR  = 'filezen-tests-fonctionnels'
        TESTS_NFONCT_DIR = 'filezen-tests-non-fonctionnels'
        // Debian 13 requiert MongoDB >= 7.0.3
        MONGOMS_VERSION  = '7.0.14'
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
    }

    // ══════════════════════════════════════════════════════════════════════════
    stages {

        // ─── STAGE 1 : Checkout ───────────────────────────────────────────────
        stage('🔄 Checkout') {
            steps {
                checkout scm
                sh '''
                    echo "═══════════════════════════════════════"
                    echo "  Branche : ${GIT_BRANCH:-main}"
                    echo "  Commit  : ${GIT_COMMIT:-unknown}"
                    echo "  Build   : #${BUILD_NUMBER}"
                    echo "═══════════════════════════════════════"

                    [ ! -d "Frontend" ] \
                        && git clone https://github.com/ahmed-SIEM/Frontend_App_Gestion-files-d-attente-et-RDV.git Frontend \
                        || git -C Frontend pull origin main || true

                    [ ! -d "filezen-tests-fonctionnels" ] \
                        && git clone https://github.com/ahmed-SIEM/filezen-tests-fonctionnels.git filezen-tests-fonctionnels \
                        || git -C filezen-tests-fonctionnels pull origin main || true

                    [ ! -d "filezen-tests-non-fonctionnels" ] \
                        && git clone https://github.com/ahmed-SIEM/filezen-tests-non-fonctionnels.git filezen-tests-non-fonctionnels \
                        || git -C filezen-tests-non-fonctionnels pull origin main || true

                    echo "✅ Tous les repos à jour"
                '''
                sh """
                    ln -sf ${env.WORKSPACE} ${env.WORKSPACE}/Backend 2>/dev/null || true
                """

                // Préparer le dossier allure-results propre pour ce build
                // On préserve l'historique (courbes de tendance) avant de nettoyer
                dir(TESTS_FONCT_DIR) {
                    sh '''
                        # Sauvegarder l'historique avant nettoyage
                        mkdir -p allure-results-history
                        [ -d allure-report/history ] \
                            && cp -r allure-report/history allure-results-history/ \
                            || true

                        # Nettoyer les résultats du build précédent
                        rm -rf allure-results
                        mkdir -p allure-results

                        # Réinjecter l'historique pour les courbes de tendance
                        [ -d allure-results-history/history ] \
                            && cp -r allure-results-history/history allure-results/ \
                            || true

                        echo "✅ allure-results prêt (résultats précédents nettoyés)"
                    '''
                }
            }
        }

        // ─── STAGE 2 : Installation dépendances (PARALLÈLE) ──────────────────
        stage('📦 Installation dépendances') {
            parallel {
                stage('Backend') {
                    steps { dir(BACKEND_DIR) { sh 'npm ci --prefer-offline' } }
                }
                stage('Frontend') {
                    steps { dir(FRONTEND_DIR) { sh 'npm ci --prefer-offline' } }
                }
                stage('Tests fonctionnels') {
                    steps {
                        dir(TESTS_FONCT_DIR) {
                            sh 'npm ci --prefer-offline'
                            sh 'npx playwright install chromium || true'
                        }
                    }
                }
                stage('Tests non-fonctionnels') {
                    steps { dir(TESTS_NFONCT_DIR) { sh 'npm ci --prefer-offline' } }
                }
            }
        }

        // ─── STAGE 3 : Build Frontend ─────────────────────────────────────────
        stage('🏗️ Build Frontend') {
            steps {
                dir(FRONTEND_DIR) { sh 'npm run build' }
            }
            post {
                success {
                    archiveArtifacts artifacts: "${FRONTEND_DIR}/dist/**", fingerprint: true
                }
            }
        }

        // ─── STAGE 4 : Tests Unitaires + Intégration (PARALLÈLE) ─────────────
        stage('🧪 Tests Unitaires & Intégration') {
            parallel {
                stage('🔵 Tests Unitaires') {
                    steps {
                        dir(TESTS_FONCT_DIR) { sh 'npm run test:unit || true' }
                    }
                }
                stage('🟡 Tests Intégration') {
                    steps {
                        dir(TESTS_FONCT_DIR) { sh 'npm run test:integration || true' }
                    }
                }
            }
        }

        // ─── STAGE 5 : Démarrer MongoDB + Backend ────────────────────────────
        stage('🚀 Démarrer Backend') {
            steps {
                sh '''
                    export PATH=$HOME/bin:$PATH
                    mkdir -p $HOME/bin $HOME/.cache/mongod-ci /tmp/mongo-data

                    # ── Installer mongod si absent (binaire Debian 12 compatible) ──
                    if ! command -v mongod >/dev/null 2>&1 && [ ! -f $HOME/bin/mongod ]; then
                        echo "📥 Téléchargement MongoDB 7.0..."
                        curl -sL https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian12-7.0.8.tgz \
                            -o /tmp/mongo.tgz
                        tar xzf /tmp/mongo.tgz -C /tmp/
                        cp /tmp/mongodb-linux-x86_64-debian12-7.0.8/bin/mongod $HOME/bin/mongod
                        chmod +x $HOME/bin/mongod
                        rm -rf /tmp/mongo.tgz /tmp/mongodb-linux*
                        echo "✅ mongod installé : $($HOME/bin/mongod --version | head -1)"
                    fi

                    # ── Démarrer MongoDB ──────────────────────────────────────────
                    echo "🍃 Démarrage MongoDB..."
                    $HOME/bin/mongod \
                        --port 27017 \
                        --dbpath /tmp/mongo-data \
                        --bind_ip 127.0.0.1 \
                        --fork \
                        --logpath /tmp/mongod.log \
                        --quiet \
                    && echo "✅ MongoDB démarré sur port 27017" \
                    || echo "⚠️ MongoDB déjà en cours ou erreur — on continue"

                    sleep 3
                '''
                dir(BACKEND_DIR) {
                    sh '''
                        export PATH=$HOME/bin:$PATH

                        # ── Démarrer le backend avec MongoDB ─────────────────────
                        MONGODB_URI=mongodb://localhost:27017/filezen_test \
                        NODE_ENV=test node src/server.js &
                        echo $! > /tmp/filezen_backend.pid

                        # Attendre que le backend réponde (max 30s)
                        echo "⏳ Attente backend port 5000..."
                        for i in $(seq 1 30); do
                            curl -sf http://localhost:5000/api/test >/dev/null 2>&1 \
                                && echo "✅ Backend prêt (${i}s)" && break
                            sleep 1
                        done
                    '''
                }
            }
        }

        // ─── STAGE 6 : Démarrer Frontend ─────────────────────────────────────
        stage('🌐 Démarrer Frontend') {
            steps {
                dir(FRONTEND_DIR) {
                    sh '''
                        npm run preview -- --port 4173 &
                        echo $! > /tmp/filezen_frontend.pid
                        echo "⏳ Attente frontend port 4173..."
                        for i in $(seq 1 20); do
                            curl -sf http://localhost:4173 >/dev/null 2>&1 \
                                && echo "✅ Frontend prêt (${i}s)" && break
                            sleep 1
                        done
                    '''
                }
            }
        }

        // ─── STAGE 7 : Tests E2E — API + IHM (PARALLÈLE) ─────────────────────
        stage('🔍 Tests E2E') {
            parallel {

                stage('🟠 Tests E2E API') {
                    steps {
                        dir(TESTS_FONCT_DIR) {
                            sh 'npm run test:e2e:api || true'
                        }
                    }
                }

                stage('🔴 Tests E2E IHM') {
                    steps {
                        dir(TESTS_FONCT_DIR) {
                            sh '''
                                # Un seul browser (Chrome) — comme les tests manuels
                                # Firefox + Mobile désactivés en CI pour éviter les doublons dans Allure
                                npx playwright test --project="UI Chrome" \
                                    --reporter=allure-playwright,list \
                                    2>&1 | head -200 || true
                            '''
                        }
                    }
                    post {
                        always {
                            archiveArtifacts(
                                artifacts: "${TESTS_FONCT_DIR}/test-results/**/*.png",
                                allowEmptyArchive: true
                            )
                        }
                    }
                }
            }
        }

        // ─── STAGE 8 : Tests Sécurité OWASP (serveurs UP) ────────────────────
        stage('🔒 Tests Sécurité OWASP') {
            steps {
                dir(TESTS_NFONCT_DIR) {
                    // Backend déjà démarré en stage 5 — on l'utilise directement
                    sh 'npm run test:security || true'
                }
            }
        }

        // ─── STAGE 9 : Tests Performance k6 (serveurs UP) ────────────────────
        stage('⚡ Tests Performance k6') {
            steps {
                dir(TESTS_NFONCT_DIR) {
                    sh '''
                        export PATH=$HOME/bin:$PATH
                        mkdir -p $HOME/bin

                        # Auto-install k6 si absent (sans sudo)
                        if ! command -v k6 >/dev/null 2>&1; then
                            echo "📥 Installation k6 v0.50.0..."
                            curl -sL https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz \
                                -o /tmp/k6.tar.gz
                            tar xzf /tmp/k6.tar.gz -C /tmp/
                            cp /tmp/k6-v0.50.0-linux-amd64/k6 $HOME/bin/k6
                            chmod +x $HOME/bin/k6
                            echo "✅ k6 installé : $(k6 version)"
                        fi

                        # Smoke test sur le backend DÉJÀ en cours (stage 5)
                        echo "⚡ Smoke test k6 → backend http://localhost:5000"
                        k6 run tests/performance/smoke.test.js \
                            --out json=k6-smoke-results.json \
                            --summary-export=k6-smoke-summary.json \
                            -e API_URL=http://localhost:5000 || true

                        echo "✅ k6 terminé"
                    '''
                }
            }
            post {
                always {
                    script {
                        def k6Summary = "${TESTS_NFONCT_DIR}/k6-smoke-summary.json"
                        def k6Results  = "${TESTS_NFONCT_DIR}/k6-smoke-results.json"
                        def k6Script   = "${TESTS_NFONCT_DIR}/generate-k6-report.js"

                        if (fileExists(k6Summary)) {
                            archiveArtifacts artifacts: k6Summary, fingerprint: false
                        }
                        if (fileExists(k6Results)) {
                            archiveArtifacts artifacts: k6Results, fingerprint: false
                        }

                        writeFile file: k6Script, text: """
const fs = require('fs');
let data = {};
try { data = JSON.parse(fs.readFileSync('k6-smoke-summary.json', 'utf8')); }
catch(e) { data = { metrics: {} }; }
const m = data.metrics || {};
const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : String(v || 'N/A');
const get = (metric, field) => { if (!m[metric]) return 'N/A'; return fmt(m[metric][field]); };
const reqs    = m.http_reqs ? (m.http_reqs.count || 0) : 0;
const rate    = m.http_reqs ? fmt(m.http_reqs.rate) : 'N/A';
const errRate = m.http_req_failed ? (m.http_req_failed.value * 100).toFixed(2) : '0.00';
const avgDur  = get('http_req_duration', 'avg');
const p90     = get('http_req_duration', 'p(90)');
const p95     = get('http_req_duration', 'p(95)');
const maxDur  = get('http_req_duration', 'max');
const medDur  = get('http_req_duration', 'med');
const statusOk = parseFloat(errRate) === 0;
const sc = statusOk ? '#27ae60' : '#e74c3c';
const statusText = statusOk ? '&#x2705; PASS' : '&#x274C; ECHEC';
const badge = (v, t) => parseFloat(v) < t ? '<span class="ok">&#x2705; OK</span>' : '<span class="ko">&#x274C; Lent</span>';
const now = new Date().toLocaleString('fr-FR');
const html =
'<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>k6 Report FileZen</title>' +
'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f0f2f5;padding:20px}' +
'.header{background:linear-gradient(135deg,#2c3e50,#3498db);color:#fff;padding:25px;border-radius:10px;margin-bottom:20px}' +
'.header h1{font-size:1.6em;margin-bottom:5px}.header p{opacity:.8;font-size:.9em}' +
'.badge{text-align:center;padding:15px;border-radius:10px;margin-bottom:20px;font-size:1.3em;font-weight:bold;background:#fff;border-left:6px solid ' + sc + ';color:' + sc + '}' +
'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:20px}' +
'.card{background:#fff;padding:20px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.08);text-align:center}' +
'.lbl{font-size:.75em;text-transform:uppercase;color:#888;margin-bottom:8px}' +
'.val{font-size:2em;font-weight:bold;color:#2c3e50}.unit{font-size:.7em;color:#aaa;margin-top:3px}' +
'.section{background:#fff;padding:20px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.08);margin-bottom:15px}' +
'h2{font-size:1.1em;color:#2c3e50;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #3498db}' +
'table{width:100%;border-collapse:collapse}th{background:#3498db;color:#fff;padding:10px;text-align:left;font-size:.85em}' +
'td{padding:10px;border-bottom:1px solid #f0f2f5;font-size:.9em}tr:last-child td{border-bottom:none}' +
'.ok{color:#27ae60;font-weight:bold}.ko{color:#e74c3c;font-weight:bold}' +
'.footer{text-align:center;color:#aaa;font-size:.8em;margin-top:20px}</style></head><body>' +
'<div class="header"><h1>&#x26A1; Rapport Performance k6 &#x2014; FileZen</h1><p>Smoke Test CI &#x2014; ' + now + '</p></div>' +
'<div class="badge">' + statusText + ' &nbsp;|&nbsp; Taux erreur : ' + errRate + '%</div>' +
'<div class="grid">' +
'<div class="card"><div class="lbl">Requetes totales</div><div class="val">' + reqs + '</div></div>' +
'<div class="card"><div class="lbl">Debit</div><div class="val">' + rate + '</div><div class="unit">req/s</div></div>' +
'<div class="card"><div class="lbl">Taux erreur</div><div class="val" style="color:' + sc + '">' + errRate + '%</div></div>' +
'<div class="card"><div class="lbl">Duree moyenne</div><div class="val">' + avgDur + '</div><div class="unit">ms</div></div>' +
'</div><div class="section"><h2>&#x23F1; Distribution des temps de reponse</h2>' +
'<table><tr><th>Percentile</th><th>Valeur</th><th>Seuil</th><th>Statut</th></tr>' +
'<tr><td>Moyenne</td><td>' + avgDur + ' ms</td><td>&lt; 500ms</td><td>' + badge(avgDur,500) + '</td></tr>' +
'<tr><td>Mediane (p50)</td><td>' + medDur + ' ms</td><td>&lt; 500ms</td><td></td></tr>' +
'<tr><td>Percentile 90</td><td>' + p90 + ' ms</td><td>&lt; 1000ms</td><td>' + badge(p90,1000) + '</td></tr>' +
'<tr><td>Percentile 95</td><td>' + p95 + ' ms</td><td>&lt; 1500ms</td><td>' + badge(p95,1500) + '</td></tr>' +
'<tr><td>Maximum</td><td>' + maxDur + ' ms</td><td>&lt; 3000ms</td><td>' + badge(maxDur,3000) + '</td></tr>' +
'</table></div><div class="footer">Genere par Jenkins CI &#x2014; FileZen Pipeline</div></body></html>';
fs.writeFileSync('k6-report.html', html);
console.log('k6-report.html generated');
"""
                        dir(TESTS_NFONCT_DIR) {
                            sh 'node generate-k6-report.js || true'
                        }
                        publishHTML(target: [
                            allowMissing: true,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: "${TESTS_NFONCT_DIR}",
                            reportFiles: 'k6-report.html',
                            reportName: '⚡ Rapport k6 Performance'
                        ])
                    }
                }
            }
        }

        // ─── STAGE 10 : Arrêter les serveurs ─────────────────────────────────
        stage('🛑 Arrêter les serveurs') {
            steps {
                sh '''
                    export PATH=$HOME/bin:$PATH
                    [ -f /tmp/filezen_backend.pid ]  && kill $(cat /tmp/filezen_backend.pid)  2>/dev/null && rm /tmp/filezen_backend.pid  && echo "✅ Backend arrêté"  || true
                    [ -f /tmp/filezen_frontend.pid ] && kill $(cat /tmp/filezen_frontend.pid) 2>/dev/null && rm /tmp/filezen_frontend.pid && echo "✅ Frontend arrêté" || true
                    # Arrêter MongoDB (via mongod --shutdown)
                    $HOME/bin/mongod --shutdown --dbpath /tmp/mongo-data 2>/dev/null || \
                        pkill -f "mongod.*27017" 2>/dev/null || true
                    echo "✅ Serveurs arrêtés"
                '''
            }
        }

        // ─── STAGE 11 : Rapport Allure ────────────────────────────────────────
        stage('📊 Rapport Allure') {
            steps {
                dir(TESTS_FONCT_DIR) {
                    sh '''
                        echo "📊 Génération rapport Allure..."
                        echo "   Résultats trouvés : $(ls allure-results/*.json 2>/dev/null | wc -l) fichiers"

                        # Générer le rapport HTML final
                        allure generate allure-results --clean -o allure-report || true

                        echo "✅ Rapport Allure généré"
                        echo "   Tests dans le rapport : $(ls allure-report/data/test-cases/ 2>/dev/null | wc -l)"
                    '''
                }
            }
            post {
                always {
                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "${TESTS_FONCT_DIR}/allure-report",
                        reportFiles: 'index.html',
                        reportName: '📊 Rapport Allure FileZen'
                    ])
                }
            }
        }

        // ─── STAGE 12 : Analyse SonarQube ────────────────────────────────────
        stage('🔍 Analyse SonarQube') {
            steps {
                script {
                    def sonarOk = sh(
                        script: 'curl -sf http://host.docker.internal:9000/api/system/status 2>/dev/null | grep -q "UP"',
                        returnStatus: true
                    ) == 0

                    if (sonarOk) {
                        withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
                            sh '''
                                export PATH=$HOME/bin:$PATH
                                mkdir -p $HOME/bin
                                if ! command -v sonar-scanner >/dev/null 2>&1; then
                                    echo "📥 Installation sonar-scanner..."
                                    curl -sL https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-5.0.1.3006-linux.zip -o /tmp/sonar.zip
                                    unzip -q /tmp/sonar.zip -d $HOME/
                                    ln -sf $HOME/sonar-scanner-5.0.1.3006-linux/bin/sonar-scanner $HOME/bin/sonar-scanner
                                fi
                                sonar-scanner \
                                    -Dsonar.projectKey=filezen \
                                    -Dsonar.projectName="FileZen" \
                                    -Dsonar.sources=src \
                                    -Dsonar.exclusions=**/node_modules/**,**/coverage/** \
                                    -Dsonar.host.url=http://host.docker.internal:9000 \
                                    -Dsonar.token=$SONAR_TOKEN || true
                                echo "✅ SonarQube : http://localhost:9000/dashboard?id=filezen"
                            '''
                        }
                    } else {
                        echo '⚠️ SonarQube non accessible — stage ignoré'
                    }
                }
            }
        }

        // ─── STAGE 13 : Build & Push Docker → DockerHub (artefact final CI) ──
        stage('🐳 Build & Push Docker') {
            steps {
                script {
                    def dockerLocal = sh(script: 'docker --version 2>/dev/null', returnStatus: true) == 0
                    def dockerTCP   = sh(script: 'DOCKER_HOST=tcp://host.docker.internal:2375 docker --version 2>/dev/null', returnStatus: true) == 0
                    def dockerPrefix = dockerLocal ? '' : (dockerTCP ? 'DOCKER_HOST=tcp://host.docker.internal:2375 ' : '')
                    def dockerOk    = dockerLocal || dockerTCP

                    if (dockerOk) {
                        withCredentials([usernamePassword(
                            credentialsId: 'dockerhub-creds',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )]) {
                            sh """
                                export PATH=\$HOME/bin:\$PATH
                                DOCKER="${dockerPrefix}docker"
                                SHA=\${GIT_COMMIT:-latest}
                                SHORT_SHA=\${SHA:0:8}

                                echo "🐳 Login DockerHub..."
                                echo \$DOCKER_PASS | \$DOCKER login -u \$DOCKER_USER --password-stdin

                                echo "🏗️ Build image Backend..."
                                \$DOCKER build \
                                    -t \$DOCKER_USER/filezen-backend:\$SHORT_SHA \
                                    -t \$DOCKER_USER/filezen-backend:latest \
                                    --label "build=\${BUILD_NUMBER}" \
                                    --label "commit=\$SHORT_SHA" \
                                    .

                                echo "📤 Push vers DockerHub..."
                                \$DOCKER push \$DOCKER_USER/filezen-backend:\$SHORT_SHA
                                \$DOCKER push \$DOCKER_USER/filezen-backend:latest

                                echo "✅ Image publiée : \$DOCKER_USER/filezen-backend:\$SHORT_SHA"
                                echo "🔗 https://hub.docker.com/r/\$DOCKER_USER/filezen-backend"
                            """
                        }
                    } else {
                        echo '⚠️ Docker non disponible — activer Docker Desktop TCP (Settings → General → port 2375)'
                    }
                }
            }
        }

    }

    // ══════════════════════════════════════════════════════════════════════════
    post {
        success {
            echo """
╔══════════════════════════════════════════════╗
║  ✅  PIPELINE CI RÉUSSI — FileZen            ║
║  Build #${env.BUILD_NUMBER} — ${currentBuild.durationString}
║  Image Docker prête pour le déploiement CD   ║
╚══════════════════════════════════════════════╝
            """
        }
        failure {
            echo """
╔══════════════════════════════════════════════╗
║  ❌  PIPELINE CI ÉCHOUÉ — FileZen            ║
║  Build #${env.BUILD_NUMBER} — Vérifier les logs
╚══════════════════════════════════════════════╝
            """
        }
        always {
            // Nettoyage PID au cas où un stage aurait crashé avant l'arrêt
            sh '''
                [ -f /tmp/filezen_backend.pid ]     && kill $(cat /tmp/filezen_backend.pid)     2>/dev/null || true
                [ -f /tmp/filezen_frontend.pid ]    && kill $(cat /tmp/filezen_frontend.pid)    2>/dev/null || true
                [ -f /tmp/filezen_backend_sec.pid ] && kill $(cat /tmp/filezen_backend_sec.pid) 2>/dev/null || true
                [ -f /tmp/filezen_backend_k6.pid ]  && kill $(cat /tmp/filezen_backend_k6.pid)  2>/dev/null || true
                true
            '''
            echo '📊 Rapport Allure : onglet "Rapport Allure FileZen"'
            echo '⚡ Rapport k6     : onglet "Rapport k6 Performance"'
        }
    }
}
