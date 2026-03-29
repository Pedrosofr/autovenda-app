# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Instala dependencias (camada cacheada quando package.json nao muda)
COPY package*.json ./
RUN npm ci

# Copia codigo e faz o build do frontend
COPY . .
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# Instala tsx globalmente para executar TypeScript
RUN npm install -g tsx

# Dependencias de producao (node_modules completo — necessario pois
# sinesp-api e outros packages sao usados no servidor)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Frontend compilado
COPY --from=builder /app/dist ./dist

# Codigo TypeScript do servidor
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib/app-state.ts ./src/lib/app-state.ts
COPY --from=builder /app/src/lib/fipe.ts ./src/lib/fipe.ts
COPY --from=builder /app/src/store/types.ts ./src/store/types.ts
COPY --from=builder /app/tsconfig*.json ./

# Pasta de dados persistente (mapeada como volume no Railway)
RUN mkdir -p data

ENV NODE_ENV=production

# Railway injeta PORT automaticamente
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:${PORT:-8080}/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["tsx", "server/prod.ts"]
