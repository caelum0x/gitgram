# Gitgram Web

Web version of Gitgram built with Next.js 14, TypeScript, and Tailwind CSS.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- Next.js 14 App Router
- TypeScript
- Tailwind CSS for styling
- GitHub-inspired UI
- Shared API client with mobile app
- Authentication with JWT
- Server-side rendering (SSR)
- Static site generation (SSG)

## Project Structure

```
web/
├── app/              # Next.js App Router pages
├── components/       # React components
├── services/         # API services
├── store/            # State management (Zustand)
└── lib/              # Utilities
```

## Talent Graph proof route

[`/talent-network`](./app/talent-network/page.tsx) presents one API-backed route:

1. Institution need from `GET /v1/talent-graph/opportunities`
2. Evidence matches from `GET /v1/talent-graph/opportunities/:id/matches`
3. Candidate-controlled Zen referral from `GET /v1/talent-graph/referrals/mine`
4. Pilot delivery and audit history from `GET /v1/talent-graph/pilots/mine`
5. Eligible public proof in the owner [`/collaborate`](./app/collaborate/page.tsx) dossier

Public pilot evidence requires a `COMPLETED` pilot, participant consent, and a public HTTP(S) deliverable. The client does not seed records. A zero count comes from the API; the screen renders request failures as an unavailable state with a retry action.

All Talent Graph writes now carry a retry-stable `Idempotency-Key`. Referral and
pilot updates also send the revision read from the API, so concurrent decisions
or edits fail with `409` instead of overwriting one another. Public profile and
matching reads consume the dedicated `TalentPublicProof` projection rather than
joining private opportunity/pilot records at request time. See the backend
[release runbook](../backend/docs/TALENT_GRAPH_RELEASE.md).

The owner dossier creates `/collaborate?profile=<username>` only when the account has a public username. Browser validation still needs two accounts for referral acceptance and institution completion, forced API failures for each resource, responsive anchor review, and public-link checks. The current hackathon cycle forbids build, test, lint, CI, migrations, and app-server runs.
