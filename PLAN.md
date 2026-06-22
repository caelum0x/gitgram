# gitgram-ai Development Plan

Last updated: 2026-03-02

## Current State

Both products are feature-complete for v1 and compile/build clean. A monorepo cleanup session on 2026-03-02 resolved significant code hygiene debt. Neither product is publicly usable yet due to operational blockers.

### What Was Fixed (2026-03-02 Cleanup)

| Area | Change | Impact |
|------|--------|--------|
| Gitgram markdown clutter | Deleted 121 .md + 8 .txt status files | Repo is navigable |
| AITM markdown clutter | Deleted 46 status .md files | Repo is navigable |
| Legacy route duplication | Removed 17 `/api/` routes duplicating `/api/v1/` | Halved attack surface |
| console.* sprawl | Replaced ~52 calls with Winston logger (10 files) | Structured logging |
| socketService deprecation | Full migration to useSocket hook; service deleted | Clean React patterns |
| @types misconfig | Moved 5 @types packages to devDependencies | Correct dependency graph |
| AITM disk-full handling | Atomic write + ENOSPC catch in ContentStore.put() | Data safety |
| MCP rate limiting | Sliding-window limiter (5-120/min per tool) | Abuse prevention |
| API response helpers | sendSuccess/sendError/sendPaginated created | Consistency foundation |

### What Was Fixed (2026-03-02 Follow-up: Tasks #9-#11)

| Area | Change | Impact |
|------|--------|--------|
| AITM API URL alignment | Fixed mismatched endpoints in backend AITM service (`/restore/projects`, `/time/diff`, `/context/:id`) | Prevents integration 404s |
| Abuse detection state | Migrated spam guard stores to `RedisHashStore` with in-memory fallback | Multi-instance readiness with dev safety fallback |
| TypeScript strict mode | Confirmed `strict: true` in backend `tsconfig.json` and clean compile | Type-safety enforcement active |

### What's Still Broken

| Issue | Product | Severity | Est. Effort |
|-------|---------|----------|-------------|
| CLI/MCP not on npm | AITM | **Blocker** | 1-2 hours |
| No production secrets configured | Both | **Blocker** | 2-4 hours |
| localStorage for JWT tokens | Gitgram | High | 4-6 hours |
| cli-v2.ts mega-file (4,381 LOC) | AITM | High | 4-6 hours |
| Zero web/mobile tests | Gitgram | High | Multi-day |
| 839 uses of `any` | AITM | High | 8-12 hours |
| Cross-product linking | Both | Medium | Multi-week |

---

## Phase 3: Launch Unblockers (Next Session)

Goal: Make both products usable by real humans.

### 3.1 Publish AITM to npm (Blocker #1)
- Verify `package.json` metadata (name, version, bin, files, repository)
- Run `npm pack` and inspect tarball contents
- Publish `aitimemachine` CLI to npm
- Publish MCP server package to npm
- Verify `npm install -g aitimemachine && aitm --version` works
- Update website install instructions if needed

### 3.2 Configure production secrets (Blocker #2)
- Create GitHub OAuth App (Client ID + Secret)
- Create Google OAuth credentials
- Set up Polar.sh keys (access token + webhook secret + product IDs)
- Verify Resend email service (domain + API key)
- Set up Clerk production instance for AITM
- Set up Polar.sh billing keys for AITM
- Configure Sentry DSNs for error tracking (both products)
- Document all keys in `.env.example` files

### 3.3 Deploy infrastructure
- Provision Hetzner VPS (run `deploy/setup-hetzner.sh`)
- Configure Cloudflare DNS (gitgram.app, timemachine.gitgram.app, timemachine-api.gitgram.app)
- Fill production `.env` files from templates
- Run `docker compose -f docker-compose.prod.yml up -d`
- Verify health endpoints respond
- Set up UptimeRobot monitoring

### 3.4 End-to-end smoke test
- AITM: `npm install -g` -> `aitm init` -> `aitm checkpoint` -> dashboard shows real data
- Gitgram: signup -> GitHub OAuth -> create post -> comment -> notification

---

## Phase 4: Security Hardening (~1 week)

### 4.1 Migrate JWT storage to httpOnly cookies
- Backend: Set tokens via `Set-Cookie` with `httpOnly`, `secure`, `sameSite=strict`
- Frontend: Remove `localStorage.getItem('token')` pattern
- Update API client to stop sending `Authorization` header (cookies auto-sent)
- Update CORS config for credential passing
- Test: full auth flow, refresh token rotation, logout

### 4.2 Move abuse detection to Redis (Completed 2026-03-02)
- Replace in-memory Maps with Redis sorted sets
- Key pattern: `abuse:{userId}:{action}` with TTL-based expiry
- Works across multiple backend instances
- Preserve existing threshold configs

### 4.3 Validate AITM callback URLs
- Whitelist allowed OAuth redirect URIs
- Reject open redirect attempts
- Add state parameter CSRF validation to browser login flow

---

## Phase 5: Code Quality (~2 weeks)

### 5.1 Enable TypeScript strict mode in Gitgram backend (Completed 2026-03-02)
- Set `strict: true` in `tsconfig.json`
- Fix errors file-by-file (prioritize controllers > services > utils)
- Target: eliminate 1,070 uses of `any`

### 5.2 Break up AITM cli-v2.ts
- Create `src/commands/` directory
- Extract each command group into its own module (checkpoint.ts, restore.ts, search.ts, etc.)
- cli-v2.ts becomes a thin shell that registers commands
- Target: no file > 300 LOC

### 5.3 Add frontend test coverage
- Set up Vitest + Testing Library for Gitgram web
- Write tests for auth flows, post creation, notification rendering
- Set up Playwright for critical path E2E tests
- CI: run tests on PR

### 5.4 Finish API response helper migration (AITM)
- Apply `sendSuccess`/`sendError`/`sendPaginated` to all remaining routes
- Remove ad-hoc response shapes
- Update API docs/Swagger

---

## Phase 6: Cross-Product Integration (~3 weeks)

### 6.1 Link gitgram posts to AITM checkpoints
- Add `checkpointRef` field to Gitgram Post model
- Create "Change Story" post type (auto-generated from AITM diffs)
- API: `POST /api/v1/posts` accepts optional `aitm_checkpoint_id`
- UI: "Share as post" button in AITM timeline

### 6.2 Semantic search for AITM
- Add embedding generation on checkpoint creation (OpenAI or local model)
- Store embeddings in pgvector column
- API: `POST /api/search/semantic` with cosine similarity ranking
- CLI: `aitm search --semantic "when did I add auth?"`

### 6.3 AITM automatic GC
- Schedule GC worker (daily cron)
- Configurable retention: keep last N checkpoints, or last N days
- Clean orphaned blobs after checkpoint deletion
- User-facing storage usage dashboard

---

## Operational Checklist (Pre-Launch)

- [ ] npm packages published (aitimemachine, MCP server)
- [ ] Production VPS provisioned and Docker running
- [ ] DNS configured (both domains)
- [ ] All production secrets in `.env`
- [ ] Health endpoints verified (`/health` returns 200)
- [ ] Error tracking live (Sentry)
- [ ] Analytics live (PostHog or Plausible)
- [ ] Uptime monitoring configured
- [ ] SSL certificates active (Cloudflare)
- [ ] Backup strategy for Postgres (Neon auto-backup or pg_dump cron)
- [ ] End-to-end smoke test passes for both products
