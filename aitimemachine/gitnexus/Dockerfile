# syntax=docker/dockerfile:1.7
#
# GitNexus — code intelligence HTTP/MCP server (production image).
#
# Build context MUST be the aitimemachine root, because gitnexus' build.js
# compiles and inlines the sibling `gitnexus-shared` package resolved via
# `file:../gitnexus-shared`:
#
#   docker build -f gitnexus/Dockerfile -t gitnexus .
#
# Stage 1 (builder) compiles the native tree-sitter grammars + the TS library.
# Stage 2 (runtime) runs the CLI `serve` command over HTTP on port 3010.

# ──────────────────────────────────────────────────────────────────────────
# Stage 1: builder
# node:22 (gitnexus requires node >=22) + python3 / make / g++ for the native
# tree-sitter grammar builds (node-gyp). Mirrors gitnexus/Dockerfile.test.
# ──────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

RUN set -eux; \
    apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        make \
        g++; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# gitnexus' build.js runs tsc with cwd=gitnexus-shared, so the shared package
# needs its own node_modules/.bin/tsc. Copy both engine sources.
COPY gitnexus-shared ./gitnexus-shared
COPY gitnexus ./gitnexus

# 1. gitnexus-shared deps (provides tsc for build.js step 1).
RUN set -eux; \
    cd /app/gitnexus-shared; \
    npm install --no-audit --no-fund

# 2. gitnexus deps — native tree-sitter grammars compile during install via
#    node-gyp; rebuild any that need an explicit pass (see Dockerfile.test).
RUN set -eux; \
    cd /app/gitnexus; \
    npm install --no-audit --no-fund --ignore-scripts; \
    npm rebuild 2>&1 || true; \
    npm rebuild tree-sitter-swift 2>&1 || true; \
    if [ -d node_modules/tree-sitter-kotlin ]; then \
        (cd node_modules/tree-sitter-kotlin && npx --yes node-gyp rebuild 2>&1 || true); \
    fi

# 3. Build the TS library (compiles gitnexus-shared + gitnexus, inlines the
#    shared dist). gitnexus-web is absent from the context → that step is
#    skipped by build.js, and run the grammar postinstall builder explicitly.
RUN set -eux; \
    cd /app/gitnexus; \
    node scripts/build-tree-sitter-grammars.cjs 2>&1 || true; \
    node scripts/build.js

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# ──────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3010

WORKDIR /app

# The runtime serves via `tsx src/cli/index.ts serve`, so ship the full source
# tree + node_modules (tsx + native grammars) from the builder.
COPY --from=builder /app/gitnexus ./gitnexus
COPY --from=builder /app/gitnexus-shared ./gitnexus-shared

RUN chown -R node:node /app
USER node

WORKDIR /app/gitnexus

EXPOSE 3010

# gitnexus exposes /api/health; the compose healthcheck tolerates other paths.
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3010)+'/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# serve defaults to port 4747 / host localhost; bind 0.0.0.0 on PORT for the
# container so the published port and healthcheck reach it.
CMD ["sh", "-c", "npx tsx src/cli/index.ts serve --port ${PORT:-3010} --host 0.0.0.0"]
