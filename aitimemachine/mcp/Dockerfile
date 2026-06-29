# syntax=docker/dockerfile:1.7
#
# AITM MCP server — production image.
#
# Build context MUST be the aitimemachine root (the dir containing the root
# @gitgram/timemachine package + the gitnexus / gitnexus-shared engine repos),
# because the mcp server resolves several siblings via `file:../` references:
#   - @gitgram/timemachine  → the repo root package (NOT published to npm)
#   - gitnexus              → file:../gitnexus
#   - gitnexus-shared       → file:../gitnexus-shared
#
#   docker build -f mcp/Dockerfile -t aitm-mcp .
#
# Stage 1 (builder) compiles gitnexus-shared, gitnexus (native tree-sitter),
# the root @gitgram/timemachine library, then the mcp server itself.
# Stage 2 (runtime) ships only the built artifacts on a slim base.

# ──────────────────────────────────────────────────────────────────────────
# Stage 1: builder
# node:20 + python3 / make / g++ for gitnexus' native tree-sitter grammars.
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN set -eux; \
    apt-get -o Acquire::Check-Valid-Until=false update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        make \
        g++; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the engine sources the mcp build depends on (siblings + root package).
# .dockerignore strips node_modules/dist/etc so everything is built from source.
COPY gitnexus-shared ./gitnexus-shared
COPY gitnexus ./gitnexus
COPY package.json ./package.json
COPY tsconfig*.json ./
COPY src ./src
COPY mcp ./mcp

# 1. gitnexus-shared: needs its own tsc (gitnexus' build.js runs tsc with
#    cwd=gitnexus-shared, resolving node_modules/.bin/tsc there).
RUN set -eux; \
    cd /app/gitnexus-shared; \
    npm install --no-audit --no-fund

# 2. gitnexus: install deps (native tree-sitter compiles via node-gyp during
#    install) then build (build.js compiles gitnexus-shared + gitnexus and
#    inlines the shared dist). gitnexus-web is absent → that step is skipped.
RUN set -eux; \
    cd /app/gitnexus; \
    npm install --no-audit --no-fund; \
    npm rebuild 2>&1 || true; \
    node scripts/build.js

# 3. Root @gitgram/timemachine library (tsc → lib/). This is the package the
#    mcp server imports as "@gitgram/timemachine"; it is not on the registry.
#    The root has pre-existing type errors in files the mcp never loads at
#    runtime (api-server.ts, server/cli-endpoints.ts). tsc has noEmitOnError
#    unset, so it still emits lib/ JS — tolerate the non-zero exit, then assert
#    the runtime entrypoints the mcp imports actually compiled.
RUN set -eux; \
    cd /app; \
    npm install --no-audit --no-fund --ignore-scripts; \
    (npx tsc || true); \
    test -f lib/core/index.js; \
    test -f lib/server/session-server.js

# 4. mcp server: rewrite the unpublished @gitgram/timemachine dep to a local
#    file: ref, then install with --install-links so npm COPIES the file: engine
#    deps (gitnexus, gitnexus-shared, @gitgram/timemachine root) into
#    mcp/node_modules as real, self-contained directories (instead of symlinks
#    into sibling dirs) — making mcp/node_modules the only thing the runtime
#    stage needs. better-sqlite3 (a root-pkg dep) compiles here via node-gyp.
#    Finally compile the mcp TS (tsc).
RUN set -eux; \
    cd /app/mcp; \
    node -e "const fs=require('fs');const p=require('./package.json');p.dependencies['@gitgram/timemachine']='file:..';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"; \
    npm install --no-audit --no-fund --install-links; \
    npm run build

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3003

WORKDIR /app

# mcp build output + its resolved node_modules (which already contains the
# copied file: engine deps and the npm-installed siblings).
COPY --from=builder /app/mcp/dist ./mcp/dist
COPY --from=builder /app/mcp/node_modules ./mcp/node_modules
COPY --from=builder /app/mcp/package.json ./mcp/package.json

RUN chown -R node:node /app
USER node

WORKDIR /app/mcp

EXPOSE 3003

# /health is unauthenticated on the HTTP transport.
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3003)+'/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# The MCP server selects HTTP transport via CLI flags (no PORT-env auto-start).
CMD ["sh", "-c", "node dist/index.js --transport http --port ${PORT:-3003}"]
