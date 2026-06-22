# Audit Checklist (Launch Readiness)

This checklist is meant to be executed as a repeatable “startup-style” audit pass: verify the user flow end-to-end, confirm expected network calls + auth, and check that the UI has no dead-ends.

Status legend: `PASS`, `FAIL`, `N/A`, `FOLLOWUP`

## 1) Gitgram Core Web Flows

### Auth
- [ ] `GET /` loads unauthenticated and routes to login/signup actions (`PASS|FAIL`)
- [ ] Register with email/password creates account, stores tokens, routes to onboarding (`PASS|FAIL`)
- [ ] Login with email/password routes to `/feed` (`PASS|FAIL`)
- [ ] OAuth GitHub callback (`/auth/github/callback`) stores tokens and routes to onboarding for new users (`PASS|FAIL`)
- [ ] OAuth Google callback (`/auth/google/callback`) stores tokens and routes to onboarding for new users (`PASS|FAIL`)
- [ ] Logout clears local state and returns to `/` (`PASS|FAIL`)

### Onboarding
- [ ] `/onboarding/welcome` has a clear next action to interests/follow (`PASS|FAIL`)
- [ ] `/onboarding/interests` persists interests to backend and updates stored user state (`PASS|FAIL`)
- [ ] `/onboarding/follow` suggests accounts and persists follows (`PASS|FAIL`)
- [ ] First-time empty feed redirects to onboarding once (no loop) (`PASS|FAIL`)

### Feed + Social
- [ ] `/feed` loads posts, handles empty state, can like/unlike (`PASS|FAIL`)
- [ ] Follow/unfollow flows update counts and feed suggestions (`PASS|FAIL`)
- [ ] Search (`/search`) returns results for repos/people/posts/hashtags (`PASS|FAIL`)
- [ ] Trending pages show meaningful content or a non-empty placeholder (`PASS|FAIL`)

### Create Content
- [ ] Create post (`/create`) upload validation errors are user-friendly (`PASS|FAIL`)
- [ ] Create story (`/story/create`) upload validation errors are user-friendly (`PASS|FAIL`)
- [ ] Create reel (`/reel/create`) upload validation errors are user-friendly (`PASS|FAIL`)
- [ ] Media uploads hit the configured API base (no hardcoded localhost) (`PASS|FAIL`)

### Repo Profile + Account Switching
- [ ] Repository profile page loads in production base URL (`PASS|FAIL`)
- [ ] Account switcher lists accounts + switches successfully (`PASS|FAIL`)

### Moderation/Admin
- [ ] Report flow exists from content UI and creates a report (`PASS|FAIL`)
- [ ] Moderation queue (`/admin/moderation`) loads for moderators/admins and is blocked for normal users (`PASS|FAIL`)
- [ ] Enforcement actions (remove content / suspend user) are audited (`PASS|FAIL`)

## 2) AITM Flows

### Website Signup + Keys
- [ ] Sign up / sign in works in local/dev (`PASS|FAIL`)
- [ ] API keys page: create key shows secret once; list does not expose full secret (`PASS|FAIL`)
- [ ] Key revoke works and blocks API usage (`PASS|FAIL`)

### CLI Auth + Capture
- [ ] `aitm login --api-key ...` persists auth and `aitm whoami` returns expected user (`PASS|FAIL`)
- [ ] `aitm init` initializes a project and creates a checkpoint (`PASS|FAIL`)
- [ ] Capture path enforces consent where required (`PASS|FAIL`)

### Timeline + Restore
- [ ] Timeline UI loads and filters work (`PASS|FAIL`)
- [ ] Restore preview shows scoped diff summary (`PASS|FAIL`)
- [ ] Restore apply requires confirmation and is reversible (`PASS|FAIL`)

### Webhooks
- [ ] Webhooks list/create/enable-disable/delete all hit real API endpoints (`PASS|FAIL`)
- [ ] Deliveries page loads and retry works (no “simulate success”) (`PASS|FAIL`)

### Export/Consent
- [ ] Export endpoints are gated by consent and traceability IDs are present (`PASS|FAIL`)
- [ ] Exported artifacts are redacted per policy (`PASS|FAIL`)

## 3) Docs Correctness Sweep

### Ops/Runbook
- [ ] `docs/runbook.md` local ports match compose (`PASS|FAIL`)
- [ ] `docs/ops-quickref.md` commands match current health endpoints (`PASS|FAIL`)
- [ ] Deploy docs reference current workflows (`PASS|FAIL`)

### Env/Secrets
- [ ] `docs/environment-matrix.md` matches `.env.*.example` files (`PASS|FAIL`)
- [ ] `docs/secrets-contract.md` lists all required third-party keys + rotation owners (`PASS|FAIL`)

### Install Guides
- [ ] Gitgram web docs use `:3000` and backend `:4000` (`PASS|FAIL`)
- [ ] AITM Quickstart reflects current CLI commands (`aitm setup --global` semantics, MCP install) (`PASS|FAIL`)
- [ ] MCP install instructions work with `npx` (no monorepo assumptions) (`PASS|FAIL`)

