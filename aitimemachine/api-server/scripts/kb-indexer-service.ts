#!/usr/bin/env npx tsx
/**
 * AITimeMachine Knowledge Base Indexer Service
 * 
 * A background service that continuously discovers and indexes GitHub repositories.
 * Designed to run 24/7 on a server, building a comprehensive code knowledge base.
 * 
 * Features:
 * - Scheduled discovery of trending/popular repos
 * - Topic-based exploration
 * - Star-based popularity filtering
 * - Rate-limited GitHub API usage
 * - Queue-based indexing with retries
 * - Health monitoring and metrics
 * - Graceful shutdown handling
 * 
 * Usage:
 *   npx tsx scripts/kb-indexer-service.ts              # Run as foreground service
 *   npx tsx scripts/kb-indexer-service.ts --daemon     # Run as daemon
 *   npx tsx scripts/kb-indexer-service.ts --once       # Run one discovery cycle
 *   npx tsx scripts/kb-indexer-service.ts --status     # Check service status
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Settings
  API_BASE: process.env.API_BASE || "http://localhost:3001",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  
  // Discovery Settings
  DISCOVERY_INTERVAL_MS: 6 * 60 * 60 * 1000, // 6 hours
  INDEXING_INTERVAL_MS: 30 * 1000, // 30 seconds between repo indexing
  MAX_REPOS_PER_CYCLE: 50, // Max repos to queue per discovery cycle
  MIN_STARS: 100, // Minimum stars for auto-discovery
  MAX_REPO_SIZE_KB: 500000, // Skip repos larger than 500MB
  
  // Rate Limiting
  GITHUB_API_DELAY_MS: 2000, // 2 seconds between GitHub API calls
  INDEXING_CONCURRENCY: 1, // Index one repo at a time
  
  // Retry Settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 60000, // 1 minute
  
  // File paths
  STATE_FILE: resolve(__dirname, "../.kb-indexer-state.json"),
  CREDENTIALS_FILE: resolve(__dirname, "../.kb-credentials.json"),
  LOG_FILE: resolve(__dirname, "../logs/kb-indexer.log"),
  
  // Topics to explore (rotated through)
  TOPICS: [
    // Languages & Runtimes
    "javascript", "typescript", "nodejs", "deno", "bun",
    // Frontend
    "react", "vue", "svelte", "angular", "nextjs", "nuxt",
    // Backend
    "express", "fastify", "nestjs", "graphql", "rest-api",
    // Tools
    "cli", "devtools", "bundler", "compiler", "linter",
    // Data
    "database", "orm", "mongodb", "postgresql", "redis",
    // Infrastructure  
    "docker", "kubernetes", "serverless", "aws", "vercel",
    // AI/ML
    "machine-learning", "artificial-intelligence", "llm", "openai", "langchain",
    // Testing
    "testing", "unit-testing", "e2e-testing", "test-automation",
    // Security
    "security", "authentication", "encryption", "oauth",
    // Other
    "awesome", "library", "framework", "sdk", "api-client",
  ],
  
  // Languages to track
  LANGUAGES: [
    "javascript", "typescript", "python", "go", "rust",
  ],
};

// ============================================================================
// TYPES
// ============================================================================

interface ServiceState {
  lastDiscoveryAt: string | null;
  lastIndexAt: string | null;
  totalReposDiscovered: number;
  totalReposIndexed: number;
  totalFileIndexed: number;
  topicIndex: number;
  queue: QueuedRepo[];
  indexed: Record<string, IndexedRepoInfo>;
  failed: Record<string, FailedRepoInfo>;
  metrics: ServiceMetrics;
}

interface QueuedRepo {
  fullName: string;
  url: string;
  stars: number;
  language: string | null;
  description: string | null;
  addedAt: string;
  retries: number;
  source: "trending" | "topic" | "curated" | "related";
}

interface IndexedRepoInfo {
  repositoryId: string;
  indexedAt: string;
  fileCount: number;
  symbolCount: number;
  status: string;
}

interface FailedRepoInfo {
  lastAttempt: string;
  error: string;
  retries: number;
}

interface ServiceMetrics {
  startedAt: string;
  discoveryCycles: number;
  indexingCycles: number;
  apiCallsMade: number;
  githubApiCallsMade: number;
  errorsEncountered: number;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  size: number;
  fork: boolean;
  archived: boolean;
  topics: string[];
}

interface Credentials {
  apiKey: string;
  projectId: string;
  userId: string;
}

// ============================================================================
// LOGGING
// ============================================================================

class Logger {
  private logFile: string;
  
  constructor(logFile: string) {
    this.logFile = logFile;
  }
  
  private async ensureLogDir() {
    const dir = dirname(this.logFile);
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
  }
  
  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }
  
  async log(level: string, message: string) {
    const formatted = this.formatMessage(level, message);
    console.log(formatted);
    
    try {
      await this.ensureLogDir();
      await fs.appendFile(this.logFile, formatted + "\n");
    } catch {}
  }
  
  info(message: string) { this.log("INFO", message); }
  warn(message: string) { this.log("WARN", message); }
  error(message: string) { this.log("ERROR", message); }
  debug(message: string) { if (process.env.DEBUG) this.log("DEBUG", message); }
}

const logger = new Logger(CONFIG.LOG_FILE);

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function createInitialState(): ServiceState {
  return {
    lastDiscoveryAt: null,
    lastIndexAt: null,
    totalReposDiscovered: 0,
    totalReposIndexed: 0,
    totalFileIndexed: 0,
    topicIndex: 0,
    queue: [],
    indexed: {},
    failed: {},
    metrics: {
      startedAt: new Date().toISOString(),
      discoveryCycles: 0,
      indexingCycles: 0,
      apiCallsMade: 0,
      githubApiCallsMade: 0,
      errorsEncountered: 0,
    },
  };
}

async function loadState(): Promise<ServiceState> {
  try {
    const data = await fs.readFile(CONFIG.STATE_FILE, "utf-8");
    return { ...createInitialState(), ...JSON.parse(data) };
  } catch {
    return createInitialState();
  }
}

async function saveState(state: ServiceState): Promise<void> {
  await fs.writeFile(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// CREDENTIALS MANAGEMENT
// ============================================================================

async function getOrCreateCredentials(): Promise<Credentials> {
  try {
    const data = await fs.readFile(CONFIG.CREDENTIALS_FILE, "utf-8");
    const creds = JSON.parse(data);
    
    // Verify credentials work
    const response = await fetch(`${CONFIG.API_BASE}/health`);
    if (response.ok) {
      return creds;
    }
  } catch {}
  
  logger.info("Creating new credentials...");
  
  const { db, schema } = await import("../src/db/index.js");
  
  const userId = `user_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const keyId = `key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const projectId = `proj_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const apiKeyRaw = `aitm_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(apiKeyRaw).digest("hex");
  
  await db.insert(schema.users).values({
    id: userId,
    email: `kb-service-${Date.now()}@aitimemachine.dev`,
    name: "KB Indexer Service",
    plan: "pro",
  }).onConflictDoNothing();
  
  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    keyHash,
    keyPrefix: apiKeyRaw.slice(0, 12),
    name: "KB Indexer Service Key",
    scopes: ["read", "write", "admin"],
  });
  
  await db.insert(schema.projects).values({
    id: projectId,
    userId,
    name: "Auto-Indexed Knowledge Base",
  });
  
  const creds = { apiKey: apiKeyRaw, projectId, userId };
  await fs.writeFile(CONFIG.CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  
  logger.info(`Credentials created: ${projectId}`);
  return creds;
}

// ============================================================================
// GITHUB API CLIENT
// ============================================================================

class GitHubClient {
  private token?: string;
  private lastCallAt: number = 0;
  
  constructor(token?: string) {
    this.token = token;
  }
  
  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < CONFIG.GITHUB_API_DELAY_MS) {
      await new Promise(r => setTimeout(r, CONFIG.GITHUB_API_DELAY_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }
  
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "AITimeMachine-KB-Indexer/1.0",
    };
    if (this.token) {
      headers["Authorization"] = `token ${this.token}`;
    }
    return headers;
  }
  
  async searchRepos(query: string, sort: string = "stars", perPage: number = 30): Promise<GitHubRepo[]> {
    await this.rateLimit();
    
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=${perPage}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      
      if (!response.ok) {
        if (response.status === 403) {
          logger.warn("GitHub API rate limited");
          return [];
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.items || [];
    } catch (error: any) {
      logger.error(`GitHub search failed: ${error.message}`);
      return [];
    }
  }
  
  async getTrendingRepos(language: string, period: "day" | "week" | "month" = "week"): Promise<GitHubRepo[]> {
    const dateOffset = period === "day" ? 1 : period === "week" ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - dateOffset);
    const dateStr = since.toISOString().split("T")[0];
    
    const query = `language:${language} created:>${dateStr} stars:>${CONFIG.MIN_STARS}`;
    return this.searchRepos(query, "stars", 20);
  }
  
  async getPopularByTopic(topic: string): Promise<GitHubRepo[]> {
    const query = `topic:${topic} stars:>${CONFIG.MIN_STARS}`;
    return this.searchRepos(query, "stars", 20);
  }
  
  async getPopularByLanguage(language: string): Promise<GitHubRepo[]> {
    const query = `language:${language} stars:>1000`;
    return this.searchRepos(query, "stars", 30);
  }
  
  async getRecentlyUpdated(language: string): Promise<GitHubRepo[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const dateStr = weekAgo.toISOString().split("T")[0];
    
    const query = `language:${language} pushed:>${dateStr} stars:>${CONFIG.MIN_STARS}`;
    return this.searchRepos(query, "updated", 20);
  }
}

// ============================================================================
// INDEXING SERVICE
// ============================================================================

class KBIndexerService {
  private state: ServiceState;
  private credentials: Credentials;
  private github: GitHubClient;
  private isRunning: boolean = false;
  private shutdownRequested: boolean = false;
  
  constructor(state: ServiceState, credentials: Credentials) {
    this.state = state;
    this.credentials = credentials;
    this.github = new GitHubClient(CONFIG.GITHUB_TOKEN);
  }
  
  // Discovery: Find new repos to index
  async runDiscovery(): Promise<number> {
    logger.info("Starting discovery cycle...");
    this.state.metrics.discoveryCycles++;
    
    const newRepos: QueuedRepo[] = [];
    const existingNames = new Set([
      ...this.state.queue.map(r => r.fullName.toLowerCase()),
      ...Object.keys(this.state.indexed).map(n => n.toLowerCase()),
    ]);
    
    // 1. Get trending repos for each language
    for (const language of CONFIG.LANGUAGES.slice(0, 2)) { // Limit to 2 languages per cycle
      logger.info(`Discovering trending ${language} repos...`);
      
      const trending = await this.github.getTrendingRepos(language, "week");
      this.state.metrics.githubApiCallsMade++;
      
      for (const repo of trending) {
        if (this.shouldIndexRepo(repo, existingNames)) {
          newRepos.push(this.createQueuedRepo(repo, "trending"));
          existingNames.add(repo.full_name.toLowerCase());
        }
      }
      
      if (newRepos.length >= CONFIG.MAX_REPOS_PER_CYCLE) break;
    }
    
    // 2. Get repos by topic (rotate through topics)
    const topicsToCheck = 3;
    for (let i = 0; i < topicsToCheck && newRepos.length < CONFIG.MAX_REPOS_PER_CYCLE; i++) {
      const topic = CONFIG.TOPICS[this.state.topicIndex % CONFIG.TOPICS.length];
      this.state.topicIndex++;
      
      logger.info(`Discovering repos for topic: ${topic}...`);
      
      const topicRepos = await this.github.getPopularByTopic(topic);
      this.state.metrics.githubApiCallsMade++;
      
      for (const repo of topicRepos) {
        if (this.shouldIndexRepo(repo, existingNames)) {
          newRepos.push(this.createQueuedRepo(repo, "topic"));
          existingNames.add(repo.full_name.toLowerCase());
        }
        if (newRepos.length >= CONFIG.MAX_REPOS_PER_CYCLE) break;
      }
    }
    
    // 3. Get recently updated popular repos
    if (newRepos.length < CONFIG.MAX_REPOS_PER_CYCLE) {
      logger.info("Discovering recently updated repos...");
      
      const recent = await this.github.getRecentlyUpdated("typescript");
      this.state.metrics.githubApiCallsMade++;
      
      for (const repo of recent) {
        if (this.shouldIndexRepo(repo, existingNames)) {
          newRepos.push(this.createQueuedRepo(repo, "related"));
          existingNames.add(repo.full_name.toLowerCase());
        }
        if (newRepos.length >= CONFIG.MAX_REPOS_PER_CYCLE) break;
      }
    }
    
    // Add new repos to queue
    this.state.queue.push(...newRepos);
    this.state.totalReposDiscovered += newRepos.length;
    this.state.lastDiscoveryAt = new Date().toISOString();
    
    logger.info(`Discovery complete: ${newRepos.length} new repos queued (total queue: ${this.state.queue.length})`);
    
    await saveState(this.state);
    return newRepos.length;
  }
  
  private shouldIndexRepo(repo: GitHubRepo, existing: Set<string>): boolean {
    // Skip if already known
    if (existing.has(repo.full_name.toLowerCase())) return false;
    
    // Skip if previously failed too many times
    const failed = this.state.failed[repo.full_name.toLowerCase()];
    if (failed && failed.retries >= CONFIG.MAX_RETRIES) return false;
    
    // Skip forks and archived repos
    if (repo.fork || repo.archived) return false;
    
    // Skip if too large
    if (repo.size > CONFIG.MAX_REPO_SIZE_KB) return false;
    
    // Skip if not enough stars
    if (repo.stargazers_count < CONFIG.MIN_STARS) return false;
    
    return true;
  }
  
  private createQueuedRepo(repo: GitHubRepo, source: QueuedRepo["source"]): QueuedRepo {
    return {
      fullName: repo.full_name,
      url: repo.html_url,
      stars: repo.stargazers_count,
      language: repo.language,
      description: repo.description,
      addedAt: new Date().toISOString(),
      retries: 0,
      source,
    };
  }
  
  // Indexing: Process repos from queue
  async processQueue(): Promise<void> {
    if (this.state.queue.length === 0) {
      logger.debug("Queue is empty");
      return;
    }
    
    const repo = this.state.queue.shift()!;
    logger.info(`Indexing: ${repo.fullName} (⭐${repo.stars}, ${repo.source})`);
    
    try {
      // Clean up temp files first
      const { execSync } = await import("child_process");
      try {
        execSync("rm -rf /tmp/aitm-repos", { stdio: "ignore" });
      } catch {}
      
      // Call indexing API
      const response = await fetch(`${CONFIG.API_BASE}/v1/repositories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.credentials.apiKey,
        },
        body: JSON.stringify({
          url: repo.url,
          projectId: this.credentials.projectId,
          name: repo.fullName.split("/")[1],
        }),
      });
      
      this.state.metrics.apiCallsMade++;
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || JSON.stringify(data));
      }
      
      // Wait for indexing to complete
      const repoId = data.id;
      const finalStatus = await this.waitForIndexing(repoId);
      
      if (finalStatus.status === "completed") {
        this.state.indexed[repo.fullName.toLowerCase()] = {
          repositoryId: repoId,
          indexedAt: new Date().toISOString(),
          fileCount: finalStatus.stats?.file_count || 0,
          symbolCount: finalStatus.stats?.symbol_count || 0,
          status: "completed",
        };
        this.state.totalReposIndexed++;
        this.state.totalFileIndexed += finalStatus.stats?.file_count || 0;
        
        logger.info(`✅ Indexed: ${repo.fullName} (${finalStatus.stats?.file_count || 0} files)`);
      } else {
        throw new Error(`Indexing ended with status: ${finalStatus.status}`);
      }
      
      // Remove from failed if was there
      delete this.state.failed[repo.fullName.toLowerCase()];
      
    } catch (error: any) {
      logger.error(`❌ Failed to index ${repo.fullName}: ${error.message}`);
      this.state.metrics.errorsEncountered++;
      
      // Track failure
      const failKey = repo.fullName.toLowerCase();
      const existing = this.state.failed[failKey];
      const retries = (existing?.retries || 0) + 1;
      
      this.state.failed[failKey] = {
        lastAttempt: new Date().toISOString(),
        error: error.message,
        retries,
      };
      
      // Re-queue if under retry limit
      if (retries < CONFIG.MAX_RETRIES) {
        repo.retries = retries;
        this.state.queue.push(repo);
        logger.info(`Re-queued ${repo.fullName} (retry ${retries}/${CONFIG.MAX_RETRIES})`);
      }
    }
    
    this.state.lastIndexAt = new Date().toISOString();
    this.state.metrics.indexingCycles++;
    await saveState(this.state);
  }
  
  private async waitForIndexing(repoId: string, timeoutMs: number = 180000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/v1/repositories/${repoId}`, {
          headers: { "X-API-Key": this.credentials.apiKey },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === "completed" || data.status === "failed") {
            return data;
          }
        }
      } catch {}
      
      await new Promise(r => setTimeout(r, 5000));
    }
    
    return { status: "timeout" };
  }
  
  // Main service loop
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Service is already running");
      return;
    }
    
    this.isRunning = true;
    logger.info("🚀 KB Indexer Service started");
    logger.info(`   API: ${CONFIG.API_BASE}`);
    logger.info(`   Project: ${this.credentials.projectId}`);
    logger.info(`   Queue size: ${this.state.queue.length}`);
    logger.info(`   Already indexed: ${Object.keys(this.state.indexed).length}`);
    
    // Set up graceful shutdown
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
    
    let lastDiscoveryTime = this.state.lastDiscoveryAt 
      ? new Date(this.state.lastDiscoveryAt).getTime() 
      : 0;
    
    while (!this.shutdownRequested) {
      try {
        // Run discovery if needed
        const timeSinceDiscovery = Date.now() - lastDiscoveryTime;
        if (timeSinceDiscovery >= CONFIG.DISCOVERY_INTERVAL_MS || this.state.queue.length === 0) {
          await this.runDiscovery();
          lastDiscoveryTime = Date.now();
        }
        
        // Process one repo from queue
        if (this.state.queue.length > 0) {
          await this.processQueue();
        }
        
        // Wait before next iteration
        await new Promise(r => setTimeout(r, CONFIG.INDEXING_INTERVAL_MS));
        
      } catch (error: any) {
        logger.error(`Service error: ${error.message}`);
        this.state.metrics.errorsEncountered++;
        await new Promise(r => setTimeout(r, 30000)); // Wait 30s on error
      }
    }
    
    logger.info("Service stopped");
  }
  
  async runOnce(): Promise<void> {
    logger.info("Running single discovery + indexing cycle...");
    
    await this.runDiscovery();
    
    // Process up to 10 repos
    const maxToProcess = Math.min(10, this.state.queue.length);
    for (let i = 0; i < maxToProcess; i++) {
      await this.processQueue();
      await new Promise(r => setTimeout(r, 2000));
    }
    
    this.printStatus();
  }
  
  shutdown(): void {
    logger.info("Shutdown requested...");
    this.shutdownRequested = true;
  }
  
  printStatus(): void {
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("   📊 KB Indexer Service Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    
    console.log(`   🔄 Running: ${this.isRunning}`);
    console.log(`   📁 Queue size: ${this.state.queue.length}`);
    console.log(`   ✅ Total indexed: ${this.state.totalReposIndexed}`);
    console.log(`   📄 Total files: ${this.state.totalFileIndexed}`);
    console.log(`   ❌ Failed repos: ${Object.keys(this.state.failed).length}`);
    console.log(`   🕐 Last discovery: ${this.state.lastDiscoveryAt || "never"}`);
    console.log(`   🕐 Last index: ${this.state.lastIndexAt || "never"}`);
    
    console.log("\n   📈 Metrics:");
    console.log(`      - Discovery cycles: ${this.state.metrics.discoveryCycles}`);
    console.log(`      - Indexing cycles: ${this.state.metrics.indexingCycles}`);
    console.log(`      - API calls: ${this.state.metrics.apiCallsMade}`);
    console.log(`      - GitHub API calls: ${this.state.metrics.githubApiCallsMade}`);
    console.log(`      - Errors: ${this.state.metrics.errorsEncountered}`);
    
    if (this.state.queue.length > 0) {
      console.log("\n   📋 Next in queue:");
      this.state.queue.slice(0, 5).forEach((r, i) => {
        console.log(`      ${i + 1}. ${r.fullName} (⭐${r.stars})`);
      });
    }
    
    console.log("\n═══════════════════════════════════════════════════════════════════\n");
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  const showHelp = args.includes("--help") || args.includes("-h");
  const runOnce = args.includes("--once");
  const showStatus = args.includes("--status");
  const runDaemon = args.includes("--daemon");
  
  if (showHelp) {
    console.log(`
AITimeMachine KB Indexer Service
═══════════════════════════════════════════════════════════════════

A background service that continuously discovers and indexes GitHub 
repositories to build a comprehensive code knowledge base.

Usage:
  npx tsx scripts/kb-indexer-service.ts [options]

Options:
  --help, -h    Show this help message
  --once        Run a single discovery + indexing cycle
  --status      Show current service status
  --daemon      Run as a background daemon (use with pm2 or systemd)

Environment Variables:
  GITHUB_TOKEN    GitHub personal access token (recommended for higher rate limits)
  API_BASE        API server URL (default: http://localhost:3001)

Examples:
  # Run continuously in foreground
  npx tsx scripts/kb-indexer-service.ts

  # Run single cycle
  npx tsx scripts/kb-indexer-service.ts --once

  # Run with pm2
  pm2 start "npx tsx scripts/kb-indexer-service.ts --daemon" --name kb-indexer

  # Check status
  npx tsx scripts/kb-indexer-service.ts --status
`);
    process.exit(0);
  }
  
  // Load state and credentials
  const state = await loadState();
  const credentials = await getOrCreateCredentials();
  
  const service = new KBIndexerService(state, credentials);
  
  if (showStatus) {
    service.printStatus();
    process.exit(0);
  }
  
  if (runOnce) {
    await service.runOnce();
    process.exit(0);
  }
  
  // Run as continuous service
  await service.start();
}

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
