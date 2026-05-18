FROM jenkins/jenkins:lts

USER root

# Installer les dépendances système pour Playwright (Chrome headless)
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libdbus-1-3 \
    libexpat1 \
    libx11-6 \
    libxcb1 \
    libxext6 \
    wget \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

USER jenkins
