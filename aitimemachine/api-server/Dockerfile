# syntax=docker/dockerfile:1.7
#
# AITM api-server — production image.
#
# Build context MUST be the aitimemachine root (the dir containing
# scripts/build-engines.sh and the vendored engine repos), because the
# api-server depends on first-party engines built from sibling directories
# (gitnexus, gitnexus-shared, a2a, context7, beads, git, pal-mcp-server) and
# resolves them via `file:../` package references.
#
#   docker build -f api-server/Dockerfile -t aitm-api .
#
# Stage 1 (engine-builder) compiles the bundled engines + TS libs.
# Stage 2 (runtime) ships only the built artifacts on a slim base.

# ──────────────────────────────────────────────────────────────────────────
# Stage 1: engine-builder
# Toolchains: Go 1.26 (beads, CGO), C build-essential (vendored git),
# python3 (pal venv), node 20 (TS engines + api-server build).
# ──────────────────────────────────────────────────────────────────────────
FROM golang:1.26-bookworm AS engine-builder

# Node 20 (NodeSource) + python3 + C toolchain + ICU dev (beads CGO links libicu).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        gettext \
        git \
        libicu-dev \
        libcurl4-openssl-dev \
        libssl-dev \
        libexpat1-dev \
        zlib1g-dev \
        python3 \
        python3-venv \
        python3-pip; \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
    apt-get install -y --no-install-recommends nodejs; \
    rm -rf /var/lib/apt/lists/*

ENV CGO_ENABLED=1 \
    PAL_VENV_DIR=/app/engines/pal

WORKDIR /app

# Copy the full aitimemachine tree (vendored engines + api-server + scripts).
# .dockerignore strips node_modules, dist, caches, and other build cruft so
# the engines are compiled cleanly from source.
COPY . .

# Build every first-party engine:
#   bin/bd (beads, Go+CGO), bin/git (vendored C), engines/pal (Python venv),
#   and the TS libs (gitnexus, gitnexus-shared, @upstash/context7-sdk, @a2a-js/sdk).
# Then install + build the api-server itself against those local file: deps.
RUN set -eux; \
    bash scripts/build-engines.sh; \
    npm --prefix api-server ci; \
    npm --prefix api-server run build; \
    npm --prefix api-server prune --omit=dev

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# Slim node 20 + python3 + runtime ICU/git shared libs only.
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

# Runtime libraries: python3 for pal venv, libicu for beads, git runtime deps
# (libcurl/zlib/openssl/expat) for the bundled vendored git binary.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        libicu72 \
        libcurl4 \
        libexpat1 \
        zlib1g; \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001

# First-party engine env defaults — bundled paths, NO *_URL service seams.
# (Engines run in-process or as AITM-managed subprocesses.)
ENV AITM_ENGINES_ROOT=/app \
    BEADS_BINARY=/app/bin/bd \
    AITM_GIT_BIN=/app/bin/git \
    PAL_VENV_DIR=/app/engines/pal \
    PAL_PYTHON=/app/engines/pal/bin/python3

WORKDIR /app

# Bundled engine binaries + Python venv (built in stage 1).
COPY --from=engine-builder /app/bin ./bin
COPY --from=engine-builder /app/engines ./engines

# Built TS engine libraries resolved by the api-server's file: deps.
COPY --from=engine-builder /app/gitnexus ./gitnexus
COPY --from=engine-builder /app/gitnexus-shared ./gitnexus-shared
COPY --from=engine-builder /app/a2a ./a2a
COPY --from=engine-builder /app/context7 ./context7

# api-server: production node_modules + compiled dist + migrations.
COPY --from=engine-builder /app/api-server/node_modules ./api-server/node_modules
COPY --from=engine-builder /app/api-server/dist ./api-server/dist
COPY --from=engine-builder /app/api-server/drizzle ./api-server/drizzle
COPY --from=engine-builder /app/api-server/package.json ./api-server/package.json

# Drop privileges (node:20-slim ships a `node` user).
RUN chown -R node:node /app
USER node

WORKDIR /app/api-server

EXPOSE 3001

# Liveness: the provider health report covers each bundled engine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health/providers',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
