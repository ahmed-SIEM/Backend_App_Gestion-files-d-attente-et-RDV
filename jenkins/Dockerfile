FROM jenkins/jenkins:lts

USER root

# ── Dépendances système Playwright (Chrome headless) ──────────────────────────
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcairo2 libdbus-1-3 libexpat1 libx11-6 libxcb1 libxext6 \
    wget unzip curl gnupg \
    && rm -rf /var/lib/apt/lists/*

# ── MongoDB 7.0 (pour k6 + tests E2E sans Docker externe) ─────────────────────
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
        | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
        https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
        | tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update \
    && apt-get install -y mongodb-org \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/db \
    && chown -R jenkins:jenkins /data/db

USER jenkins
