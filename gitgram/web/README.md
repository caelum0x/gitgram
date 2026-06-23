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

