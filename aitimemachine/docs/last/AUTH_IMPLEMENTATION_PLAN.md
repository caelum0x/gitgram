# AITimeMachine Authentication Implementation Plan

## Overview

Web-based authentication where users sign up/login on the AITimeMachine website, then use tokens to authenticate CLI, MCP, and API.

## Auth Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTH FLOW                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. USER SIGNS UP/LOGS IN ON WEBSITE                               │
│     ┌──────────┐      ┌──────────────┐      ┌─────────────┐        │
│     │ Website  │─────▶│ Auth Provider│─────▶│ User Created│        │
│     │ (Next.js)│      │ (Clerk/      │      │ + JWT Token │        │
│     │          │      │  BetterAuth) │      │             │        │
│     └──────────┘      └──────────────┘      └─────────────┘        │
│                                                                     │
│  2. USER GETS API KEY FROM WEBSITE DASHBOARD                       │
│     ┌──────────┐      ┌──────────────┐      ┌─────────────┐        │
│     │ Dashboard│─────▶│ Generate Key │─────▶│ aitm_xxxxx  │        │
│     │ /settings│      │ (stored hash)│      │ (copy once) │        │
│     └──────────┘      └──────────────┘      └─────────────┘        │
│                                                                     │
│  3. CLI/MCP AUTHENTICATES                                          │
│     ┌──────────┐      ┌──────────────┐      ┌─────────────┐        │
│     │ aitm     │─────▶│ API Server   │─────▶│ Validated   │        │
│     │ login    │      │ /auth/verify │      │ User Context│        │
│     └──────────┘      └──────────────┘      └─────────────┘        │
│                                                                     │
│  4. ALL REQUESTS INCLUDE AUTH                                      │
│     Header: Authorization: Bearer <jwt>                            │
│     OR                                                              │
│     Header: X-API-Key: aitm_xxxxx                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Choose Auth Provider

**Option A: Clerk** (Recommended for speed)
- Pros: Hosted, easy setup, good React SDK, handles everything
- Cons: Paid after free tier, vendor lock-in
- Setup: `npm install @clerk/nextjs`

**Option B: Better Auth** (Recommended for control)
- Pros: Self-hosted, open source, flexible
- Cons: More setup work
- Setup: `npm install better-auth`

**Option C: NextAuth.js + Custom**
- Pros: Very flexible, well-known
- Cons: More code to write

**Decision: Start with Clerk for MVP, can migrate later**

---

### Step 2: Website Auth Setup

```
website/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── dashboard/
│   │   ├── page.tsx           # User dashboard
│   │   └── api-keys/page.tsx  # Generate/manage API keys
│   └── api/
│       ├── auth/
│       │   └── webhook/route.ts  # Clerk webhook for user sync
│       └── keys/
│           ├── generate/route.ts # Generate new API key
│           └── revoke/route.ts   # Revoke API key
├── lib/
│   └── auth.ts               # Auth utilities
└── middleware.ts             # Protect routes
```

---

### Step 3: API Key System

**Database Schema (Neon):**
```sql
-- Users table (synced from Clerk via webhook)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- Clerk user ID
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys table
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_hash TEXT NOT NULL,        -- SHA-256 hash of key
  key_prefix TEXT NOT NULL,      -- First 8 chars for identification
  name TEXT,                     -- User-given name
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  UNIQUE(key_hash)
);

-- Index for fast lookups
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

**API Key Format:** `aitm_live_xxxxxxxxxxxxxxxxxxxx` (32 random chars)

---

### Step 4: CLI Authentication

**New CLI Commands:**
```bash
# Browser-based login (opens browser, waits for callback)
aitm login

# Login with API key directly
aitm login --api-key aitm_live_xxxxx

# Check current auth status
aitm whoami

# Logout (clear stored credentials)
aitm logout
```

**Credential Storage:**
```
~/.aitimemachine/
└── auth.json
    {
      "apiKey": "aitm_live_xxxxx",
      "userId": "user_xxxxx",
      "email": "user@example.com"
    }
```

**Browser Login Flow:**
1. CLI starts local server on random port (e.g., 54321)
2. Opens browser to `https://timemachine.gitgram.app/cli-auth?port=54321`
3. User logs in on website
4. Website redirects to `http://localhost:54321/callback?token=xxx`
5. CLI receives token, stores credentials, closes server

---

### Step 5: API Server Auth Middleware

**File: `src/auth/middleware.ts`**
```typescript
// Validates JWT or API key on every request
// Attaches user context to request
// Returns 401 if invalid
```

**Protected Routes:**
- All `/api/*` routes require auth
- Exception: `/api/health`, `/api/auth/verify`

---

### Step 6: MCP Server Auth

**MCP needs to authenticate too:**
1. On first MCP tool call, check for stored credentials
2. If no credentials, prompt user to run `aitm login`
3. Include credentials in all API calls to backend

---

### Step 7: Multi-tenant Data Isolation

