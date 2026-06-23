#!/usr/bin/env npx tsx
/**
 * AITimeMachine Knowledge Base Setup Script
 * 
 * This script:
 * 1. Creates a test user in the database
 * 2. Creates an API key for authentication
 * 3. Creates a project
 * 4. Indexes GitHub repositories into the knowledge base
 * 5. Tests search functionality
 * 
 * Usage:
 *   npx tsx scripts/setup-and-index.ts
 *   npx tsx scripts/setup-and-index.ts --repos "owner/repo1,owner/repo2"
 */

import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment FIRST before any db imports
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envResult = dotenv.config({ path: resolve(__dirname, "../.env") });

if (envResult.error) {
  console.error("Failed to load .env file:", envResult.error);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env file");
  process.exit(1);
}

// Now import db after env is loaded
const { db, schema } = await import("../src/db/index.js");
import { eq } from "drizzle-orm";

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "dev-internal-secret";

// Default repos to index (popular open source projects)
const DEFAULT_REPOS = [
  "facebook/react",
  "vercel/next.js", 
  "microsoft/typescript",
];

interface SetupResult {
  userId: string;
  apiKey: string;
  apiKeyId: string;
  projectId: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `aitm_${crypto.randomBytes(24).toString("hex")}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
}

async function createUser(): Promise<string> {
  console.log("📝 Creating test user...");
  
  const userId = generateId("user");
  const email = `test-${Date.now()}@aitimemachine.dev`;
  
  await db.insert(schema.users).values({
    id: userId,
    email,
    name: "Test User",
    plan: "pro", // Give pro plan for full access
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  
  console.log(`   ✅ User created: ${userId}`);
  return userId;
}

async function createApiKey(userId: string): Promise<{ id: string; key: string }> {
  console.log("🔑 Creating API key...");
  
  const keyId = generateId("key");
  const { key, hash, prefix } = generateApiKey();
  
  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    keyHash: hash,
    keyPrefix: prefix,
    name: "Setup Script Key",
    scopes: ["read", "write", "admin"],
  });
  
  console.log(`   ✅ API key created: ${prefix}...`);
  return { id: keyId, key };
}

async function createProject(userId: string, apiKey: string): Promise<string> {
  console.log("📁 Creating project...");
  
  const projectId = generateId("proj");
  
  await db.insert(schema.projects).values({
    id: projectId,
    userId,
    name: "Knowledge Base",
  });
  
  console.log(`   ✅ Project created: ${projectId}`);
  return projectId;
}

async function indexGitHubRepo(
  apiKey: string,
  projectId: string,
  repoUrl: string
): Promise<{ success: boolean; repositoryId?: string; error?: string }> {
  const repoName = repoUrl.split("/").slice(-2).join("/");
  console.log(`\n📦 Indexing repository: ${repoName}...`);
  
  try {
    const response = await fetch(`${API_BASE}/v1/repositories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        url: `https://github.com/${repoUrl}`,
        projectId,
        name: repoName.split("/")[1],
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ Failed: ${data.error?.message || JSON.stringify(data)}`);
      return { success: false, error: data.error?.message };
    }
    
    console.log(`   ✅ Repository queued for indexing: ${data.repository?.id || data.id}`);
    return { success: true, repositoryId: data.repository?.id || data.id };
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function checkIndexingStatus(apiKey: string, repositoryId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/v1/repositories/${repositoryId}`, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   Status: ${data.repository?.indexStatus || data.index_status || "unknown"}`);
    }
  } catch (error) {
    // Ignore status check errors
  }
}

async function testSearch(apiKey: string, query: string): Promise<void> {
  console.log(`\n🔍 Testing search: "${query}"...`);
  
  try {
    const response = await fetch(`${API_BASE}/v1/universal-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        query,
        limit: 5,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`   ❌ Search failed: ${data.error?.message}`);
      return;
    }
    
    const results = data.results || [];
    console.log(`   ✅ Found ${results.length} results`);
    
    if (results.length > 0) {
      console.log("\n   Top results:");
      results.slice(0, 3).forEach((r: any, i: number) => {
        console.log(`   ${i + 1}. ${r.title || r.path || r.id} (score: ${r.score?.toFixed(2) || "N/A"})`);
      });
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function testKnowledgeBase(apiKey: string): Promise<void> {
  console.log("\n📚 Testing Knowledge Base...");
  
  try {
    // List repositories
    const reposResponse = await fetch(`${API_BASE}/v1/knowledge-base/repositories`, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (reposResponse.ok) {
      const data = await reposResponse.json();
      console.log(`   ✅ Repositories in KB: ${data.repositories?.length || 0}`);
      
      if (data.repositories?.length > 0) {
        data.repositories.forEach((repo: any) => {
          console.log(`      - ${repo.name}: ${repo.kb_files || 0} files (${repo.index_status})`);
        });
      }
    }
    
    // Get stats
    const statsResponse = await fetch(`${API_BASE}/v1/knowledge-base/stats`, {
      headers: { "X-API-Key": apiKey },
    });
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log(`   📊 KB Stats:`);
      console.log(`      - Total files: ${stats.total_files || 0}`);
      console.log(`      - Total symbols: ${stats.total_symbols || 0}`);
      console.log(`      - Languages: ${stats.languages?.join(", ") || "none"}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️ KB check error: ${error.message}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   AITimeMachine Knowledge Base Setup");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  // Parse CLI arguments for custom repos
  const args = process.argv.slice(2);
  let repos = DEFAULT_REPOS;
  
  const reposArgIndex = args.indexOf("--repos");
  if (reposArgIndex !== -1 && args[reposArgIndex + 1]) {
    repos = args[reposArgIndex + 1].split(",").map(r => r.trim());
  }
  
  try {
    // Step 1: Create user
    const userId = await createUser();
    
    // Step 2: Create API key
    const { id: apiKeyId, key: apiKey } = await createApiKey(userId);
    
    // Step 3: Create project
    const projectId = await createProject(userId, apiKey);
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("   Setup Complete! Your credentials:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n   API Key: ${apiKey}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Project ID: ${projectId}`);
    console.log("\n   Save your API key - it won't be shown again!\n");
    console.log("═══════════════════════════════════════════════════════════");
    
    // Step 4: Index repositories
    console.log("\n📦 Indexing GitHub Repositories...\n");
    console.log(`   Repositories to index: ${repos.join(", ")}\n`);
    
    const indexedRepos: string[] = [];
    
    for (const repo of repos) {
      const result = await indexGitHubRepo(apiKey, projectId, repo);
      if (result.success && result.repositoryId) {
        indexedRepos.push(result.repositoryId);
      }
      // Small delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Step 5: Wait a bit and check status
    if (indexedRepos.length > 0) {
      console.log("\n⏳ Waiting for indexing to progress...");
      await new Promise(r => setTimeout(r, 5000));
      
      for (const repoId of indexedRepos) {
        await checkIndexingStatus(apiKey, repoId);
      }
    }
    
    // Step 6: Test knowledge base
    await testKnowledgeBase(apiKey);
    
    // Step 7: Test search
    await testSearch(apiKey, "useState hook");
    await testSearch(apiKey, "function component");
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("   🎉 Setup Complete!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n   You can now use the API with your key:");
    console.log(`\n   curl -H "X-API-Key: ${apiKey}" ${API_BASE}/v1/knowledge-base/repositories`);
    console.log(`\n   curl -X POST -H "X-API-Key: ${apiKey}" -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"query": "your search"}' ${API_BASE}/v1/universal-search`);
    console.log("\n");
    
  } catch (error: any) {
    console.error("\n❌ Setup failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
