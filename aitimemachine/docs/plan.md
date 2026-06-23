# AITimeMachine - Plan

## Architecture Decision: Hybrid (Local + Cloud)

**Local-first** for speed & privacy, **cloud sync** for backup & teams.

```
User's Machine                         Our Backend (Future)
──────────────                         ────────────────────
Local capture ────── optional ──────►  User accounts
Fast restore         sync              Team sharing  
Works offline                          Hosted storage
S3 backup (own)                        Analytics
```

---

## TODO

### Phase 1: Ship MVP (Priority: NOW)

- [ ] **Documentation**
  - [ ] README with usage examples
  - [ ] Getting started guide
  - [ ] GIFs/screenshots of workflow

- [ ] **npm Publish**
  - [ ] Clean up package.json
  - [ ] Test global install
  - [ ] Publish to npm

- [ ] **VSCode Extension**
  - [ ] Finish extension (scaffold exists)
  - [ ] Publish to marketplace

### Phase 2: Commercial Backend (Priority: HIGH)

- [ ] **User System**
  - [ ] Auth (email/OAuth)
  - [ ] User accounts
  - [ ] API keys for sync

- [ ] **Cloud Storage**
  - [ ] Our S3 bucket (instead of user's)
  - [ ] Encrypted storage
  - [ ] Sync protocol (local ↔ cloud)

- [ ] **Advanced Features**
  - [ ] Cross-project search
  - [ ] AI-powered insights
  - [ ] Browser extension (ChatGPT, Claude web)

- [ ] **Billing**
  - [ ] dodo pay integration
  - [ ] Free tier limits
  - [ ] Pro/Team plans

### Phase 3: Growth (Priority: LATER)

- [ ] **Analytics Dashboard**
  - [ ] Usage metrics
  - [ ] Popular features
  - [ ] Error tracking

- [ ] **Web UI**
  - [ ] React SPA
  - [ ] Timeline scrubber
  - [ ] Diff viewer



---

## Pricing Ideas

| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | Local only, 5 projects, 7 days history |
| Pro | $10/mo | Cloud sync, unlimited projects, 90 days |
| Team | $25/user/mo | Shared projects, team access, 1 year |
| Enterprise | Custom | SSO, audit logs, on-premise |

---

## Tech Stack for Backend

```
Backend:
- Node.js / Fastify (or Go for performance)
- PostgreSQL (users, projects, metadata)
- S3 (blob storage)
- Redis (sessions, rate limiting)

Auth:
- Clerk or Auth0 (fast to ship)
- Or custom JWT

Payments:
- Polar.sh

Hosting:
- Railway / Render / Fly.io (start)
- AWS (scale)
```

---

## Next Actions

1. [ ] Decide on backend tech stack
2. [ ] Set up backend repo
3. [ ] Build auth + user accounts
4. [ ] Build sync endpoint
5. [ ] Update CLI to support cloud sync
6. [ ] Launch landing page
7. [ ] Beta users
# AITimeMachine - Brainstorm & Future Ideas

## The Big Picture

We're building **the Git/GitHub of AI-assisted development**. Not just version control, but complete state capture - files, conversations, context - across all AI tools.

---

## What's Working Well ✅

1. **Invisible capture** - Daemon runs in background, auto-discovers projects
2. **Multi-tool support** - Claude, Cursor, VS Code, Aider, terminals all detected
3. **Efficient storage** - Content-addressable, only stores unique data
4. **One-command setup** - `aitm install` and you're done
5. **S3 backup** - Cloud backup with one command

---

#

### 2. Smart Restore Suggestions

AI-powered "find when this broke":

```
User: "My tests started failing"

AITimeMachine:
  Analyzing test history...
  
  ✓ Tests passed: Dec 18, 2:30pm (session abc123)
  ✗ Tests failed: Dec 18, 3:15pm (session def456)
  
  Changes between these sessions:
  - Modified: src/auth/login.ts (+45 -12)
  - Modified: src/api/routes.ts (+8 -3)
  - Added: src/auth/jwt.ts
  
  [Restore to Dec 18, 2:30pm]  [View Diff]
```


### 4. Full Environment Restore

Not just files, but entire dev environment:

```
Restore Options:
  ○ Files only (fast)
  ○ Files + dependencies (reinstall node_modules)
  ○ Files + deps + runtime versions (switch Node version)
  ● Full environment (restore Docker containers too)
  
  This will:
  - Restore 47 files
  - Run: npm install (from package-lock.json at that time)
  - Switch to Node 18.17.0 (was 20.10.0)
  - Restart Docker containers: postgres, redis
  
  [Restore to Isolated Container]  [Restore to Local]
```

### 5. Conversation Search & Replay

Find past AI conversations and replay them:

```
Search: "how did we implement caching"

Results:
  1. Dec 15, 3:30pm - Claude Code session
     "Let's add Redis caching to the API..."
     [Jump to this moment]
     
  2. Dec 10, 11:00am - Cursor session  
     "I'll implement a simple in-memory cache..."
     [Jump to this moment]
```

---

## Crazy Ideas (Future)

### AI-Powered Bisect
```bash
aitm bisect "npm test"
# Automatically finds the session where tests started failing
```

### Cross-Project Search
```bash
aitm search --all-projects "authentication"
# Search across ALL your projects
```

### "What If" Branches
```
Create a branch from Dec 18, 2:30pm
Try alternative approach
Compare results
Merge or discard
```

### Automatic Milestones
```
AITimeMachine detected:
  ✓ Tests passing after 3 failures
  → Auto-created milestone: "Tests fixed"
```


### Browser Extension
```
Capture AI conversations from:
- ChatGPT web
- Claude web
- Gemini web
- Perplexity
```

---

## Technical Challenges to Solve

### 1. Large Project Performance
- 100K+ files takes too long to scan
- Solution: Incremental scanning, parallel hashing

### 2. Binary File Handling
- Images, compiled assets, databases
- Solution: Configurable inclusion, separate storage tier

### 3. Secret Detection
- Don't capture .env secrets in plain text
- Solution: Auto-detect and redact, or encrypt

### 4. Cross-Platform
- Windows paths, service installation
- Solution: Platform abstraction layer

### 5. Offline-First Sync
- Work offline, sync when connected
- Solution: CRDT-based merge, conflict resolution

---