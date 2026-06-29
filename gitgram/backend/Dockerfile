# syntax=docker/dockerfile:1
#
# gitgram backend — production image on a glibc (Debian) base.
#
# A glibc base (not Alpine/musl) is required because @tensorflow/tfjs-node ships
# prebuilt native binaries that link the glibc dynamic loader (ld-linux) and
# libtensorflow; on Alpine they fail to dlopen. node:20-bookworm-slim provides
# the loader + shared libs, so NSFW detection runs for real (no stubbing).

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Toolchain for native modules + Prisma/openssl + tfjs postinstall (curl/ca-certs
# to download libtensorflow, python3/make/g++ for node-gyp builds).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* tsconfig.json ./

# Full install WITH lifecycle scripts so @tensorflow/tfjs-node downloads its
# native libtensorflow binary for this platform.
RUN npm install --no-audit --no-fund

COPY . .

RUN npx prisma generate
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Runtime libs: ffmpeg/ffprobe for video thumbnails, openssl for Prisma,
# libgomp1 for tfjs-node's OpenMP runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg openssl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

# Reuse the builder's fully-installed node_modules (tfjs native binary + devDeps
# such as swagger-ui-express that the NODE_ENV=development compose run enables),
# plus the compiled output and Prisma client/schema.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Non-root user + writable runtime dirs (winston file transport writes /app/logs).
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nodejs \
    && mkdir -p /app/logs /app/uploads && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 4000) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
