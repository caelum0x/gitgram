#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../.env");

if (existsSync(envPath)) {
  process.exit(0);
}

const content = [
  "NODE_ENV=development",
  "HOST=127.0.0.1",
  "PORT=3001",
  "DATABASE_URL=postgresql://gitgram:gitgram_dev@localhost:5432/gitgram",
  "CORS_ORIGIN=http://localhost:3000,http://localhost:3002",
  "WEBSITE_URL=http://localhost:3002",
  "INTERNAL_SECRET=dev-internal-secret",
  "",
].join("\n");

writeFileSync(envPath, content, "utf8");
console.log("[env] Created api-server/.env with local development defaults.");
