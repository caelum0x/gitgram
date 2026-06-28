#!/usr/bin/env node
/**
 * clean-dist.mjs
 *
 * Removes the compiled `dist/` directory before a fresh `tsc` build.
 *
 * Why this exists: `tsc` only writes/overwrites the files it emits — it never
 * deletes orphaned output. Source modules that were renamed or removed leave
 * stale `.js`/`.d.ts` artifacts behind in `dist/`, and because `package.json`
 * ships `dist/**\/*`, those dead files would otherwise be published to npm.
 * Running this clean step ahead of `tsc` guarantees the published file list
 * contains only the modules that currently exist in `src/`.
 *
 * Uses only Node built-ins (no rimraf dependency) so it works in any install.
 */

import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

await rm(distDir, { recursive: true, force: true });
console.error(`Cleaned ${distDir}`);
