# gitgram-ai Prioritized Engineering Tickets (v1)

Last updated: 2026-03-02
Source: `SINGLE_SOURCE_PLAN.md`

## Conventions

- Priority: `P0` blocker, `P1` high, `P2` medium, `P3` growth
- Estimate scale: `S` (0.5-1 day), `M` (1-3 days), `L` (3-5 days), `XL` (5+ days)
- Owner is a role placeholder for assignment

## P0 - Launch Blockers

### GGAI-001 - Publish AITM CLI to npm
- Priority: P0
- Owner: AITM Backend Engineer
- Estimate: M
- Dependencies: None
- Scope:
  - Verify CLI package metadata (`name`, `version`, `bin`, `files`, `repository`)
  - Run `npm pack` and inspect tarball
  - Publish package
  - Validate global install and command boot
- Acceptance criteria:
  - `npm install -g <aitm-cli-package>` succeeds on clean environment
  - `aitm --version` returns published version
  - Package includes required runtime files and excludes local-only artifacts

### GGAI-002 - Publish AITM MCP server package to npm
- Priority: P0
- Owner: AITM Backend Engineer
- Estimate: M
- Dependencies: GGAI-001
- Scope:
  - Verify package metadata and export entrypoints
  - Publish MCP server package
  - Validate install and startup command
- Acceptance criteria:
  - MCP package installs from npm without local path assumptions
  - Server starts and responds to a health/ping call
  - Package README install instructions are accurate

### GGAI-003 - Configure production secrets for both products
- Priority: P0
- Owner: DevOps Engineer
- Estimate: L
- Dependencies: None
- Scope:
  - Provision and store OAuth, billing, email, and error-tracking keys
  - Set secure values for Gitgram and AITM production environments
  - Align `.env.example` keys with actual runtime requirements
- Acceptance criteria:
  - All required env vars exist in production secret store
  - Services boot without missing-env startup errors
  - `.env.example` files are complete and current

### GGAI-004 - Deploy production baseline infrastructure
- Priority: P0
- Owner: DevOps Engineer
- Estimate: L
- Dependencies: GGAI-003
- Scope:
  - Provision VPS and system prerequisites
  - Configure DNS, TLS, and production compose stack
  - Configure uptime monitoring and baseline alerts
- Acceptance criteria:
  - Public domains resolve correctly
  - SSL/TLS active for all public endpoints
  - `docker compose -f docker-compose.prod.yml up -d` stable with healthy services
  - Monitoring shows green status for required endpoints

### GGAI-005 - Execute end-to-end smoke verification
- Priority: P0
- Owner: QA Engineer
- Estimate: M
- Dependencies: GGAI-001, GGAI-002, GGAI-004
- Scope:
  - Validate AITM install/init/checkpoint/timeline flow
  - Validate Gitgram signup/oauth/post/comment/notification flow
  - Record failures with logs and repro steps
- Acceptance criteria:
  - Both critical user journeys pass end-to-end in production-like environment
  - No blocker-severity defects remain open
  - Smoke test checklist is documented and repeatable

## P1 - Security Closure

### GGAI-006 - Migrate Gitgram JWT handling to httpOnly cookies
- Priority: P1
- Owner: Gitgram Full-Stack Engineer
- Estimate: L
- Dependencies: GGAI-005
- Scope:
  - Replace `localStorage` token flow with secure cookie flow
  - Update backend auth cookie issuance and frontend API client behavior
  - Update CORS and CSRF assumptions as needed
- Acceptance criteria:
  - No auth token persistence in `localStorage`
  - Login, refresh, and logout flows pass in browser validation
  - Cookies set with `httpOnly`, `secure`, and `sameSite` policy

### GGAI-007 - Harden AITM OAuth callback and redirect validation
- Priority: P1
- Owner: AITM Backend Engineer
- Estimate: M
- Dependencies: GGAI-005
- Scope:
  - Enforce allowlist for redirect URIs
  - Reject open redirects
  - Validate CSRF state parameter on OAuth callback path
- Acceptance criteria:
  - Open redirect attempts are rejected
  - Missing/invalid state values fail safely
  - Valid OAuth flows remain functional across supported providers

### GGAI-008 - Complete AITM API response helper migration
- Priority: P1
- Owner: AITM Backend Engineer
- Estimate: M
- Dependencies: GGAI-005
- Scope:
  - Apply `sendSuccess`, `sendError`, `sendPaginated` to remaining routes
  - Remove inconsistent ad-hoc response shapes
  - Update API docs/examples
- Acceptance criteria:
  - All AITM API routes use standardized response helpers
  - Error/status structure is consistent across endpoints
  - API docs reflect final response contracts

### GGAI-009 - Validate retention/delete/export audit workflows
- Priority: P1
- Owner: Security Engineer
- Estimate: M
- Dependencies: GGAI-003, GGAI-008
- Scope:
  - Execute staging tests for consent, retention policy, delete request, and export auditability
  - Confirm audit log completeness for restore/export/delete operations
- Acceptance criteria:
  - Each data governance path has a passing test record
  - Audit logs contain actor, action, timestamp, and trace identifiers
  - No critical compliance gaps remain in staging checklist

## P2 - Reliability and Code Quality

### GGAI-010 - Refactor AITM cli-v2.ts into modular command architecture
- Priority: P2
- Owner: AITM Backend Engineer
- Estimate: L
- Dependencies: GGAI-005
- Scope:
  - Extract command groups into `src/commands/*`
  - Keep root CLI file as registration/bootstrap shell
  - Preserve existing command UX and flags
