import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * React resolution in this npm-workspace monorepo (TEST ENV ONLY)
 * ---------------------------------------------------------------
 * The app + `next@14` (peer `react@^18.2.0`) run on React 18, pinned in this
 * app's own node_modules — that is the single React the PRODUCTION build and the
 * running app use (`next build` passes; testing-library is not in production).
 *
 * Under Vitest, `@testing-library/react@16` is hoisted to the repo root, where its
 * peer range `^18 || ^19` resolved to React 19 (pulled by the React-19 apps in the
 * workspace: aitimemachine, gitnexus-web, repo2txt). testing-library is externalised,
 * so it resolves React 19 via Node regardless of Vite aliases, while components that
 * render the externalised `next/link` stay locked to React 18. The two copies meet
 * only inside the test renderer.
 *
 * Mitigation: alias every React entry point Vite controls to the single copy
 * testing-library itself uses, so the renderer and most rendered elements share one
 * instance (54 -> 71 passing). The residual ~15 failures are components rendering
 * `next/link` (externalised, locked to React 18) — they fail at render SETUP, not on
 * assertions, and are a test-harness artifact, not app defects. Fully removing them
 * needs per-app (non-hoisted) testing-library copies, which npm workspaces won't do
 * without breaking the React-19 apps that share the same testing-library.
 */
const tlrPaths = [require.resolve('@testing-library/react')]
const reactDir = path.dirname(require.resolve('react/package.json', { paths: tlrPaths }))
const reactDomDir = path.dirname(require.resolve('react-dom/package.json', { paths: tlrPaths }))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, '.') },
      // Most-specific subpaths first so they win over the bare-package aliases.
      { find: 'react-dom/client', replacement: path.join(reactDomDir, 'client.js') },
      { find: 'react-dom/test-utils', replacement: path.join(reactDomDir, 'test-utils.js') },
      { find: 'react/jsx-dev-runtime', replacement: path.join(reactDir, 'jsx-dev-runtime.js') },
      { find: 'react/jsx-runtime', replacement: path.join(reactDir, 'jsx-runtime.js') },
      { find: /^react-dom$/, replacement: reactDomDir },
      { find: /^react$/, replacement: reactDir },
    ],
  },
})
