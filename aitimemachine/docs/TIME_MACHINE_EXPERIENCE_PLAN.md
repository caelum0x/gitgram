# AI Time Machine Experience Plan

> **Goal**: Make AITimeMachine work like macOS Time Machine for AI coding - the AI can go back in time, see what changed, undo mistakes, and restore specific files.
Canonical reference: `../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`.
Execution backlog reference: `../../V1_90_DAY_BACKLOG.md`.

Planning note:
- This file is a historical plan snapshot.
- Active execution priorities and acceptance criteria are tracked in `../../V1_90_DAY_BACKLOG.md`.

---

  Current State
  ┌───────────────────┬──────────────────────────────────┐
  │     Component     │              Status              │
  ├───────────────────┼──────────────────────────────────┤
  │ CLI/MCP Core      │ ✅ Production Ready (30+ tools)  │
  ├───────────────────┼──────────────────────────────────┤
  │ API Server        │ ✅ Mostly Ready (11 endpoints)   │
  ├───────────────────┼──────────────────────────────────┤
  │ Website/Dashboard │ ✅ UI Complete (needs real data) │
  ├───────────────────┼──────────────────────────────────┤
  │ Authentication    │ 🟡 Partial (missing OAuth)       │
  ├───────────────────┼──────────────────────────────────┤
  │ Billing           │ 🟡 Partial (quotas not enforced) │
  ├───────────────────┼──────────────────────────────────┤
  │ Team Features     │ ❌ Not Started                   │
  └───────────────────┴──────────────────────────────────┘
  What's Left - Priority Order

  Phase 1: Production Critical (Week 1)

  1. OAuth Providers - Enable GitHub/Google login in Clerk
  2. Rate Limiting - Per API key limits based on plan
  3. Quota Enforcement - Storage + API request limits
  4. Monitoring - Sentry + health checks

  Phase 2: Security & Polish (Week 2)

  1. Scoped API Keys - read/write/admin permissions
  2. IP Allowlisting - Enterprise security
  3. Webhook Reliability - Retry logic, delivery logs
  4. Session Management - List/revoke sessions

  Phase 3: Dashboard Enhancement (Week 2-3)

  1. Connect Real Data - Replace mock data with API calls
  2. Advanced Analytics - Breakdown by project/endpoint
  3. Audit Log UI - View security events
  4. Export Features - CSV download

  Phase 4: Team Features (Week 3-4)

  1. Organizations - Create/manage orgs
  2. Member Invitations - Invite team members
  3. Shared Checkpoints - Collaborate on states
  4. Admin Dashboard - Team management
  5. SSO/SAML - Enterprise auth

  Quick Wins (Today)

  1. Enable GitHub OAuth in Clerk dashboard - 10 min
  2. Add health check endpoint - 15 min
  3. Add Sentry error tracking - 20 min
  4. Connect dashboard pages to real APIs - 30 min each
