#!/usr/bin/env npx tsx
/**
 * Quick test script for repository indexing
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const API_KEY = "aitm_de2838b5ce0e0b0ba02cb4ebf6dd4d2c91865bfbfa57678b";
const PROJECT_ID = "proj_1770143401235_d1101a26";
const API_BASE = "http://localhost:3001";

async function indexRepo(url: string) {
  console.log(`\n📦 Indexing: ${url}`);
  
  const response = await fetch(`${API_BASE}/v1/repositories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ url, projectId: PROJECT_ID }),
  });
  
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));
  return data;
}

async function checkStatus(repoId: string) {
  console.log(`\n📊 Checking status for: ${repoId}`);
  
  const response = await fetch(`${API_BASE}/v1/repositories/${repoId}`, {
    headers: { "X-API-Key": API_KEY },
  });
  
  const data = await response.json();
  console.log("Status:", JSON.stringify(data, null, 2));
  return data;
}

async function listRepos() {
  console.log("\n📚 Listing all repositories:");
  
  const response = await fetch(`${API_BASE}/v1/repositories`, {
    headers: { "X-API-Key": API_KEY },
  });
  
  const data = await response.json();
  console.log("Repositories:", JSON.stringify(data, null, 2));
  return data;
}

async function searchKnowledgeBase(query: string) {
  console.log(`\n🔍 Searching: "${query}"`);
  
  const response = await fetch(`${API_BASE}/v1/universal-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ query, limit: 5 }),
  });
  
  const data = await response.json();
  console.log("Results:", JSON.stringify(data, null, 2));
  return data;
}

async function getKBStats() {
  console.log("\n📊 Knowledge Base Stats:");
  
  const response = await fetch(`${API_BASE}/v1/knowledge-base/repositories`, {
    headers: { "X-API-Key": API_KEY },
  });
  
  const data = await response.json();
  console.log("KB Repos:", JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   AITimeMachine Knowledge Base Test");
  console.log("═══════════════════════════════════════════════════════════");
  
  // Clean up first
  const { execSync } = await import("child_process");
  try {
    execSync("rm -rf /tmp/aitm-repos", { stdio: "inherit" });
    console.log("✅ Cleaned up /tmp/aitm-repos");
  } catch {}
  
  // Index a small repo
  const result = await indexRepo("https://github.com/expressjs/express");
  
  if (result.id) {
    // Wait and check progress
    console.log("\n⏳ Waiting 15 seconds for indexing...");
    await new Promise(r => setTimeout(r, 15000));
    
    await checkStatus(result.id);
  }
  
  // List all repos
  await listRepos();
  
  // Check KB
  await getKBStats();
  
  // Try search
  await searchKnowledgeBase("router middleware");
  
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("   Test Complete!");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