- Acceptance criteria:
  - No single CLI file exceeds 300 LOC target
  - CLI behavior remains backward compatible for existing commands
  - Build and command smoke tests pass

### GGAI-011 - Reduce unsafe `any` usage on AITM critical paths
- Priority: P2
- Owner: AITM Backend Engineer
- Estimate: XL
- Dependencies: GGAI-010
- Scope:
  - Prioritize controllers and services for strict typing improvements
  - Introduce reusable DTO/types where repeated shapes exist
  - Avoid broad `as unknown as` type escapes
- Acceptance criteria:
  - Significant reduction of `any` usage in controller/service directories
  - TypeScript strict build remains clean
  - No runtime regressions in checkpoint/restore/search flows

### GGAI-012 - Add Gitgram frontend unit/integration test stack
- Priority: P2
- Owner: Frontend Engineer
- Estimate: L
- Dependencies: GGAI-006
- Scope:
  - Configure Vitest + Testing Library
  - Add tests for auth flows, post creation, notification rendering
  - Integrate into project scripts
- Acceptance criteria:
  - Tests run in CI and local environments
  - Core flows have deterministic passing tests
  - Failures produce actionable output

### GGAI-013 - Add Playwright critical-path E2E and CI gate
- Priority: P2
- Owner: QA Engineer
- Estimate: L
- Dependencies: GGAI-012
- Scope:
  - Implement E2E coverage for highest-risk user journeys
  - Add CI workflow gate for pull requests
  - Add retry/flakiness guardrails
- Acceptance criteria:
  - PR CI blocks on E2E failure for protected branches
  - E2E suite covers login, posting, and timeline-critical flows
  - Flakiness is below agreed threshold

## P3 - Cross-Product Integration and Growth

### GGAI-014 - Add checkpoint reference field to Gitgram posts
- Priority: P3
- Owner: Gitgram Backend Engineer
- Estimate: M
- Dependencies: GGAI-005
- Scope:
  - Add model/schema field for AITM checkpoint linkage
  - Extend create post API with optional checkpoint reference
  - Validate ownership and access permissions
- Acceptance criteria:
  - Post creation accepts and stores valid checkpoint reference
  - Unauthorized checkpoint linkage attempts are rejected
  - API docs include new field contract

### GGAI-015 - Ship AITM "Share as Post" flow
- Priority: P3
- Owner: Full-Stack Engineer
- Estimate: L
- Dependencies: GGAI-014
- Scope:
  - Add action in AITM timeline to publish linked content to Gitgram
  - Include metadata payload for checkpoint context and diff summary
  - Handle auth/session boundary between products
- Acceptance criteria:
  - User can publish from AITM timeline to Gitgram in one flow
  - Published post contains valid checkpoint linkage and preview content
  - Error handling covers auth failure and unavailable target service

### GGAI-016 - Implement "Change Story" post type from AITM diffs
- Priority: P3
- Owner: Full-Stack Engineer
- Estimate: L
- Dependencies: GGAI-015
- Scope:
  - Define post subtype and rendering format for before/after diff narratives
  - Generate summary payload from checkpoint diffs
  - Add UI treatment in feed and repository profile views
- Acceptance criteria:
  - Change Story posts render with consistent schema and UI
  - Diff-backed story content links to source checkpoint data
  - Feed interactions (comment/react/share) work unchanged

### GGAI-017 - Launch unified trend ranking (GitHub + platform signals)
- Priority: P3
- Owner: Data Engineer
- Estimate: L
- Dependencies: GGAI-016
- Scope:
  - Build ranking formula combining repository activity and social engagement
  - Add score computation job and API exposure
  - Add basic anti-gaming controls
- Acceptance criteria:
  - Trending endpoint returns deterministic ranked results
  - Ranking inputs are documented and observable
  - No critical abuse vector in initial review

### GGAI-018 - Add AITM semantic search over code/checkpoint history
- Priority: P3
- Owner: AITM Backend Engineer
- Estimate: XL
- Dependencies: GGAI-011
- Scope:
  - Generate embeddings at checkpoint creation
  - Store vectors and serve semantic retrieval API
  - Expose CLI/query interface for semantic search
- Acceptance criteria:
  - Semantic query returns ranked relevant checkpoint results
  - Performance meets agreed p95 threshold for target corpus size
  - Relevance passes internal benchmark gate

### GGAI-019 - Implement training export pipeline with consent, redaction, audit
- Priority: P3
- Owner: Security Engineer
- Estimate: XL
- Dependencies: GGAI-009
- Scope:
  - Enforce opt-in consent checks prior to export jobs
  - Run redaction pipeline before data leaves operational storage
  - Persist full export lineage and audit metadata
- Acceptance criteria:
  - Exports fail closed without valid consent
  - Redaction pipeline executes and produces measurable precision/recall report
  - Every export has traceable consent ID and audit record

### GGAI-020 - Creator workflow tools for repository owners
- Priority: P3
- Owner: Product Engineer
- Estimate: L
- Dependencies: GGAI-016
- Scope:
  - Add story/reel workflow tooling around code change events
  - Provide templates for explainable dev content
  - Instrument adoption analytics
- Acceptance criteria:
  - Repo owners can create and publish creator-format content from product UI
  - Workflow usage metrics are captured and queryable
  - No regression in existing post creation flows

## Suggested Sprint Packaging

- Sprint 1: GGAI-001 to GGAI-005
- Sprint 2: GGAI-006 to GGAI-009
- Sprint 3: GGAI-010 to GGAI-013
- Sprint 4+: GGAI-014 onward by product strategy and capacity

