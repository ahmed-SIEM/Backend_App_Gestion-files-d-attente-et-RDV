# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Copier les dépendances installées
COPY --from=builder /app/node_modules ./node_modules

# Copier le code source
COPY src ./src
COPY package.json ./

# Variables d'environnement par défaut (surchargées par docker-compose / K8s)
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/test || exit 1

CMD ["node", "src/server.js"]