**After auth is working, update all queries:**
```typescript
// Before (INSECURE)
const checkpoints = await db.query('SELECT * FROM checkpoints WHERE project_id = $1', [projectId]);

// After (SECURE)
const checkpoints = await db.query(
  'SELECT * FROM checkpoints WHERE project_id = $1 AND user_id = $2',
  [projectId, req.user.id]
);
```

---

## Implementation Order

### Phase 1: Website Auth (Day 1-2) ✅ DONE
- [x] Set up Clerk on website (`@clerk/nextjs`)
- [x] Create sign-in/sign-up pages
- [x] Create dashboard with API key management
- [x] CLI auth callback page (`/cli-auth`)

### Phase 2: API Key System (Day 2-3) ✅ DONE
- [x] API key generation in dashboard
- [x] API key storage in localStorage (client-side for now)
- [x] Copy/show/regenerate functionality

### Phase 3: API Server Auth (Day 3-4) ✅ DONE
- [x] Create auth middleware (`src/auth/middleware.ts`)
- [x] Validate API keys against database
- [x] Validate JWT tokens
- [x] Apply middleware to all routes
- [x] Add rate limiting

### Phase 4: CLI Auth (Day 4-5) ✅ DONE
- [x] `aitm login` command with browser flow
- [x] `aitm login --api-key` for direct key input
- [x] `aitm whoami` command
- [x] `aitm logout` command
- [x] `aitm register` command
- [x] `aitm api-key` command
- [x] Store credentials in ~/.aitimemachine/auth.json
- [x] Include auth in all API calls (`getAuthHeaders()`)

### Phase 5: MCP Auth (Day 5-6) ✅ DONE
- [x] `tm_auth_status` tool to check auth
- [x] `getAuthContext()` helper for MCP operations
- [x] Auth context available in all tool handlers

### Phase 6: Data Isolation (Day 6-7) ✅ DONE
- [x] Add user_id to all database tables (via migrations)
- [x] Update SqliteRepo with `setUserId()` context
- [x] Update queries to filter by user_id
- [x] Backward compatible (null user_id = accessible to all)

---

## Files to Create/Modify

### New Files
```
src/auth/
├── middleware.ts      # Express auth middleware
├── api-keys.ts        # API key generation/validation
├── cli-auth.ts        # CLI login flow
└── types.ts           # Auth types

website/
├── app/(auth)/...     # Auth pages
├── app/dashboard/...  # Dashboard pages
└── app/api/keys/...   # API key endpoints
```

### Modified Files
```
src/api-server.ts      # Add auth middleware
src/cli-v2.ts          # Add login/logout/whoami commands
src/mcp/server.ts      # Add auth to MCP
src/core/*.ts          # Add user_id to queries
```

---

## Security Checklist

- [x] API keys hashed with SHA-256 before storage
- [x] JWT tokens validated
- [x] Rate limiting on auth endpoints (prevent brute force)
- [x] API keys can be revoked/regenerated
- [x] Credentials stored securely (file permissions 600)
- [ ] HTTPS only in production (use nginx/cloudflare)
- [x] No credentials in logs
- [x] Audit log for auth events

---

## ✅ IMPLEMENTATION COMPLETE

All 6 phases have been implemented:

### Files Created
```
src/auth/
├── auth-service.ts    # User registration, login, JWT, API keys
├── middleware.ts      # Express auth middleware (requireAuth, rateLimit)
├── cli-auth.ts        # CLI login flow, credential storage
├── audit.ts           # Audit logging
├── validation.ts      # Input validation
└── index.ts           # Module exports

src/store/
└── migrations.ts      # Database migrations for user_id

website/
├── middleware.ts              # Clerk route protection
├── src/app/layout.tsx         # ClerkProvider
├── src/app/sign-in/           # Sign-in page
├── src/app/sign-up/           # Sign-up page
├── src/app/dashboard/         # API key management
├── src/app/cli-auth/          # CLI browser callback
└── .env.example               # Clerk config template
```

### Files Modified
```
src/api-server.ts      # Auth routes + middleware
src/cli-v2.ts          # Auth commands (login, logout, whoami, register, api-key, audit)
src/mcp/server.ts      # tm_auth_status, tm_before_message, tm_restore_before
src/store/sqlite_repo.ts # user_id support
```

### New CLI Commands
```bash
aitm login              # Browser-based login
aitm login --api-key    # Direct API key login
aitm logout             # Clear credentials
aitm whoami             # Show current user
aitm register           # Create account
aitm api-key            # Show/regenerate API key
aitm audit              # View audit logs
```

### New API Endpoints
```
POST /api/auth/register    # Create account
POST /api/auth/login       # Login, get JWT
GET  /api/auth/verify      # Verify token
GET  /api/auth/me          # Get current user
POST /api/auth/api-key/regenerate  # New API key
```

### New MCP Tools
```
tm_auth_status      # Check authentication status
tm_before_message   # Find checkpoint before AI message
tm_restore_before   # Natural language restore
```
