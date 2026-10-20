# AZKELL FLEET — imagen de producción (Coolify: Build Pack "Dockerfile", puerto 3000)
# Un solo contenedor: server.js entrega la versión actual en / y la app nueva compilada en /app.
#
# Se usa la imagen oficial de Node (Debian, glibc) y no Nixpacks: con Nixpacks, npm no instala
# los binarios nativos de Linux que necesita Vite 8 (rolldown) y además trae Node 22.11 (< 22.12).

FROM node:22-bookworm-slim AS base
WORKDIR /app

# ─── 1. Compilar la app nueva ────────────────────────────────
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:app
# Sitios públicos: azkell.com (cartera) y fleet.azkell.com (producto). Salen en dist/sitios.
RUN npm run build:sitios
# Pantalla de TV (/tv). Sale en dist/tv-app.
RUN npm run build:tv

# ─── 2. Imagen final ─────────────────────────────────────────
FROM base AS run
ENV NODE_ENV=production
# curl: para el healthcheck de Coolify
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
COPY --from=build /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=4 \
  CMD curl -fsS http://localhost:${PORT:-3000}/api/ping || exit 1

CMD ["npm", "start"]
