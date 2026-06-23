#!/usr/bin/env npx tsx
/**
 * AITimeMachine Automated Knowledge Base Builder
 * 
 * Automatically discovers and indexes popular/useful GitHub repositories
 * for building a comprehensive code knowledge base.
 * 
 * Features:
 * - Curated list of essential repos by category
 * - GitHub API integration for trending repos
 * - Parallel indexing with rate limiting
 * - Progress tracking and status reporting
 * 
 * Usage:
 *   npx tsx scripts/auto-index-repos.ts
 *   npx tsx scripts/auto-index-repos.ts --category frameworks
 *   npx tsx scripts/auto-index-repos.ts --trending
 *   npx tsx scripts/auto-index-repos.ts --all
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional: for higher rate limits

// Curated list of essential repositories by category
const CURATED_REPOS: Record<string, string[]> = {
  // Web Frameworks
  frameworks: [
    "expressjs/express",
    "fastify/fastify",
    "koajs/koa",
    "nestjs/nest",
    "honojs/hono",
  ],

  // Frontend Frameworks
  frontend: [
    "facebook/react",
    "vuejs/core",
    "sveltejs/svelte",
    "angular/angular",
    "solidjs/solid",
    "preactjs/preact",
  ],

  // Build Tools & Bundlers
  build_tools: [
    "vitejs/vite",
    "webpack/webpack",
    "evanw/esbuild",
    "rollup/rollup",
    "parcel-bundler/parcel",
    "vercel/turbo",
  ],

  // State Management
  state: [
    "reduxjs/redux",
    "pmndrs/zustand",
    "pmndrs/jotai",
    "mobxjs/mobx",
    "TanStack/query",
  ],

  // Testing
  testing: [
    "jestjs/jest",
    "vitest-dev/vitest",
    "mochajs/mocha",
    "avajs/ava",
    "cypress-io/cypress",
    "playwright-community/playwright",
  ],

  // TypeScript & Languages
  languages: [
    "microsoft/TypeScript",
    "denoland/deno",
    "oven-sh/bun",
    "nicolo-ribaudo/babel",
  ],

  // Utilities
  utilities: [
    "lodash/lodash",
    "date-fns/date-fns",
    "axios/axios",
    "sindresorhus/got",
    "colinhacks/zod",
    "jquense/yup",
  ],

  // Database & ORM
  database: [
    "prisma/prisma",
    "drizzle-team/drizzle-orm",
    "typeorm/typeorm",
    "knex/knex",
    "sequelize/sequelize",
  ],

  // Node.js Ecosystem
  node: [
    "nodejs/node",
    "npm/cli",
    "pnpm/pnpm",
    "yarnpkg/berry",
  ],

  // API & GraphQL
  api: [
    "graphql/graphql-js",
    "apollographql/apollo-server",
    "trpc/trpc",
    "swagger-api/swagger-ui",
  ],

  // Auth & Security
  auth: [
    "nextauthjs/next-auth",
    "panva/jose",
    "auth0/node-jsonwebtoken",
    "kelektiv/node.bcrypt.js",
  ],

  // Full-Stack Frameworks
  fullstack: [
    "vercel/next.js",
    "remix-run/remix",
    "nuxt/nuxt",
    "redwoodjs/redwood",
    "blitz-js/blitz",
  ],

  // AI & ML
  ai_ml: [
    "huggingface/transformers.js",
    "xenova/transformers.js",
    "mlc-ai/web-llm",
    "anthropics/anthropic-sdk-node",
    "openai/openai-node",
  ],

  // CLI Tools
  cli: [
    "tj/commander.js",
    "yargs/yargs",
    "SBoudrias/Inquirer.js",
    "chalk/chalk",
    "sindresorhus/ora",
  ],

  // Documentation
  docs: [
    "facebook/docusaurus",
    "vuejs/vitepress",
    "withastro/starlight",
    "shuding/nextra",
  ],

  // Essential Small Libs
  essential_small: [
    "sindresorhus/p-limit",
    "sindresorhus/execa",
    "sindresorhus/globby",
    "micromatch/micromatch",
    "isaacs/node-glob",
    "mrmlnc/fast-glob",
  ],
};

// ============================================================================
// TYPES
// ============================================================================

interface IndexingResult {
  repo: string;
  success: boolean;
  repositoryId?: string;
  error?: string;
  status?: string;
}

interface GitHubRepo {
  full_name: string;
  description: string;
  stargazers_count: number;
  language: string;
}

// ============================================================================
// GITHUB API HELPERS
// ============================================================================

async function fetchTrendingRepos(language: string = "javascript", limit: number = 20): Promise<string[]> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
  };
  
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  try {
    // Search for recently created repos with high stars
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const dateStr = oneMonthAgo.toISOString().split("T")[0];

    const url = `https://api.github.com/search/repositories?q=language:${language}+created:>${dateStr}&sort=stars&order=desc&per_page=${limit}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`GitHub API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.items?.map((r: GitHubRepo) => r.full_name) || [];
  } catch (error: any) {
    console.warn(`Failed to fetch trending repos: ${error.message}`);
    return [];
  }
}

async function fetchPopularReposByTopic(topic: string, limit: number = 10): Promise<string[]> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
  };
  
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  try {
    const url = `https://api.github.com/search/repositories?q=topic:${topic}+stars:>1000&sort=stars&order=desc&per_page=${limit}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.items?.map((r: GitHubRepo) => r.full_name) || [];
  } catch {
    return [];
  }
}

// ============================================================================
// INDEXING HELPERS
// ============================================================================

async function getOrCreateCredentials(): Promise<{ apiKey: string; projectId: string }> {
  // Try to read existing credentials
  const fs = await import("fs/promises");
  const credPath = resolve(__dirname, "../.kb-credentials.json");
  
  try {
    const existing = await fs.readFile(credPath, "utf-8");
    const creds = JSON.parse(existing);
    
    // Verify credentials still work
    const response = await fetch(`${API_BASE}/v1/knowledge-base/repositories`, {
      headers: { "X-API-Key": creds.apiKey },
    });
    
    if (response.ok) {
      return creds;
    }
  } catch {
    // Need to create new credentials
  }

  console.log("📝 Creating new credentials...");
  
  // Import db and create user/key
  const { db, schema } = await import("../src/db/index.js");
  const crypto = await import("crypto");
  
  function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  function generateApiKey(): { key: string; hash: string; prefix: string } {
    const key = `aitm_${crypto.randomBytes(24).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const prefix = key.slice(0, 12);
    return { key, hash, prefix };
  }

  // Create user
  const userId = generateId("user");
  await db.insert(schema.users).values({
    id: userId,
    email: `kb-builder-${Date.now()}@aitimemachine.dev`,
    name: "Knowledge Base Builder",
    plan: "pro",
  }).onConflictDoNothing();

  // Create API key
  const keyId = generateId("key");
  const { key, hash, prefix } = generateApiKey();
  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    keyHash: hash,
    keyPrefix: prefix,
    name: "Auto-Indexer Key",
    scopes: ["read", "write", "admin"],
  });

  // Create project
  const projectId = generateId("proj");
  await db.insert(schema.projects).values({
    id: projectId,
    userId,
    name: "Auto-Indexed Knowledge Base",
  });

  const creds = { apiKey: key, projectId, userId };
  
  // Save credentials
  await fs.writeFile(credPath, JSON.stringify(creds, null, 2));
  console.log(`   ✅ Credentials saved to ${credPath}`);
  
  return creds;
}

async function indexRepository(
  apiKey: string,
  projectId: string,
  repoUrl: string
): Promise<IndexingResult> {
  const repoName = repoUrl.includes("github.com") 
    ? repoUrl.split("github.com/")[1] 
    : repoUrl;
  
  try {
    const response = await fetch(`${API_BASE}/v1/repositories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        url: repoUrl.startsWith("http") ? repoUrl : `https://github.com/${repoUrl}`,
        projectId,
        name: repoName.split("/")[1],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        repo: repoName,
        success: false,
        error: data.error?.message || JSON.stringify(data),
      };
    }

    return {
      repo: repoName,
      success: true,
      repositoryId: data.id,
      status: data.status,
    };
  } catch (error: any) {
    return {
      repo: repoName,
      success: false,
      error: error.message,
    };
  }
}

async function checkIndexingStatus(apiKey: string, repoId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/v1/repositories/${repoId}`, {
      headers: { "X-API-Key": apiKey },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function waitForIndexing(
  apiKey: string, 
  repoId: string, 
  maxWaitMs: number = 300000
): Promise<string> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkIndexingStatus(apiKey, repoId);
    
    if (!status) return "unknown";
    if (status.status === "completed") return "completed";
    if (status.status === "failed") return "failed";
    
    // Wait 5 seconds between checks
    await new Promise(r => setTimeout(r, 5000));
  }
  
  return "timeout";
}

async function cleanupTempRepos(): Promise<void> {
  const { execSync } = await import("child_process");
  try {
    execSync("rm -rf /tmp/aitm-repos", { stdio: "ignore" });
  } catch {}
}

// ============================================================================
// MAIN INDEXING LOGIC
// ============================================================================

async function indexCategory(
  apiKey: string,
  projectId: string,
  category: string,
  repos: string[],
  options: { parallel?: number; waitForCompletion?: boolean } = {}
): Promise<IndexingResult[]> {
  const { parallel = 2, waitForCompletion = false } = options;
  const results: IndexingResult[] = [];
  
  console.log(`\n📦 Indexing category: ${category} (${repos.length} repos)`);
  console.log("─".repeat(60));
  
  // Process in batches for rate limiting
  for (let i = 0; i < repos.length; i += parallel) {
    const batch = repos.slice(i, i + parallel);
    
    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        process.stdout.write(`   📥 ${repo}... `);
        const result = await indexRepository(apiKey, projectId, repo);
        
        if (result.success) {
          console.log(`✅ queued (${result.repositoryId})`);
          
          if (waitForCompletion && result.repositoryId) {
            process.stdout.write(`      ⏳ waiting for indexing... `);
            const finalStatus = await waitForIndexing(apiKey, result.repositoryId, 120000);
            console.log(finalStatus === "completed" ? "✅ done" : `⚠️ ${finalStatus}`);
            result.status = finalStatus;
          }
        } else {
          console.log(`❌ ${result.error}`);
        }
        
        return result;
      })
    );
    
    results.push(...batchResults);
    
    // Rate limiting delay between batches
    if (i + parallel < repos.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  return results;
}

async function getExistingRepos(apiKey: string): Promise<Set<string>> {
  const existing = new Set<string>();
  
  try {
    const response = await fetch(`${API_BASE}/v1/repositories?limit=1000`, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      for (const repo of data.data || []) {
        if (repo.metadata?.url) {
          const name = repo.metadata.url.replace("https://github.com/", "");
          existing.add(name.toLowerCase());
        }
      }
    }
  } catch {}
  
  return existing;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("   🚀 AITimeMachine Automated Knowledge Base Builder");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const args = process.argv.slice(2);
  
  // Parse arguments
  const showHelp = args.includes("--help") || args.includes("-h");
  const indexAll = args.includes("--all");
  const indexTrending = args.includes("--trending");
  const waitForCompletion = args.includes("--wait");
  const skipExisting = !args.includes("--force");
  
  const categoryIdx = args.indexOf("--category");
  const selectedCategory = categoryIdx !== -1 ? args[categoryIdx + 1] : null;
  
  if (showHelp) {
    console.log(`
Usage: npx tsx scripts/auto-index-repos.ts [options]

Options:
  --all              Index all curated repositories
  --category <name>  Index a specific category
  --trending         Include trending repos from GitHub
  --wait             Wait for each repo to finish indexing
  --force            Re-index repos that already exist
  --help, -h         Show this help message

Categories:
  ${Object.keys(CURATED_REPOS).join(", ")}

Examples:
  npx tsx scripts/auto-index-repos.ts --category frameworks
  npx tsx scripts/auto-index-repos.ts --all --wait
  npx tsx scripts/auto-index-repos.ts --trending
`);
    process.exit(0);
  }

  try {
    // Clean up temp repos first
    await cleanupTempRepos();
    
    // Get or create credentials
    const { apiKey, projectId } = await getOrCreateCredentials();
    console.log(`📌 Using project: ${projectId}\n`);
    
    // Get existing repos to avoid duplicates
    const existingRepos = skipExisting ? await getExistingRepos(apiKey) : new Set<string>();
    if (existingRepos.size > 0) {
      console.log(`📋 Found ${existingRepos.size} existing repos (will skip duplicates)\n`);
    }
    
    const allResults: IndexingResult[] = [];
    
    // Determine which repos to index
    let categoriesToIndex: string[] = [];
    
    if (selectedCategory) {
      if (!CURATED_REPOS[selectedCategory]) {
        console.error(`❌ Unknown category: ${selectedCategory}`);
        console.log(`Available: ${Object.keys(CURATED_REPOS).join(", ")}`);
        process.exit(1);
      }
      categoriesToIndex = [selectedCategory];
    } else if (indexAll) {
      categoriesToIndex = Object.keys(CURATED_REPOS);
    } else {
      // Default: index essential small libs and frameworks
      categoriesToIndex = ["frameworks", "utilities", "essential_small"];
    }
    
    // Index curated repos by category
    for (const category of categoriesToIndex) {
      const repos = CURATED_REPOS[category];
      const filteredRepos = repos.filter(r => !existingRepos.has(r.toLowerCase()));
      
      if (filteredRepos.length === 0) {
        console.log(`\n⏭️  Skipping ${category} (all repos already indexed)`);
        continue;
      }
      
      const results = await indexCategory(apiKey, projectId, category, filteredRepos, {
        parallel: 2,
        waitForCompletion,
      });
      allResults.push(...results);
      
      // Clean up between categories
      await cleanupTempRepos();
    }
    
    // Index trending repos if requested
    if (indexTrending) {
      console.log("\n🔥 Fetching trending repositories...");
      
      const trendingJS = await fetchTrendingRepos("javascript", 10);
      const trendingTS = await fetchTrendingRepos("typescript", 10);
      const trending = [...new Set([...trendingJS, ...trendingTS])];
      
      const filteredTrending = trending.filter(r => !existingRepos.has(r.toLowerCase()));
      
      if (filteredTrending.length > 0) {
        const results = await indexCategory(apiKey, projectId, "trending", filteredTrending, {
          parallel: 2,
          waitForCompletion,
        });
        allResults.push(...results);
      }
    }
    
    // Print summary
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("   📊 Indexing Summary");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    
    console.log(`   ✅ Successfully queued: ${successful.length}`);
    console.log(`   ❌ Failed: ${failed.length}`);
    console.log(`   📁 Total processed: ${allResults.length}`);
    
    if (failed.length > 0) {
      console.log("\n   Failed repos:");
      failed.forEach(r => console.log(`      - ${r.repo}: ${r.error}`));
    }
    
    // Check final status
    console.log("\n   Checking final knowledge base status...");
    const kbResponse = await fetch(`${API_BASE}/v1/knowledge-base/repositories`, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (kbResponse.ok) {
      const kbData = await kbResponse.json();
      const completed = kbData.repositories?.filter((r: any) => r.index_status === "completed") || [];
      const totalFiles = completed.reduce((sum: number, r: any) => sum + parseInt(r.kb_files || 0), 0);
      
      console.log(`\n   📚 Knowledge Base Stats:`);
      console.log(`      - Indexed repositories: ${completed.length}`);
      console.log(`      - Total files: ${totalFiles}`);
    }
    
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("   🎉 Done! Your knowledge base is ready.");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log("   Test with:");
    console.log(`   curl -X POST "${API_BASE}/v1/universal-search" \\`);
    console.log(`     -H "X-API-Key: ${apiKey}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"query": "router middleware", "limit": 10}'`);
    console.log("");
    
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
