# Actionable Reference Clones

Last updated: 2026-06-21

This file replaces the old starred-repos dump.

Purpose:
- keep a small set of upstream reference repos inside this workspace
- clone only repos that map to current Gitgram or AITM work
- avoid cloning unrelated agent/social projects just because they look interesting

Clone root:
- `/Users/arhansubasi/gitgram-ai/external`

## Cloned Now

| Repo | Local path | Why it matters now | Status |
|---|---|---|---|
| `abinthomasonline/repo2txt` | `external/repo2txt` | Direct reference for repo-to-text ingest/export UX and URL handling patterns. | `cloned 2026-05-12` |
| `kirill-markin/repo-to-text` | `external/repo-to-text` | Simpler alternative repo-to-text implementation to compare parsing, file selection, and output shaping. | `cloned 2026-05-12` |
| `a2aproject/a2a-js` | `external/a2a-js` | Official A2A SDK. Needed to align AITM transport and agent-card behavior with the spec instead of maintaining only hand-rolled protocol types. | `cloned 2026-05-12` |
| `upstash/context7` | `external/context7` | Reference for production MCP HTTP patterns, transport wiring, and request-scoped context handling. | `cloned 2026-05-12` |
| `BeehiveInnovations/pal-mcp-server` | `external/pal-mcp-server` | Reference for MCP tool organization, annotations, output envelopes, and tool disabling patterns. | `cloned 2026-05-12` |
| `abhigyanpatwari/GitNexus` | `external/gitnexus` | Client-side code intelligence engine — zero-server knowledge graph + Graph RAG agent over any repo. Reference for Gitgram repo explore/visualisation surface and AITM code-context indexing. | `cloned 2026-06-21` |
| `gastownhall/beads` | `external/beads` | Steve Yegge's git-native DAG issue tracker designed for AI agents. Reference for AITM task/issue tracking integration and multi-agent coordination patterns. `bd ready` shows unblocked work with dependency DAGs and hash-based IDs. | `cloned 2026-06-21` |
| `codinginflow/nextjs-15-social-media-app` | `external/nextjs-15-social-media-app` | Exact same stack as Gitgram (Next.js 15 + Prisma + PG). Prisma schema maps 1:1 to Gitgram. Reference for infinite scroll, optimistic updates, and notification patterns. | `cloned 2026-06-21` |
| `leandronorcio/munia` | `external/munia` | Most complete open-source social features: GitHub OAuth, @mentions, hashtags, nested comments, drag-drop media, S3 uploads, accessibility. | `cloned 2026-06-21` |
| `TomDoesTech/t3-twitter-clone` | `external/t3-twitter-clone` | Only open-source Twitter clone with an Express backend branch — matches Gitgram's Express backend. Type-safe tRPC patterns. | `cloned 2026-06-21` |
| `karanpratapsingh/Proximity` | `external/proximity` | Best React Native social app with Prisma. Real-time messaging via GraphQL subscriptions. Reference only (GPL-3). | `cloned 2026-06-21` |
| `amirfakhrullah/gh-social` | `external/gh-social` | GitHub Social Platform — the closest open-source concept to Gitgram. Syncs GitHub follows/stars to a social feed. Next.js + tRPC + Clerk + Drizzle + Neon. | `cloned 2026-06-21` |
| `bluesky-social/social-app` | `external/bluesky-social-app` | Production-scale feed algorithms, notifications, and moderation patterns. Architecture reference for Gitgram at scale. | `cloned 2026-06-21` |

## Watch Later

| Repo | Why not cloning now |
|---|---|
| `browserbase/stagehand` | Browser automation is not on the current launch-critical path. |
| `daytonaio/daytona` | Infra-heavy and not needed for the current single-host launch. |
| `mem0ai/mem0` | Memory layer work is post-launch, not a deploy blocker. |
| `vercel-labs/open-agents` | Broad cloud-agent template, but not a direct gap in the current repos. |
| `badlogic/sitegeist` | Useful browser-collaboration reference, but not tied to current shipping tasks. |
| `agentgateway/agentgateway` | Worth reviewing later for A2A/MCP proxying, but not needed before the first launch. |
| `GongRzhe/A2A-MCP-Server` | Useful bridge reference after the official A2A SDK pass. |
| `Open-ACP/OpenACP` | Messaging-channel expansion is post-launch work. |

## Current Adoption Targets

| Reference | Product | Current status | What is already used | Next planned use in project |
|---|---|---|---|---|
| `repo2txt` + `repo-to-text` | Gitgram | `adopted` | Gitgram now ships a real repo-to-text export flow at `/api/v1/repositories/:owner/:name/export/text`, a public short-path text view at `/:owner/:name/text`, a raw plain-text shortcut at `/:owner/:name/text/raw`, queryable export sizing via `maxFiles` / `maxFileBytes`, and direct `Text` / `Raw` entry points from the repository page plus discovery cards in search, explore, and trending. | No launch-critical follow-up remains. Reuse only if Gitgram adds deeper compose/share/import workflows around repo text. |
| `a2a-js` | AITM MCP | `adopted` | AITM now uses an `a2a-js`-derived contract layer in `aitimemachine/mcp/src/lib/a2a-contract.ts`, a canonical `message/send` JSON-RPC flow in `aitimemachine/mcp/src/http-transport.ts`, spec-shaped task responses, protocol-versioned agent cards, and a repeatable smoke gate in `aitimemachine/scripts/a2a-smoke-test.sh`. | No launch-critical follow-up remains beyond future expansion into real streaming or additional A2A task methods if the product needs them. |
| `context7` | AITM MCP | `adopted` | AITM already exposes streamable HTTP transport and now also uses request-scoped HTTP context, stable `X-Request-Id` response headers, structured parser/protocol error mapping, per-request logging around `/mcp`, `/a2a`, `/.well-known/agent-card.json`, and `/health`, plus nested request-ID propagation from A2A into the internal `/mcp` bridge. | No launch-critical follow-up remains. Revisit only if AITM later needs deeper user/auth context propagation across remote downstream calls. |
| `pal-mcp-server` | AITM MCP | `adopted` | AITM MCP now enforces a real tool registry with stable-vs-experimental exposure, `DISABLED_TOOLS` env support, aligned A2A/HTTP capability reporting, category-based tool registration modules, shared tool-annotation helpers, shared tool response helpers, and declarative `createToolRegistrar` / `defineTool` registration helpers instead of repeated `server.tool(...)` scaffolding. | No launch-critical follow-up remains. Revisit only if the tool surface grows enough to justify deeper output-schema or capability-family generation. |

## Refresh Policy

- Keep clones shallow unless a deeper history is required.
- Treat `external/*` as upstream references, not as code to edit directly for product work.
- When a reference repo becomes genuinely integrated, copy or adapt the needed pattern into `gitgram` or `aitimemachine` with explicit attribution in the relevant PR or commit.
