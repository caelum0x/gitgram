#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

import { SqliteRepo } from "./store/sqlite_repo.js";
import { CasStore } from "./core/cas.js";
import { buildManifest, parseManifestJson, type FileEntry as ManifestFileEntry } from "./core/manifest.js";
import { restoreWorkspaceAtomic, restoreWorkspaceWithRetry, resumeRestoreFromLatestTmp, getRestoreDiagnosticsSummary, listRestoreDiagnostics } from "./core/restore.js";
import { ProjectLock } from "./core/lock.js";
import { makeIgnoreMatcher, DEFAULT_IGNORES } from "./core/ignore.js";
import { persistCheckpointTrees } from "./core/checkpoint-tree-storage.js";
import { GitEngine } from "./core/git-engine.js";
import { runMcpServer } from "./mcp/server.js";
import { runGarbageCollection } from "./core/gc.js";
import { verifyIntegrity } from "./core/integrity.js";
import { runClaudeSession } from "./cli/claude-wrapper.js";
import { runCommand } from "./cli/run-command.js";
import { buildContextPacket } from "./context/context-packet.js";
import { runInitPreflight } from "./cli/preflight.js";
import { verifyActionChains } from "./tools/action-chain-integrity.js";
import { getBenchmarkDashboard, recordBenchmarkEvent } from "./core/benchmark-metrics.js";
import { runSearchRelevanceBenchmark } from "./core/search-relevance-benchmark.js";

const DATA_DIR = path.join(os.homedir(), ".aitimemachine");
const DB_PATH = path.join(DATA_DIR, "db.sqlite");

type SearchCheckpointResult = {
  checkpointId: string;
  name: string;
  createdAt: string;
  score: number;
};

type FileHistoryItem = {
  checkpointId: string;
  description: string;
  timestamp: string;
  changeType: "current" | "modified" | "added";
  hash?: string;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Best-effort: mirror a checkpoint into a real git commit.
 *
 * This runs AFTER the CAS/tree checkpoint is durably written, and is fully
 * guarded — any failure (no git binary, not a repo, nothing to commit, etc.)
 * is swallowed with a soft warning so it can NEVER break the primary
 * checkpoint. Returns the commit hash on success, or `null` otherwise.
 *
 * Set `AITM_GIT_MIRROR=0` to disable.
 */
async function mirrorCheckpointToGit(
  rootPath: string,
  description: string,
  checkpointId: string
): Promise<string | null> {
  if (process.env.AITM_GIT_MIRROR === "0") {
    return null;
  }
  try {
    const engine = new GitEngine({ cwd: rootPath });
    if (!(await engine.isRepository())) {
      // Not a git work tree — nothing to mirror into. Silent: this is the
      // common case for projects that only use AITM checkpoints.
      return null;
    }
    await engine.add(["-A"]);
    const { commitHash } = await engine.commit(
      `aitm checkpoint: ${description} [${checkpointId}]`,
      { allowEmpty: true }
    );
    return commitHash;
  } catch (err) {
    // Soft-fail only — the CAS/tree checkpoint above is the source of truth.
    console.log(
      `  (git mirror skipped: ${errorMessage(err)})`
    );
    return null;
  }
}

function getRepo() {
  ensureDataDir();
  return new SqliteRepo(DB_PATH);
}

function getCas() {
  ensureDataDir();
  return new CasStore(path.join(DATA_DIR, "blobs"));
}

const program = new Command();

program
  .name("aitm")
  .description("Gitgram TimeMachine - Time travel for AI-assisted development")
  .version("2.0.0");

// Initialize project
program
  .command("init")
  .description("Initialize Gitgram TimeMachine for current project")
  .option("-n, --name <name>", "Project name")
  .action(async (options) => {
    const cwd = process.cwd();
    const preflight = runInitPreflight(cwd);
    if (!preflight.ok) {
      console.error("❌ Preflight failed:");
      preflight.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }
    if (preflight.warnings.length > 0) {
      console.warn("⚠️  Preflight warnings:");
      preflight.warnings.forEach((warn) => console.warn(`  - ${warn}`));
    }
    const projectName = options.name || path.basename(cwd);
    const projectId = `proj_${crypto.randomBytes(8).toString("hex")}`;

    const repo = getRepo();

    repo.insertProject({
      projectId,
      rootPath: cwd,
      name: projectName,
      ignoreGlobs: DEFAULT_IGNORES,
    });

    console.log(`✓ Initialized Gitgram TimeMachine for "${projectName}"`);
    console.log(`  Project ID: ${projectId}`);
    console.log(`  Root: ${cwd}`);
    console.log(`\nNext steps:`);
    console.log(`  aitm checkpoint "Initial state"`);
    console.log(`  aitm list`);
  });

// Create checkpoint
program
  .command("checkpoint")
  .description("Create a manual checkpoint")
  .argument("<description>", "Checkpoint description")
  .option("-s, --scope <scope>", "Scope (files, files+chat, full)", "files")
  .action(async (description, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    // Find project by root path
    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized. Run 'aitm init' first.");
      process.exit(1);
    }

    console.log(`Creating checkpoint "${description}"...`);

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();

    try {
      const ignoreMatcher = makeIgnoreMatcher([...project.ignoreGlobs, ...DEFAULT_IGNORES]);

      // Build manifest
      const { manifest, fileCount, bytesHashed, redactionEvents } = await buildManifest(project.rootPath, cas, {
        ignore: ignoreMatcher,
      });

      // Store manifest as blob
      const manifestText = JSON.stringify(manifest, null, 2);
      const manifestBlob = cas.putBytes("application/json", Buffer.from(manifestText, "utf8"));
      const rootTreeHash = persistCheckpointTrees(repo, project.projectId, manifest.files);

      // Create checkpoint
      const checkpoint = repo.insertCheckpoint({
        checkpointId: `cp_${crypto.randomBytes(8).toString("hex")}`,
        projectId: project.projectId,
        name: description,
        scope: options.scope,
        manifestBlobHash: manifestBlob.hash,
        rootTreeHash,
      });

      console.log(`✓ Checkpoint created: ${checkpoint.checkpointId}`);
      console.log(`  Files: ${fileCount}`);
      console.log(`  Size: ${(bytesHashed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Created: ${checkpoint.createdAt}`);

      // Best-effort: also create a real git commit mirroring this checkpoint.
      // Guarded so it can never break the CAS/tree checkpoint written above.
      const gitCommit = await mirrorCheckpointToGit(
        project.rootPath,
        description,
        checkpoint.checkpointId
      );
      if (gitCommit !== null) {
        console.log(`  Git commit: ${gitCommit.slice(0, 12)}`);
      }

      // Report redactions
      if (redactionEvents.length > 0) {
        console.log(`\n⚠️  ${redactionEvents.length} file(s) redacted (contained secrets):`);
        redactionEvents.slice(0, 5).forEach((event) => {
          console.log(`  - ${event.filePath}: ${event.reason}`);
        });
        if (redactionEvents.length > 5) {
          console.log(`  ... and ${redactionEvents.length - 5} more`);
        }
      }
    } finally {
      lock.release();
    }
  });

// List checkpoints
program
  .command("list")
  .description("List all checkpoints")
  .option("-l, --limit <n>", "Limit results", "20")
  .option("--json", "Output as JSON")
  .action((options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized. Run 'aitm init' first.");
      }
      process.exit(1);
    }

    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, parseInt(options.limit));

    if (options.json) {
      // JSON output for VSCode extension
      const output = checkpoints.map(cp => {
        // Get file stats from manifest
        let stats = { totalFiles: 0, totalSize: 0 };
        try {
          const manifestBlob = cas.getBytes(cp.manifestBlobHash);
          const manifest = parseManifestJson(manifestBlob.toString("utf8"));
          stats.totalFiles = manifest.files?.length || 0;
          stats.totalSize = manifest.files?.reduce((sum: number, f) => sum + (f.size || 0), 0) || 0;
        } catch {}

        return {
          id: cp.checkpointId,
          description: cp.name,
          timestamp: cp.createdAt,
          scope: cp.scope,
          stats,
          metadata: {
            type: cp.scope,
          }
        };
      });
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (checkpoints.length === 0) {
      console.log("No checkpoints yet. Create one with 'aitm checkpoint <description>'");
      return;
    }

    console.log(`\nCheckpoints for "${project.name}":\n`);
    checkpoints.forEach((cp, i) => {
      console.log(`${i + 1}. ${cp.checkpointId.slice(0, 16)}... - ${cp.name}`);
      console.log(`   ${cp.createdAt} [${cp.scope}]`);
    });
  });

// Verify before/after action chain integrity
program
  .command("verify-action-chains")
  .description("Verify before/after checkpoint link integrity for a project")
  .option("-p, --project <id>", "Project ID (defaults to current directory project)")
  .option("-l, --limit <n>", "Maximum checkpoints to verify", "2000")
  .option("--json", "Output as JSON")
  .action((options) => {
    const cwd = process.cwd();
    const repo = getRepo();

    let projectId = options.project as string | undefined;
    if (!projectId) {
      const project = repo.listProjects().find((p) => p.rootPath === cwd);
      if (!project) {
        const payload = { error: "Project not initialized. Run 'aitm init' first." };
        if (options.json) console.log(JSON.stringify(payload));
        else console.error(`❌ ${payload.error}`);
        process.exit(1);
      }
      projectId = project.projectId;
    }

    const report = verifyActionChains(repo, projectId, {
      limit: parseInt(options.limit, 10),
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\nAction Chain Verification (${projectId})`);
      console.log(`Checkpoints scanned: ${report.totalCheckpoints}`);
      console.log(`Linked checkpoints: ${report.linkedCheckpoints}`);
      console.log(`Valid linked checkpoints: ${report.validLinkedCheckpoints}`);
      console.log(`Issues: ${report.issues.length}`);
      if (report.issues.length > 0) {
        console.log("\nTop issues:");
        for (const issue of report.issues.slice(0, 20)) {
          console.log(`- [${issue.code}] ${issue.checkpointId}${issue.linkedCheckpointId ? ` -> ${issue.linkedCheckpointId}` : ""}: ${issue.message}`);
        }
      }
      console.log("");
    }

    process.exit(report.valid ? 0 : 2);
  });

// Show checkpoint details
program
  .command("show")
  .description("Show checkpoint details")
  .argument("<checkpointId>", "Checkpoint ID")
  .action((checkpointId) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);

    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
    const manifest = parseManifestJson(manifestBlob.toString("utf8"));

    console.log(`\nCheckpoint: ${checkpoint.checkpointId}`);
    console.log(`Name: ${checkpoint.name}`);
    console.log(`Created: ${checkpoint.createdAt}`);
    console.log(`Scope: ${checkpoint.scope}`);
    console.log(`Files: ${manifest.files.length}`);
    console.log(`\nRecent files:`);
    manifest.files.slice(0, 10).forEach(f => {
      console.log(`  ${f.path} (${(f.size / 1024).toFixed(1)} KB)`);
    });
  });

// Restore checkpoint
program
  .command("restore")
  .description("Restore to a checkpoint")
  .argument("<checkpointId>", "Checkpoint ID")
  .option("-m, --mode <mode>", "Restore mode (safe|hard)", "safe")
  .option("-r, --retry <n>", "Retry attempts for transient restore failures", "1")
  .option("--no-backup", "Skip backup of current state")
  .action((checkpointId, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);

    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    console.log(`\n⚠️  This will restore your project to:`);
    console.log(`  ${checkpoint.name}`);
    console.log(`  Created: ${checkpoint.createdAt}`);
    console.log(`  Mode: ${options.mode}`);
    console.log(`  Backup current: ${options.backup ? 'yes' : 'no'}`);

    // In production, add interactive confirmation here

    console.log(`\nRestoring...`);

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();
    const startedAt = Date.now();

    try {
      const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));

      const result = restoreWorkspaceWithRetry({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: options.mode as "safe" | "hard",
        backupCurrent: options.backup,
        maxAttempts: parseInt(options.retry, 10) || 1,
      });

      console.log(`✓ Restored ${result.filesWritten} files`);
      if (result.attempts > 1) {
        console.log(`  Attempts: ${result.attempts}`);
      }
      if (result.backupPath) {
        console.log(`  Backup saved to: ${result.backupPath}`);
      }
      recordBenchmarkEvent(project.rootPath, {
        timestamp: new Date().toISOString(),
        operation: "restore",
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: options.mode,
          attempts: result.attempts,
        },
      });
    } catch (err) {
      recordBenchmarkEvent(project.rootPath, {
        timestamp: new Date().toISOString(),
        operation: "restore",
        success: false,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: options.mode,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    } finally {
      lock.release();
    }
  });

// Resume interrupted restore
program
  .command("restore-resume")
  .description("Resume the latest interrupted restore swap from .tm_internal staging")
  .action(() => {
    const cwd = process.cwd();
    const repo = getRepo();
    const projects = repo.listProjects();
    const project = projects.find((p) => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();
    try {
      const result = resumeRestoreFromLatestTmp({ projectRoot: project.rootPath });
      console.log(`✓ Resumed restore for staged snapshot ${result.timestamp}`);
      console.log(`  Restored entries: ${result.restoredEntries}`);
      if (result.replacedEntries > 0) {
        console.log(`  Replaced existing entries: ${result.replacedEntries}`);
      }
      if (result.tmpOldPath) {
        console.log(`  Previous workspace staging kept at: ${result.tmpOldPath}`);
      }
      for (const warning of result.warnings) {
        console.warn(`  ⚠️ ${warning}`);
      }
    } finally {
      lock.release();
    }
  });

// Restore diagnostics summary
program
  .command("restore-diagnostics")
  .description("Show restore diagnostics summary from previous failed attempts")
  .option("--json", "Output as JSON")
  .option("--all", "Show all diagnostics, not just the latest")
  .action((options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const projects = repo.listProjects();
    const project = projects.find((p) => p.rootPath === cwd);

    if (!project) {
      console.error("Project not initialized.");
      process.exit(1);
    }

    if (options.all) {
      const all = listRestoreDiagnostics({ projectRoot: project.rootPath });
      if (all.length === 0) {
        console.log("No restore diagnostics found.");
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(all, null, 2));
      } else {
        console.log(`Found ${all.length} restore diagnostics record(s):\n`);
        for (const entry of all) {
          const lastAttempt = entry.payload.attempts[entry.payload.attempts.length - 1];
          console.log(`  ${entry.filename}`);
          console.log(`    Recorded: ${entry.payload.recordedAt}`);
          console.log(`    Attempts: ${entry.payload.attempts.length}`);
          console.log(`    Mode: ${entry.payload.mode}`);
          if (lastAttempt) {
            console.log(`    Last phase: ${lastAttempt.phase}`);
            console.log(`    Last error: ${lastAttempt.message}`);
            if (lastAttempt.code) console.log(`    Error code: ${lastAttempt.code}`);
          }
          console.log();
        }
      }
    } else {
      const summary = getRestoreDiagnosticsSummary({ projectRoot: project.rootPath });
      if (!summary) {
        console.log("No restore diagnostics found.");
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log("Latest restore diagnostics:\n");
        console.log(`  File: ${summary.latestFile}`);
        console.log(`  Recorded at: ${summary.recordedAt}`);
        console.log(`  Total attempts: ${summary.totalAttempts}`);
        console.log(`  Last phase: ${summary.lastPhase}`);
        console.log(`  Last error: ${summary.lastErrorMessage}`);
        if (summary.lastErrorCode) {
          console.log(`  Error code: ${summary.lastErrorCode}`);
        }
        console.log(`  Restore mode: ${summary.mode}`);
        console.log(`  Suggested: ${summary.suggestedNextCommand}`);
        if (summary.allDiagnosticsCount > 1) {
          console.log(`\n  ${summary.allDiagnosticsCount} total diagnostics records. Use --all to see all.`);
        }
      }
    }
  });

// Search
program
  .command("search")
  .description("Search checkpoints")
  .argument("<query>", "Search query")
  .option("--json", "Output as JSON")
  .option("--natural", "Use natural language search")
  .action(async (query, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    let results: SearchCheckpointResult[];
    if (options.natural) {
      // Use natural language parsing
      const { parseTimeQuery, findCheckpointsForQuery } = await import("./cli/natural-language.js");
      const parsedQuery = parseTimeQuery(query);
      results = findCheckpointsForQuery(repo, project.projectId, parsedQuery, 20);
    } else {
      results = repo.searchCheckpoints(project.projectId, query).map(cp => ({
        checkpointId: cp.checkpointId,
        name: cp.name,
        createdAt: cp.createdAt,
        score: 1.0,
      }));
    }

    if (options.json) {
      const output = results.map((cp) => {
        let stats = { totalFiles: 0, totalSize: 0 };
        try {
          const fullCp = repo.getCheckpoint(project.projectId, cp.checkpointId);
          if (fullCp) {
            const manifestBlob = cas.getBytes(fullCp.manifestBlobHash);
            const manifest = parseManifestJson(manifestBlob.toString("utf8"));
            stats.totalFiles = manifest.files?.length || 0;
            stats.totalSize = manifest.files?.reduce((sum: number, f) => sum + (f.size || 0), 0) || 0;
          }
        } catch {}

        return {
          id: cp.checkpointId,
          checkpointId: cp.checkpointId,
          description: cp.name,
          name: cp.name,
          timestamp: cp.createdAt,
          createdAt: cp.createdAt,
          stats,
        };
      });
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }

    console.log(`\nFound ${results.length} checkpoint(s):\n`);
    results.forEach((cp, i: number) => {
      console.log(`${i + 1}. ${cp.checkpointId} - ${cp.name}`);
      console.log(`   ${cp.createdAt}`);
    });
  });

// Status - show pending changes
program
  .command("status")
  .description("Show pending changes since last checkpoint")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    // Get latest checkpoint
    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 1);

    // Build current manifest
    const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
    const { manifest: currentManifest } = await buildManifest(cwd, cas, { ignore: ignoreMatcher });

    const currentFiles = new Map(currentManifest.files.map(f => [f.path, f]));

    let added: string[] = [];
    let modified: string[] = [];
    let deleted: string[] = [];

    if (checkpoints.length > 0) {
      const lastCheckpoint = checkpoints[0];
      try {
        const manifestBlob = cas.getBytes(lastCheckpoint.manifestBlobHash);
        const lastManifest = parseManifestJson(manifestBlob.toString("utf8"));
        const lastFiles = new Map<string, ManifestFileEntry>((lastManifest.files || []).map((f) => [f.path, f]));

        // Find added and modified
        for (const [filePath, file] of currentFiles) {
          const lastFile = lastFiles.get(filePath);
          if (!lastFile) {
            added.push(filePath);
          } else if (lastFile.hash !== file.hash) {
            modified.push(filePath);
          }
        }

        // Find deleted
        for (const filePath of lastFiles.keys()) {
          if (!currentFiles.has(filePath)) {
            deleted.push(filePath);
          }
        }
      } catch {}
    } else {
      // No checkpoints - all files are "new"
      added = Array.from(currentFiles.keys());
    }

    if (options.json) {
      console.log(JSON.stringify({ added, modified, deleted }, null, 2));
      return;
    }

    const total = added.length + modified.length + deleted.length;
    if (total === 0) {
      console.log("No changes since last checkpoint.");
      return;
    }

    console.log(`\nChanges since last checkpoint:\n`);
    if (added.length > 0) {
      console.log(`Added (${added.length}):`);
      added.slice(0, 10).forEach(f => console.log(`  + ${f}`));
      if (added.length > 10) console.log(`  ... and ${added.length - 10} more`);
    }
    if (modified.length > 0) {
      console.log(`\nModified (${modified.length}):`);
      modified.slice(0, 10).forEach(f => console.log(`  ~ ${f}`));
      if (modified.length > 10) console.log(`  ... and ${modified.length - 10} more`);
    }
    if (deleted.length > 0) {
      console.log(`\nDeleted (${deleted.length}):`);
      deleted.slice(0, 10).forEach(f => console.log(`  - ${f}`));
      if (deleted.length > 10) console.log(`  ... and ${deleted.length - 10} more`);
    }
  });

// File history - show checkpoint history for a specific file
program
  .command("file-history")
  .description("Show checkpoint history for a specific file")
  .argument("<file>", "File path (relative to project root)")
  .option("--json", "Output as JSON")
  .option("-l, --limit <n>", "Limit results", "20")
  .action((file, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 100);
    const history: FileHistoryItem[] = [];

    let prevHash: string | null = null;

    for (const cp of checkpoints) {
      try {
        const manifestBlob = cas.getBytes(cp.manifestBlobHash);
        const manifest = parseManifestJson(manifestBlob.toString("utf8"));
        const fileEntry = (manifest.files || []).find((f) => f.path === file);

        if (fileEntry) {
          if (prevHash === null) {
            // First occurrence - file exists in latest
            history.push({
              checkpointId: cp.checkpointId,
              description: cp.name,
              timestamp: cp.createdAt,
              changeType: 'current',
              hash: fileEntry.hash,
            });
          } else if (fileEntry.hash !== prevHash) {
            // File was modified
            history.push({
              checkpointId: cp.checkpointId,
              description: cp.name,
              timestamp: cp.createdAt,
              changeType: 'modified',
              hash: fileEntry.hash,
            });
          }
          prevHash = fileEntry.hash;
        } else if (prevHash !== null) {
          // File was added (didn't exist before this checkpoint)
          history.push({
            checkpointId: cp.checkpointId,
            description: cp.name,
            timestamp: cp.createdAt,
            changeType: 'added',
          });
          break; // Found where file was added
        }
      } catch {}
    }

    if (options.json) {
      console.log(JSON.stringify(history.slice(0, parseInt(options.limit)), null, 2));
      return;
    }

    if (history.length === 0) {
      console.log(`No history found for: ${file}`);
      return;
    }

    console.log(`\nHistory for ${file}:\n`);
    history.slice(0, parseInt(options.limit)).forEach((h, i) => {
      const icon = h.changeType === 'added' ? '+' : h.changeType === 'modified' ? '~' : '•';
      console.log(`${i + 1}. ${icon} ${h.description}`);
      console.log(`   ${h.timestamp} [${h.changeType}]`);
    });
  });

// Get file at checkpoint
program
  .command("get-file")
  .description("Get file content at a specific checkpoint")
  .argument("<checkpointId>", "Checkpoint ID")
  .argument("<file>", "File path")
  .action((checkpointId, file) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);
    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    try {
      const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));
      const fileEntry = (manifest.files || []).find((f) => f.path === file);

      if (!fileEntry) {
        console.error(`❌ File not found in checkpoint: ${file}`);
        process.exit(1);
      }

      const content = cas.getBytes(fileEntry.hash);
      process.stdout.write(content);
    } catch (err: unknown) {
      console.error(`❌ Failed to get file: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

// Preview restore
program
  .command("preview")
  .description("Preview what restore would change")
  .argument("<checkpointId>", "Checkpoint ID")
  .action(async (checkpointId) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);
    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    // Build current manifest
    const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
    const { manifest: currentManifest } = await buildManifest(cwd, cas, { ignore: ignoreMatcher });
    const currentFiles = new Map(currentManifest.files.map(f => [f.path, f]));

    // Get checkpoint manifest
    const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
    const checkpointManifest = parseManifestJson(manifestBlob.toString("utf8"));
    const checkpointFiles = new Map<string, ManifestFileEntry>((checkpointManifest.files || []).map((f) => [f.path, f]));

    const toAdd: string[] = [];
    const toModify: string[] = [];
    const toDelete: string[] = [];

    // Files that will be added/modified (exist in checkpoint)
    for (const [filePath, file] of checkpointFiles) {
      const currentFile = currentFiles.get(filePath);
      if (!currentFile) {
        toAdd.push(filePath);
      } else if (currentFile.hash !== file.hash) {
        toModify.push(filePath);
      }
    }

    // Files that will be deleted (exist in current but not checkpoint)
    for (const filePath of currentFiles.keys()) {
      if (!checkpointFiles.has(filePath)) {
        toDelete.push(filePath);
      }
    }

    console.log(`\nRestore Preview: ${checkpoint.name}\n`);
    console.log(`Created: ${checkpoint.createdAt}`);
    console.log(`Files in checkpoint: ${checkpointFiles.size}`);
    console.log(`\nChanges that would be made:\n`);

    if (toAdd.length > 0) {
      console.log(`Will add (${toAdd.length}):`);
      toAdd.slice(0, 10).forEach(f => console.log(`  + ${f}`));
      if (toAdd.length > 10) console.log(`  ... and ${toAdd.length - 10} more`);
    }

    if (toModify.length > 0) {
      console.log(`\nWill modify (${toModify.length}):`);
      toModify.slice(0, 10).forEach(f => console.log(`  ~ ${f}`));
      if (toModify.length > 10) console.log(`  ... and ${toModify.length - 10} more`);
    }

    if (toDelete.length > 0) {
      console.log(`\nWill delete (${toDelete.length}):`);
      toDelete.slice(0, 10).forEach(f => console.log(`  - ${f}`));
      if (toDelete.length > 10) console.log(`  ... and ${toDelete.length - 10} more`);
    }

    const total = toAdd.length + toModify.length + toDelete.length;
    if (total === 0) {
      console.log("No changes needed - workspace matches checkpoint.");
    }
  });

// Restore single file from checkpoint
program
  .command("restore-file")
  .description("Restore a single file from a checkpoint")
  .argument("<checkpointId>", "Checkpoint ID")
  .argument("<file>", "File path")
  .action((checkpointId, file) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);
    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    try {
      const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));
      const fileEntry = (manifest.files || []).find((f) => f.path === file);

      if (!fileEntry) {
        console.error(`❌ File not found in checkpoint: ${file}`);
        process.exit(1);
      }

      const content = cas.getBytes(fileEntry.hash);
      const targetPath = path.join(cwd, file);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);

      console.log(`✓ Restored: ${file}`);
    } catch (err: unknown) {
      console.error(`❌ Failed to restore file: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

// Whoami - show authenticated user
program
  .command("whoami")
  .description("Show currently authenticated user")
  .option("--json", "Output as JSON")
  .action((options) => {
    const credPath = path.join(DATA_DIR, "credentials.json");

    if (!fs.existsSync(credPath)) {
      if (options.json) {
        console.log(JSON.stringify({ authenticated: false }));
      } else {
        console.log("Not logged in. Run 'aitm login' to authenticate.");
      }
      return;
    }

    try {
      const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));

      if (options.json) {
        console.log(JSON.stringify({
          authenticated: true,
          user: {
            email: creds.email,
            id: creds.userId,
          },
          cloudSync: true,
        }));
      } else {
        console.log(`Logged in as: ${creds.email}`);
        console.log(`User ID: ${creds.userId}`);
        console.log("Cloud sync: enabled");
      }
    } catch {
      if (options.json) {
        console.log(JSON.stringify({ authenticated: false }));
      } else {
        console.log("Not logged in. Run 'aitm login' to authenticate.");
      }
    }
  });

// Stats
program
  .command("stats")
  .description("Show storage statistics")
  .action(() => {
    const repo = getRepo();
    const stats = repo.getStats();

    console.log(`\nGitgram TimeMachine Statistics:\n`);
    console.log(`Projects: ${stats.projects}`);
    console.log(`Checkpoints: ${stats.checkpoints}`);
    console.log(`Events: ${stats.events}`);
    console.log(`\nData directory: ${DATA_DIR}`);
  });

// MCP Server
program
  .command("mcp")
  .description("Run MCP server for AI tools")
  .action(async () => {
    const repo = getRepo();
    await runMcpServer({ repo, dataDir: DATA_DIR });
  });

// Garbage Collection
program
  .command("gc")
  .description("Run garbage collection to remove unreferenced blobs")
  .option("--dry-run", "Show what would be deleted without deleting")
  .option("--keep-days <days>", "Keep checkpoints from last N days (default: 7)", "7")
  .option("--keep-minimum <count>", "Keep at least N recent checkpoints (default: 10)", "10")
  .action(async (options) => {
    const { TimeMachineEngine } = await import('./core/engine.js');
    const engine = new TimeMachineEngine(process.cwd());

    console.log(`Running garbage collection${options.dryRun ? " (DRY RUN)" : ""}...\n`);

    const result = await runGarbageCollection(engine, {
      dryRun: options.dryRun,
      keepDays: parseInt(options.keepDays),
      keepMinimum: parseInt(options.keepMinimum),
    });

    console.log(`Checkpoints removed: ${result.checkpointsRemoved}`);
    console.log(`Blobs removed: ${result.blobsRemoved}`);
    console.log(`Space reclaimed: ${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB`);
    if (result.sla) {
      console.log(`SLA status: ${result.sla.healthy ? "healthy" : "alerting"}`);
      console.log(`Pending deletions: ${result.sla.pendingDeletions}`);
      console.log(`GC duration: ${result.sla.runDurationMs} ms`);
      if (result.sla.alerts.length > 0) {
        console.log(`Alerts:`);
        result.sla.alerts.slice(0, 5).forEach((a) => console.log(`  - [${a.severity}] ${a.code}: ${a.message}`));
      }
    }
    
    if (result.packCreated) {
      console.log(`Pack created: ${(result.packSize! / 1024 / 1024).toFixed(2)} MB`);
    }

    if (options.dryRun) {
      console.log(`\nRun without --dry-run to actually delete blobs.`);
    }
  });

// Integrity Check
program
  .command("verify")
  .description("Verify integrity of checkpoints and blobs")
  .argument("<project-id>", "Project ID to verify")
  .option("--deep", "Deep verification (re-hash all blobs)")
  .action(async (projectId, options) => {
    const repo = getRepo();
    const cas = getCas();

    const level = options.deep ? "deep" : "light";
    console.log(`Running ${level} integrity check for project ${projectId}...\n`);

    const result = await verifyIntegrity(repo, cas, projectId, level);

    console.log(`Checkpoints checked: ${result.checkpointsChecked}`);
    console.log(`Manifests verified: ${result.manifestsVerified}`);
    console.log(`Blobs verified: ${result.blobsVerified}`);

    if (result.passed) {
      console.log(`\n✅ Integrity check PASSED`);
    } else {
      console.log(`\n❌ Integrity check FAILED`);
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach((err) => {
        console.log(`  - ${err.type}: ${err.message}`);
        if (err.checkpointId) console.log(`    Checkpoint: ${err.checkpointId}`);
        if (err.blobHash) console.log(`    Blob: ${err.blobHash}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
      process.exit(1);
    }
  });

// Claude wrapper command - run Claude with transcript capture
program
  .command("claude")
  .description("Run Claude with conversation transcript capture")
  .option("-p, --project <id>", "Project ID (uses current dir by default)")
  .option("-c, --command <cmd>", "Claude command to run", "claude")
  .option("--debug-transcript", "Enable debug transcript logging")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    // Find or use specified project
    let projectId = options.project;
    if (!projectId) {
      const projects = repo.listProjects();
      const project = projects.find(p => p.rootPath === cwd);
      if (!project) {
        console.error("❌ Project not initialized. Run 'aitm init' first.");
        process.exit(1);
      }
      projectId = project.projectId;
    }

    console.log("Starting Claude with transcript capture...");
    console.log("Press Ctrl+C or type 'exit' to end the session.\n");

    try {
      await runClaudeSession({
        repo,
        cas,
        projectId,
        cwd,
        claudeCommand: options.command,
        debugTranscript: options.debugTranscript,
      });
      console.log("\n✓ Session ended. Transcript saved.");
    } catch (err) {
      console.error("Error running Claude session:", err);
      process.exit(1);
    }
  });

// Run command with event logging
program
  .command("run")
  .description("Run a command with output capture and auto-checkpoint")
  .argument("<command...>", "Command to run (use -- to separate)")
  .option("-p, --project <id>", "Project ID")
  .option("--no-auto-checkpoint", "Disable auto-checkpoint on success/failure")
  .action(async (commandParts, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    // Find or use specified project
    let projectId = options.project;
    if (!projectId) {
      const projects = repo.listProjects();
      const project = projects.find(p => p.rootPath === cwd);
      if (!project) {
        console.error("❌ Project not initialized. Run 'aitm init' first.");
        process.exit(1);
      }
      projectId = project.projectId;
    }

    const command = commandParts.join(" ");

    try {
      const result = await runCommand({
        repo,
        cas,
        projectId,
        command,
        cwd,
        enableAutoCheckpoint: options.autoCheckpoint !== false,
        createCheckpoint: async (name, scope) => {
          const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
          const { manifest, fileCount } = await buildManifest(cwd, cas, { ignore: ignoreMatcher });
          const manifestText = JSON.stringify(manifest, null, 2);
          const manifestBlob = cas.putBytes("application/json", Buffer.from(manifestText, "utf8"));
          const rootTreeHash = persistCheckpointTrees(repo, projectId, manifest.files);

          repo.insertCheckpoint({
            checkpointId: `cp_${crypto.randomBytes(8).toString("hex")}`,
            projectId,
            name,
            scope,
            manifestBlobHash: manifestBlob.hash,
            rootTreeHash,
          });

          console.log(`\n✓ Auto-checkpoint created: ${name}`);
        },
      });

      process.exit(result.exitCode);
    } catch (err) {
      console.error("Error running command:", err);
      process.exit(1);
    }
  });

// Rewind to checkpoint
program
  .command("rewind")
  .description("Restore workspace to a checkpoint and generate context")
  .option("-t, --to <checkpointId>", "Checkpoint ID to restore to")
  .option("--last-green", "Restore to last green (tests/build passed) checkpoint")
  .option("-m, --mode <mode>", "Restore mode (safe|hard)", "hard")
  .option("--no-backup", "Skip backup of current state")
  .option("--no-context", "Skip generating context file")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    let checkpointId = options.to;

    // Find last green checkpoint if requested
    if (options.lastGreen) {
      const { findLastGreenCheckpoint } = await import("./tools/rewind.js");
      const greenCheckpoint = findLastGreenCheckpoint(repo, project.projectId);
      if (!greenCheckpoint) {
        console.error("❌ No 'green' checkpoint found (Tests green, Build green, etc.)");
        process.exit(1);
      }
      checkpointId = greenCheckpoint.checkpointId;
      console.log(`Found last green checkpoint: ${greenCheckpoint.name}`);
    }

    if (!checkpointId) {
      console.error("❌ Must specify --to <checkpointId> or --last-green");
      process.exit(1);
    }

    const checkpoint = repo.getCheckpoint(project.projectId, checkpointId);
    if (!checkpoint) {
      console.error(`❌ Checkpoint not found: ${checkpointId}`);
      process.exit(1);
    }

    console.log(`\nRewinding to checkpoint:`);
    console.log(`  ${checkpoint.name}`);
    console.log(`  Created: ${checkpoint.createdAt}`);
    console.log(`  Mode: ${options.mode}`);
    console.log(`  Backup: ${options.backup ? 'yes' : 'no'}`);

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();

    try {
      const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));

      const result = restoreWorkspaceAtomic({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: options.mode as "safe" | "hard",
        backupCurrent: options.backup,
      });

      console.log(`\n✓ Restored ${result.filesWritten} files`);
      if (result.backupPath) {
        console.log(`  Backup saved to: ${result.backupPath}`);
      }

      // Generate context file
      if (options.context !== false) {
        const contextPath = path.join(cwd, ".aitm", "context.md");
        fs.mkdirSync(path.dirname(contextPath), { recursive: true });

        const contextContent = await buildContextPacket({
          repo,
          cas,
          projectId: project.projectId,
          checkpointId: checkpoint.checkpointId,
        });

        fs.writeFileSync(contextPath, contextContent, "utf8");
        console.log(`  Context saved to: ${contextPath}`);
      }

      console.log(`\nNext step: Run 'aitm resume' to start Claude with restored context.`);
    } finally {
      lock.release();
    }
  });

// Resume Claude with context
program
  .command("resume")
  .description("Start Claude with restored context from rewind")
  .option("-p, --project <id>", "Project ID")
  .option("-c, --command <cmd>", "Claude command to run", "claude")
  .option("--context-file <path>", "Path to context file", ".aitm/context.md")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    // Find or use specified project
    let projectId = options.project;
    if (!projectId) {
      const projects = repo.listProjects();
      const project = projects.find(p => p.rootPath === cwd);
      if (!project) {
        console.error("❌ Project not initialized. Run 'aitm init' first.");
        process.exit(1);
      }
      projectId = project.projectId;
    }

    // Read context file
    const contextPath = path.resolve(cwd, options.contextFile);
    let injectedContext: string | undefined;

    if (fs.existsSync(contextPath)) {
      injectedContext = fs.readFileSync(contextPath, "utf8");
      console.log("Loaded restored context from:", contextPath);
    } else {
      console.log("No context file found. Starting fresh session.");
    }

    console.log("Starting Claude with transcript capture...\n");

    try {
      await runClaudeSession({
        repo,
        cas,
        projectId,
        cwd,
        claudeCommand: options.command,
        injectedContext,
      });
      console.log("\n✓ Session ended. Transcript saved.");
    } catch (err) {
      console.error("Error running Claude session:", err);
      process.exit(1);
    }
  });

// ============================================
// CLOUD COMMANDS
// ============================================

// Login to cloud
program
  .command("login")
  .description("Login to Gitgram TimeMachine cloud with your API key")
  .argument("[api-key]", "Your API key (starts with aitm_)")
  .action(async (apiKey) => {
    const { createCloudSyncClient } = await import("./cloud/sync-client.js");

    if (!apiKey) {
      console.log("Get your API key at: https://timemachine.gitgram.app/dashboard\n");
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      apiKey = await new Promise<string>((resolve) => {
        rl.question("Enter your API key: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }

    if (!apiKey?.startsWith("aitm_")) {
      console.error("❌ Invalid API key format. Keys start with aitm_");
      process.exit(1);
    }

    const apiUrl = process.env.AITM_API_URL || "https://timemachine-api.gitgram.app";

    // Verify the key works
    try {
      const response = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { "X-API-Key": apiKey },
      });

      if (!response.ok) {
        console.error("❌ Invalid API key. Please check and try again.");
        process.exit(1);
      }

      const user = (await response.json()) as { email: string; userId: string };

      // Save credentials
      const credPath = path.join(DATA_DIR, "credentials.json");
      fs.mkdirSync(path.dirname(credPath), { recursive: true });
      fs.writeFileSync(
        credPath,
        JSON.stringify({ apiKey, apiUrl, email: user.email, userId: user.userId }, null, 2),
        { mode: 0o600 }
      );

      console.log(`✓ Logged in as ${user.email}`);
      console.log("  Cloud sync is now enabled!");
      console.log("\nYour checkpoints will automatically sync to the cloud.");
    } catch (err: unknown) {
      console.error(`❌ Connection failed: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

// Logout from cloud
program
  .command("logout")
  .description("Logout from Gitgram TimeMachine cloud")
  .action(async () => {
    const credPath = path.join(DATA_DIR, "credentials.json");
    if (fs.existsSync(credPath)) {
      fs.unlinkSync(credPath);
      console.log("✓ Logged out successfully");
    } else {
      console.log("Not currently logged in");
    }
  });

// Sync to cloud
program
  .command("sync")
  .description("Sync local data to cloud")
  .option("-p, --project <id>", "Project ID to sync")
  .option("--all", "Sync all projects")
  .action(async (options) => {
    const { createCloudSyncClient } = await import("./cloud/sync-client.js");
    const { syncCheckpointToCloud } = await import("./cloud/checkpoint-sync.js");

    const client = createCloudSyncClient();
    if (!client) {
      console.error("❌ Not logged in. Run 'aitm login' first.");
      process.exit(1);
    }

    const repo = getRepo();
    const cas = getCas();
    const cwd = process.cwd();

    // Get projects to sync
    let projects;
    if (options.all) {
      projects = repo.listProjects();
    } else if (options.project) {
      const project = repo.getProject(options.project);
      if (!project) {
        console.error("❌ Project not found");
        process.exit(1);
      }
      projects = [project];
    } else {
      // Use current directory's project
      const allProjects = repo.listProjects();
      const project = allProjects.find((p) => p.rootPath === cwd);
      if (!project) {
        console.error("❌ No project found in current directory. Use --project or --all");
        process.exit(1);
      }
      projects = [project];
    }

    console.log(`Syncing ${projects.length} project(s) to cloud...\n`);

    for (const project of projects) {
      console.log(`📁 ${project.name} (${project.projectId})`);

      // Sync project
      try {
        await client.syncProject({
          id: project.projectId,
          name: project.name,
          rootPath: project.rootPath,
        });
        console.log("  ✓ Project synced");
      } catch (err: unknown) {
        console.error(`  ❌ Failed to sync project: ${errorMessage(err)}`);
        continue;
      }

      // Sync checkpoints
      const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 100);
      console.log(`  Syncing ${checkpoints.length} checkpoints...`);

      let synced = 0;
      for (const cp of checkpoints) {
        try {
          const manifestContent = cas.getBytes(cp.manifestBlobHash);
          const manifest = JSON.parse(manifestContent.toString("utf8"));

          const result = await syncCheckpointToCloud({
            projectId: project.projectId,
            projectName: project.name,
            projectRootPath: project.rootPath,
            checkpointId: cp.checkpointId,
            checkpointName: cp.name,
            scope: cp.scope,
            manifestHash: cp.manifestBlobHash,
            manifestContent,
            manifestFiles: manifest.files || [],
            cas,
            createdAt: new Date(cp.createdAt),
          });

          if (result.synced) synced++;
        } catch (err: unknown) {
          // Skip errors, continue syncing
        }
      }

      console.log(`  ✓ ${synced}/${checkpoints.length} checkpoints synced`);
    }

    console.log("\n✓ Sync complete!");
  });

// Cloud status and list
program
  .command("cloud")
  .description("View cloud sync status and data")
  .option("-l, --list", "List cloud projects")
  .option("-c, --checkpoints <projectId>", "List checkpoints for a project")
  .option("-m, --messages <projectId>", "Show recent messages for a project")
  .action(async (options) => {
    const { createCloudSyncClient } = await import("./cloud/sync-client.js");

    const client = createCloudSyncClient();
    if (!client) {
      console.error("❌ Not logged in. Run 'aitm login' first.");
      process.exit(1);
    }

    // Check connection
    const connected = await client.healthCheck();
    if (!connected) {
      console.error("❌ Cannot connect to cloud. Check your internet connection.");
      process.exit(1);
    }

    if (options.checkpoints) {
      const { checkpoints } = await client.getCheckpoints(options.checkpoints, { limit: 20 });
      console.log(`\n📍 Checkpoints for ${options.checkpoints}:\n`);
      for (const cp of checkpoints) {
        const time = new Date(cp.createdAt).toLocaleString();
        console.log(`  ${cp.id}: ${cp.name}`);
        console.log(`    Created: ${time}`);
        console.log(`    Scope: ${cp.scope || "files"}`);
        console.log("");
      }
      return;
    }

    if (options.messages) {
      const { messages } = await client.getProjectMessages(options.messages, { limit: 20 });
      console.log(`\n💬 Recent messages for ${options.messages}:\n`);
      for (const m of messages) {
        const role = m.role === "user" ? "👤" : m.role === "assistant" ? "🤖" : "⚙️";
        const time = new Date(m.timestamp).toLocaleString();
        const content = m.content.substring(0, 100) + (m.content.length > 100 ? "..." : "");
        console.log(`  ${role} [${time}]`);
        console.log(`    ${content}`);
        console.log("");
      }
      return;
    }

    // Default: show status and list projects
    console.log("☁️  Gitgram TimeMachine Cloud Status\n");
    console.log("  Status: ✓ Connected");

    // Load credentials to show email
    const credPath = path.join(DATA_DIR, "credentials.json");
    if (fs.existsSync(credPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));
        console.log(`  User: ${creds.email}`);
      } catch {}
    }

    const { projects } = await client.getProjects();
    console.log(`\n📁 Your Projects (${projects.length}):\n`);

    for (const p of projects) {
      const updated = p.updatedAt ? new Date(p.updatedAt).toLocaleString() : "Never";
      console.log(`  ${p.name} (${p.id})`);
      console.log(`    Path: ${p.rootPath || "N/A"}`);
      console.log(`    Updated: ${updated}`);
      console.log("");
    }

    console.log("Use 'aitm cloud --checkpoints <projectId>' to view checkpoints");
    console.log("Use 'aitm cloud --messages <projectId>' to view messages");
  });

// Pull from cloud
program
  .command("pull")
  .description("Pull and restore data from cloud")
  .argument("<checkpoint-id>", "Checkpoint ID to restore")
  .option("-p, --project <id>", "Project ID")
  .option("--hard", "Hard restore (overwrite without backup)")
  .action(async (checkpointId, options) => {
    const { createCloudSyncClient } = await import("./cloud/sync-client.js");

    const client = createCloudSyncClient();
    if (!client) {
      console.error("❌ Not logged in. Run 'aitm login' first.");
      process.exit(1);
    }

    const repo = getRepo();
    const cas = getCas();
    const cwd = process.cwd();

    // Find project
    let projectId = options.project;
    if (!projectId) {
      const projects = repo.listProjects();
      const project = projects.find((p) => p.rootPath === cwd);
      if (!project) {
        console.error("❌ No project found. Use --project to specify.");
        process.exit(1);
      }
      projectId = project.projectId;
    }

    console.log(`Pulling checkpoint ${checkpointId} from cloud...\n`);

    try {
      // Get full checkpoint data
      const data = await client.getCheckpointFull(projectId, checkpointId, {
        includeMessages: true,
        messageLimit: 20,
      });

      if (!data.checkpoint) {
        console.error("❌ Checkpoint not found in cloud");
        process.exit(1);
      }

      console.log(`📍 ${data.checkpoint.name}`);
      console.log(`   Created: ${data.checkpoint.createdAt}`);

      // Parse manifest
      if (!data.manifest) {
        console.error("❌ Checkpoint has no manifest");
        process.exit(1);
      }

      const manifest = parseManifestJson(
        Buffer.from(data.manifest, "base64").toString("utf8")
      );

      console.log(`   Files: ${manifest.files?.length || 0}`);

      // Download blobs
      console.log("\nDownloading files...");
      const hashes = manifest.files?.map((f) => f.hash) || [];
      const { blobs } = await client.getBlobsBatch(hashes);

      // Store in local CAS
      for (const blob of blobs) {
        const content = Buffer.from(blob.content, "base64");
        cas.putBytes(blob.mimeType || "application/octet-stream", content);
      }

      console.log(`  ✓ Downloaded ${blobs.length} files`);

      // Restore
      const project = repo.getProject(projectId);
      if (!project) {
        console.error("❌ Project not found locally");
        process.exit(1);
      }

      const lock = new ProjectLock(project.rootPath);
      lock.acquire();
      try {
        const result = restoreWorkspaceAtomic({
          projectRoot: project.rootPath,
          cas,
          manifest,
          mode: options.hard ? "hard" : "safe",
          backupCurrent: !options.hard,
        });

        console.log(`\n✓ Restored ${result.filesWritten} files`);
        if (result.backupPath) {
          console.log(`  Backup saved to: ${result.backupPath}`);
        }

        // Save context if messages available
        if (data.messages?.length > 0) {
          const contextPath = path.join(project.rootPath, ".aitm", "context.md");
          fs.mkdirSync(path.dirname(contextPath), { recursive: true });

          let context = `# Restored Context\n\n`;
          context += `**Checkpoint:** ${data.checkpoint.name}\n`;
          context += `**Time:** ${data.checkpoint.createdAt}\n\n`;
          context += `## Recent Conversation\n\n`;

          for (const m of data.messages) {
            const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System";
            context += `**${role}:** ${m.content.substring(0, 500)}${m.content.length > 500 ? "..." : ""}\n\n`;
          }

          fs.writeFileSync(contextPath, context, "utf8");
          console.log(`  Context saved to: ${contextPath}`);
        }

        console.log("\nRun 'aitm resume' to continue with restored context.");
      } finally {
        lock.release();
      }
    } catch (err: unknown) {
      console.error(`❌ Pull failed: ${errorMessage(err)}`);
      process.exit(1);
    }
  });

// ============================================
// NATURAL LANGUAGE TIME TRAVEL COMMANDS
// ============================================

// When - Find when something happened
program
  .command("when")
  .description("Find when something happened (natural language)")
  .argument("<query...>", "Natural language query (e.g., 'tests started failing')")
  .option("-l, --limit <n>", "Maximum results", "5")
  .action(async (queryParts, options) => {
    const { parseTimeQuery, findCheckpointsForQuery } = await import("./cli/natural-language.js");

    const cwd = process.cwd();
    const repo = getRepo();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized. Run 'aitm init' first.");
      process.exit(1);
    }

    const query = queryParts.join(" ");
    const parsedQuery = parseTimeQuery(query);
    const results = findCheckpointsForQuery(repo, project.projectId, parsedQuery, parseInt(options.limit));

    if (results.length === 0) {
      console.log(`\n🔍 No checkpoints found matching: "${query}"`);
      console.log("\nTry a different query or check 'aitm list' to see all checkpoints.");
      return;
    }

    console.log(`\n🕐 Found ${results.length} checkpoint(s) matching: "${query}"\n`);

    results.forEach((cp, i) => {
      const time = new Date(cp.createdAt).toLocaleString();
      console.log(`${i + 1}. ${cp.name}`);
      console.log(`   📍 ${cp.checkpointId}`);
      console.log(`   🕐 ${time}`);
      console.log("");
    });

    console.log("Use 'aitm back-to <checkpoint-id>' to restore to any of these states.");
  });

// What-changed - Show what changed between checkpoints
program
  .command("what-changed")
  .description("Show what changed between checkpoints")
  .option("-f, --from <checkpoint>", "From checkpoint ID or 'last-green'")
  .option("-t, --to <checkpoint>", "To checkpoint ID (default: current)")
  .option("--since <time>", "Changes since (e.g., '1 hour ago', 'yesterday')")
  .action(async (options) => {
    const { parseTimeQuery, findCheckpointsForQuery, analyzeChanges, explainChanges } = await import("./cli/natural-language.js");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    let fromCheckpoint;
    let toCheckpoint;

    // Resolve "from" checkpoint
    if (options.from === "last-green") {
      const { findLastGreenCheckpoint } = await import("./cli/natural-language.js");
      const green = findLastGreenCheckpoint(repo, project.projectId);
      if (!green) {
        console.error("❌ No 'green' checkpoint found.");
        process.exit(1);
      }
      fromCheckpoint = repo.getCheckpoint(project.projectId, green.checkpointId);
    } else if (options.from) {
      fromCheckpoint = repo.getCheckpoint(project.projectId, options.from);
    } else if (options.since) {
      const parsedQuery = parseTimeQuery(options.since);
      const results = findCheckpointsForQuery(repo, project.projectId, parsedQuery, 1);
      if (results.length === 0) {
        console.error(`❌ No checkpoints found for: "${options.since}"`);
        process.exit(1);
      }
      fromCheckpoint = repo.getCheckpoint(project.projectId, results[0].checkpointId);
    } else {
      // Default: compare last two checkpoints
      const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 2);
      if (checkpoints.length < 2) {
        console.error("❌ Need at least 2 checkpoints to compare. Use --from to specify.");
        process.exit(1);
      }
      toCheckpoint = checkpoints[0];
      fromCheckpoint = checkpoints[1];
    }

    if (!fromCheckpoint) {
      console.error("❌ From checkpoint not found.");
      process.exit(1);
    }

    // Resolve "to" checkpoint
    if (!toCheckpoint) {
      if (options.to) {
        toCheckpoint = repo.getCheckpoint(project.projectId, options.to);
      } else {
        // Use most recent checkpoint
        const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 1);
        if (checkpoints.length === 0) {
          console.error("❌ No checkpoints found.");
          process.exit(1);
        }
        toCheckpoint = checkpoints[0];
      }
    }

    if (!toCheckpoint) {
      console.error("❌ To checkpoint not found.");
      process.exit(1);
    }

    console.log(`\n📊 Comparing checkpoints:\n`);
    console.log(`  From: ${fromCheckpoint.name}`);
    console.log(`        ${new Date(fromCheckpoint.createdAt).toLocaleString()}`);
    console.log(`  To:   ${toCheckpoint.name}`);
    console.log(`        ${new Date(toCheckpoint.createdAt).toLocaleString()}`);
    console.log("");

    // Load manifests
    const fromManifestBlob = cas.getBytes(fromCheckpoint.manifestBlobHash);
    const toManifestBlob = cas.getBytes(toCheckpoint.manifestBlobHash);

    const fromManifest = JSON.parse(fromManifestBlob.toString("utf8"));
    const toManifest = JSON.parse(toManifestBlob.toString("utf8"));

    const analysis = analyzeChanges(fromManifest, toManifest);
    console.log(explainChanges(analysis));
  });

// Diff - Show detailed diff between checkpoints
program
  .command("diff")
  .description("Show detailed file diff between checkpoints")
  .argument("[from]", "From checkpoint ID")
  .argument("[to]", "To checkpoint ID (default: current state)")
  .option("--file <path>", "Show diff for specific file only")
  .option("--json", "Output as JSON")
  .action(async (from, to, options) => {
    const { analyzeChanges } = await import("./cli/natural-language.js");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }
    const startedAt = Date.now();

    try {
      // Get checkpoints
      let fromCheckpoint;
      let toCheckpoint = null;

      if (!from) {
        // Compare last two checkpoints
        const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 2);
        if (checkpoints.length < 2) {
          console.error("❌ Need at least 2 checkpoints to compare.");
          process.exit(1);
        }
        toCheckpoint = checkpoints[0];
        fromCheckpoint = checkpoints[1];
      } else {
        fromCheckpoint = repo.getCheckpoint(project.projectId, from);
        if (to) {
          toCheckpoint = repo.getCheckpoint(project.projectId, to);
        } else {
          const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 1);
          if (checkpoints.length > 0) {
            toCheckpoint = checkpoints[0];
          }
        }
      }

      if (!fromCheckpoint) {
        console.error("❌ From checkpoint not found.");
        process.exit(1);
      }

      console.log(`\n📊 Diff: ${fromCheckpoint.checkpointId.slice(0, 16)}... → ${toCheckpoint ? toCheckpoint.checkpointId.slice(0, 16) + "..." : "current"}\n`);

      const fromManifestBlob = cas.getBytes(fromCheckpoint.manifestBlobHash);
      const fromManifest = JSON.parse(fromManifestBlob.toString("utf8"));

      let toManifest;
      if (toCheckpoint) {
        const toManifestBlob = cas.getBytes(toCheckpoint.manifestBlobHash);
        toManifest = JSON.parse(toManifestBlob.toString("utf8"));
      } else {
        // Build current manifest
        const ignoreMatcher = makeIgnoreMatcher(DEFAULT_IGNORES);
        const { manifest } = await buildManifest(cwd, cas, { ignore: ignoreMatcher });
        toManifest = manifest;
      }

      const analysis = analyzeChanges(fromManifest, toManifest);

      // JSON output
      if (options.json) {
        const output: {
          from: string;
          to: string;
          added: string[];
          removed: string[];
          modified: string[];
          summary: string;
          file?: { path: string; status: "added" | "removed" | "modified" | "unchanged" };
        } = {
          from: fromCheckpoint.checkpointId,
          to: toCheckpoint ? toCheckpoint.checkpointId : "current",
          added: analysis.filesAdded,
          removed: analysis.filesRemoved,
          modified: analysis.filesModified,
          summary: analysis.summary,
        };

        if (options.file) {
          const filePath = options.file;
          output.file = {
            path: filePath,
            status: analysis.filesAdded.includes(filePath) ? "added" :
                    analysis.filesRemoved.includes(filePath) ? "removed" :
                    analysis.filesModified.includes(filePath) ? "modified" : "unchanged",
          };
        }

        console.log(JSON.stringify(output, null, 2));
        recordBenchmarkEvent(project.rootPath, {
          timestamp: new Date().toISOString(),
          operation: "diff",
          success: true,
          durationMs: Date.now() - startedAt,
          metadata: { mode: "json", file: options.file || null },
        });
        return;
      }

      // Filter by file if specified
      if (options.file) {
        const filePath = options.file;
        const isAdded = analysis.filesAdded.includes(filePath);
        const isRemoved = analysis.filesRemoved.includes(filePath);
        const isModified = analysis.filesModified.includes(filePath);

        if (!isAdded && !isRemoved && !isModified) {
          console.log(`File "${filePath}" has no changes between these checkpoints.`);
          recordBenchmarkEvent(project.rootPath, {
            timestamp: new Date().toISOString(),
            operation: "diff",
            success: true,
            durationMs: Date.now() - startedAt,
            metadata: { mode: "single-file", file: filePath, changed: false },
          });
          return;
        }

        if (isAdded) {
          console.log(`+ ${filePath} (added)`);
        } else if (isRemoved) {
          console.log(`- ${filePath} (removed)`);
        } else {
          console.log(`~ ${filePath} (modified)`);
        }
        recordBenchmarkEvent(project.rootPath, {
          timestamp: new Date().toISOString(),
          operation: "diff",
          success: true,
          durationMs: Date.now() - startedAt,
          metadata: { mode: "single-file", file: filePath, changed: true },
        });
        return;
      }

      // Show full diff
      console.log(`Added (${analysis.filesAdded.length}):`);
      analysis.filesAdded.forEach(f => console.log(`  + ${f}`));

      console.log(`\nRemoved (${analysis.filesRemoved.length}):`);
      analysis.filesRemoved.forEach(f => console.log(`  - ${f}`));

      console.log(`\nModified (${analysis.filesModified.length}):`);
      analysis.filesModified.forEach(f => console.log(`  ~ ${f}`));

      recordBenchmarkEvent(project.rootPath, {
        timestamp: new Date().toISOString(),
        operation: "diff",
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: "full",
          changedCount: analysis.filesAdded.length + analysis.filesRemoved.length + analysis.filesModified.length,
        },
      });
    } catch (err) {
      recordBenchmarkEvent(project.rootPath, {
        timestamp: new Date().toISOString(),
        operation: "diff",
        success: false,
        durationMs: Date.now() - startedAt,
        metadata: {
          error: err instanceof Error ? err.message : String(err),
          file: options.file || null,
        },
      });
      throw err;
    }
  });

program
  .command("benchmark-dashboard")
  .description("Show restore/diff benchmark dashboard (success rate, latency p95/p99)")
  .option("--hours <n>", "Window size in hours", "24")
  .option("--limit <n>", "Max metric events to read", "5000")
  .option("--json", "Output as JSON")
  .action((options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const projects = repo.listProjects();
    const project = projects.find((p) => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const hours = Math.max(1, parseInt(options.hours, 10) || 24);
    const limit = Math.max(1, parseInt(options.limit, 10) || 5000);
    const dashboard = getBenchmarkDashboard(project.rootPath, { windowHours: hours, limit });

    if (options.json) {
      console.log(JSON.stringify(dashboard, null, 2));
      return;
    }

    console.log(`\nBenchmark Dashboard (${hours}h window)`);
    console.log(`Total events: ${dashboard.totalEvents}`);

    const printOp = (op: "restore" | "diff") => {
      const s = dashboard.operations[op];
      console.log(`\n${op.toUpperCase()}:`);
      console.log(`  Success rate: ${(s.successRate * 100).toFixed(1)}% (${s.successes}/${s.total})`);
      console.log(`  Latency p50/p95/p99: ${s.latencyMs.p50Ms.toFixed(1)} / ${s.latencyMs.p95Ms.toFixed(1)} / ${s.latencyMs.p99Ms.toFixed(1)} ms`);
      console.log(`  Min/Avg/Max: ${s.latencyMs.minMs.toFixed(1)} / ${s.latencyMs.avgMs.toFixed(1)} / ${s.latencyMs.maxMs.toFixed(1)} ms`);
    };

    printOp("restore");
    printOp("diff");
    console.log("");
  });

program
  .command("search-relevance-benchmark")
  .description("Run semantic search relevance benchmark with threshold evaluation")
  .option("--json", "Output as JSON")
  .option("--enforce", "Exit non-zero if thresholds are not met")
  .action((options) => {
    const report = runSearchRelevanceBenchmark();

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("\nSearch Relevance Benchmark");
      console.log(`Cases: ${report.metrics.totalCases}`);
      console.log(`Top1 accuracy: ${(report.metrics.top1Accuracy * 100).toFixed(1)}%`);
      console.log(`MRR: ${report.metrics.mrr.toFixed(3)}`);
      console.log(`Recall@3: ${(report.metrics.recallAt3 * 100).toFixed(1)}%`);
      console.log(
        `Thresholds -> top1>=${report.thresholds.minTop1Accuracy}, mrr>=${report.thresholds.minMrr}, recall@3>=${report.thresholds.minRecallAt3}`
      );
      console.log(`Result: ${report.passed ? "PASS" : "FAIL"}`);
      if (!report.passed) {
        console.log("\nWorst cases:");
        report.cases
          .filter((c) => !c.hitAt3)
          .slice(0, 10)
          .forEach((c) => {
            console.log(
              `- ${c.id}: top=${c.topResultCheckpointId || "none"}, expected=${c.expectedCheckpointIds.join(", ")}`
            );
          });
      }
      console.log("");
    }

    if (options.enforce && !report.passed) {
      process.exit(2);
    }
  });

// Back-to - Natural language restore
program
  .command("back-to")
  .description("Restore to a state using natural language")
  .argument("<query...>", "Natural language query (e.g., 'when tests passed', 'yesterday', 'cp_abc123')")
  .option("-m, --mode <mode>", "Restore mode (safe|hard)", "safe")
  .option("--no-backup", "Skip backup of current state")
  .option("--no-context", "Skip generating context file")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (queryParts, options) => {
    const { parseBackToQuery, findLastGreenCheckpoint, parseTimeQuery, findCheckpointsForQuery } = await import("./cli/natural-language.js");
    const readline = await import("readline");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const query = queryParts.join(" ");
    const parsed = parseBackToQuery(query);

    let targetCheckpoint;

    switch (parsed.type) {
      case "last-green":
        const green = findLastGreenCheckpoint(repo, project.projectId);
        if (!green) {
          console.error("❌ No 'green' checkpoint found (Tests green, Build green, etc.)");
          console.log("\nTip: Create checkpoints with names like 'Tests green' or 'Build passed'");
          process.exit(1);
        }
        targetCheckpoint = repo.getCheckpoint(project.projectId, green.checkpointId);
        break;

      case "time-ago":
        const timeQuery = parseTimeQuery(`${parsed.timeAmount} ${parsed.timeUnit}s ago`);
        const timeResults = findCheckpointsForQuery(repo, project.projectId, timeQuery, 1);
        if (timeResults.length === 0) {
          console.error(`❌ No checkpoints found from ${parsed.timeAmount} ${parsed.timeUnit}(s) ago.`);
          process.exit(1);
        }
        targetCheckpoint = repo.getCheckpoint(project.projectId, timeResults[0].checkpointId);
        break;

      case "checkpoint-id":
        targetCheckpoint = repo.getCheckpoint(project.projectId, parsed.value!);
        if (!targetCheckpoint) {
          console.error(`❌ Checkpoint not found: ${parsed.value}`);
          process.exit(1);
        }
        break;

      case "keyword":
        const keywordQuery = parseTimeQuery(parsed.value || query);
        const keywordResults = findCheckpointsForQuery(repo, project.projectId, keywordQuery, 5);

        if (keywordResults.length === 0) {
          // Fallback to basic search
          const searchResults = repo.searchCheckpoints(project.projectId, parsed.value || query);
          if (searchResults.length === 0) {
            console.error(`❌ No checkpoints found matching: "${query}"`);
            console.log("\nTry 'aitm list' to see all checkpoints.");
            process.exit(1);
          }
          targetCheckpoint = searchResults[0];
        } else if (keywordResults.length === 1) {
          targetCheckpoint = repo.getCheckpoint(project.projectId, keywordResults[0].checkpointId);
        } else {
          // Multiple matches - show options
          console.log(`\n🔍 Found ${keywordResults.length} matching checkpoints:\n`);
          keywordResults.forEach((cp, i) => {
            console.log(`${i + 1}. ${cp.name}`);
            console.log(`   ${new Date(cp.createdAt).toLocaleString()}`);
          });
          console.log(`\nUsing most relevant: ${keywordResults[0].name}`);
          targetCheckpoint = repo.getCheckpoint(project.projectId, keywordResults[0].checkpointId);
        }
        break;
    }

    if (!targetCheckpoint) {
      console.error("❌ Could not find a matching checkpoint.");
      process.exit(1);
    }

    console.log(`\n⏪ Going back to:`);
    console.log(`   ${targetCheckpoint.name}`);
    console.log(`   ${new Date(targetCheckpoint.createdAt).toLocaleString()}`);
    console.log(`   Mode: ${options.mode}`);

    // Confirm unless -y flag
    if (!options.yes) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question("\nProceed? [y/N] ", (answer) => {
          rl.close();
          resolve(answer.toLowerCase());
        });
      });

      if (answer !== "y" && answer !== "yes") {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    // Perform restore
    const lock = new ProjectLock(project.rootPath);
    lock.acquire();

    try {
      const manifestBlob = cas.getBytes(targetCheckpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));

      const result = restoreWorkspaceAtomic({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: options.mode as "safe" | "hard",
        backupCurrent: options.backup,
      });

      console.log(`\n✓ Restored ${result.filesWritten} files`);
      if (result.backupPath) {
        console.log(`  Backup saved to: ${result.backupPath}`);
      }

      // Generate context file
      if (options.context !== false) {
        const contextPath = path.join(cwd, ".aitm", "context.md");
        fs.mkdirSync(path.dirname(contextPath), { recursive: true });

        const contextContent = await buildContextPacket({
          repo,
          cas,
          projectId: project.projectId,
          checkpointId: targetCheckpoint.checkpointId,
        });

        fs.writeFileSync(contextPath, contextContent, "utf8");
        console.log(`  Context saved to: ${contextPath}`);
      }

      console.log(`\nNext step: Run 'aitm resume' to start Claude with restored context.`);
    } finally {
      lock.release();
    }
  });

// Back - Shorter alias for back-to
program
  .command("back")
  .description("Go back in time (alias for 'back-to')")
  .argument("<query...>", "Natural language: 'when tests passed', '2 hours ago', 'before docker'")
  .option("-y, --yes", "Skip confirmation")
  .action(async (queryParts, options) => {
    // Re-use back-to logic
    const { parseBackToQuery, findLastGreenCheckpoint, parseTimeQuery, findCheckpointsForQuery } = await import("./cli/natural-language.js");
    const readline = await import("readline");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized. Run 'aitm init' first.");
      process.exit(1);
    }

    const query = queryParts.join(" ");
    const parsed = parseBackToQuery(query);

    let targetCheckpoint;

    switch (parsed.type) {
      case "last-green":
        const green = findLastGreenCheckpoint(repo, project.projectId);
        if (!green) {
          console.error("❌ No 'green' checkpoint found.");
          process.exit(1);
        }
        targetCheckpoint = repo.getCheckpoint(project.projectId, green.checkpointId);
        break;

      case "time-ago":
        const timeQuery = parseTimeQuery(`${parsed.timeAmount} ${parsed.timeUnit}s ago`);
        const timeResults = findCheckpointsForQuery(repo, project.projectId, timeQuery, 1);
        if (timeResults.length === 0) {
          console.error(`❌ No checkpoints found from ${parsed.timeAmount} ${parsed.timeUnit}(s) ago.`);
          process.exit(1);
        }
        targetCheckpoint = repo.getCheckpoint(project.projectId, timeResults[0].checkpointId);
        break;

      case "checkpoint-id":
        targetCheckpoint = repo.getCheckpoint(project.projectId, parsed.value!);
        if (!targetCheckpoint) {
          console.error(`❌ Checkpoint not found: ${parsed.value}`);
          process.exit(1);
        }
        break;

      case "keyword":
        const keywordResults = repo.searchCheckpoints(project.projectId, parsed.value || query);
        if (keywordResults.length === 0) {
          console.error(`❌ No checkpoints found matching: "${query}"`);
          process.exit(1);
        }
        targetCheckpoint = keywordResults[0];
        break;
    }

    if (!targetCheckpoint) {
      console.error("❌ Could not find a matching checkpoint.");
      process.exit(1);
    }

    console.log(`\n⏪ Going back to: ${targetCheckpoint.name}`);
    console.log(`   ${new Date(targetCheckpoint.createdAt).toLocaleString()}`);

    if (!options.yes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("\nProceed? [y/N] ", (a) => { rl.close(); resolve(a.toLowerCase()); });
      });
      if (answer !== "y" && answer !== "yes") {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();
    try {
      const manifestBlob = cas.getBytes(targetCheckpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));

      const result = restoreWorkspaceAtomic({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: "safe",
        backupCurrent: true,
      });

      console.log(`\n✓ Restored ${result.filesWritten} files`);
      if (result.backupPath) {
        console.log(`  Backup: ${result.backupPath}`);
      }
    } finally {
      lock.release();
    }
  });

// Fix - Auto-recovery: find last green state and restore
program
  .command("fix")
  .description("Auto-fix: restore to last known good state (tests passed/build green)")
  .option("-t, --test <command>", "Test command to verify (e.g., 'npm test')")
  .option("-y, --yes", "Skip confirmation")
  .option("--context", "Generate context file for AI continuation")
  .action(async (options) => {
    const { findLastGreenCheckpoint } = await import("./cli/natural-language.js");
    const readline = await import("readline");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized. Run 'aitm init' first.");
      process.exit(1);
    }

    console.log(`\n🔧 Auto-fix: Finding last known good state...\n`);

    // Find last green checkpoint
    const green = findLastGreenCheckpoint(repo, project.projectId);

    if (!green) {
      console.error("❌ No 'green' checkpoint found.");
      console.log("\nTip: Create checkpoints with descriptive names like:");
      console.log("  aitm checkpoint 'Tests green'");
      console.log("  aitm checkpoint 'Build passed'");
      process.exit(1);
    }

    const targetCheckpoint = repo.getCheckpoint(project.projectId, green.checkpointId);
    if (!targetCheckpoint) {
      console.error("❌ Could not load checkpoint.");
      process.exit(1);
    }

    // Show what we found
    console.log(`✅ Found last good state:`);
    console.log(`   ${targetCheckpoint.name}`);
    console.log(`   ${new Date(targetCheckpoint.createdAt).toLocaleString()}`);

    // Get current checkpoint for comparison
    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 1);
    if (checkpoints.length > 0 && checkpoints[0].checkpointId !== targetCheckpoint.checkpointId) {
      const current = checkpoints[0];
      console.log(`\n📊 Current state:`);
      console.log(`   ${current.name}`);
      console.log(`   ${new Date(current.createdAt).toLocaleString()}`);
    }

    if (!options.yes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("\nRestore to this state? [y/N] ", (a) => { rl.close(); resolve(a.toLowerCase()); });
      });
      if (answer !== "y" && answer !== "yes") {
        console.log("Aborted.");
        process.exit(0);
      }
    }

    // Perform restore
    const lock = new ProjectLock(project.rootPath);
    lock.acquire();
    try {
      const manifestBlob = cas.getBytes(targetCheckpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));

      const result = restoreWorkspaceAtomic({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: "safe",
        backupCurrent: true,
      });

      console.log(`\n✓ Restored ${result.filesWritten} files`);
      if (result.backupPath) {
        console.log(`  Backup saved to: ${result.backupPath}`);
      }

      // Verify with test command if provided
      if (options.test) {
        console.log(`\n🧪 Verifying with: ${options.test}`);
        const { execSync } = await import("child_process");
        try {
          execSync(options.test, { cwd: project.rootPath, stdio: "inherit" });
          console.log(`\n✅ Verification passed!`);
        } catch {
          console.log(`\n⚠️  Verification failed. You may need to go back further.`);
          console.log(`   Try: aitm bisect --test "${options.test}"`);
        }
      }

      // Generate context if requested
      if (options.context) {
        const contextPath = path.join(cwd, ".aitm", "context.md");
        fs.mkdirSync(path.dirname(contextPath), { recursive: true });

        const contextContent = await buildContextPacket({
          repo,
          cas,
          projectId: project.projectId,
          checkpointId: targetCheckpoint.checkpointId,
        });

        fs.writeFileSync(contextPath, contextContent, "utf8");
        console.log(`  Context saved to: ${contextPath}`);
      }

      console.log(`\n🎉 Fixed! You're now at a known good state.`);
      console.log(`   Run 'aitm resume' to continue with AI assistance.`);
    } finally {
      lock.release();
    }
  });

// Undo - Undo last change/restore
program
  .command("undo")
  .description("Undo last restore (go back to backup)")
  .option("-l, --list", "List available undo points")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    // Check for backup directory (backups are stored in .tm_internal/backups)
    const backupDir = path.join(cwd, ".tm_internal", "backups");

    if (!fs.existsSync(backupDir)) {
      console.error("❌ No undo history found. Backups are created during restore operations.");
      process.exit(1);
    }

    const backups = fs.readdirSync(backupDir)
      .filter(f => !f.startsWith(".") && fs.statSync(path.join(backupDir, f)).isDirectory())
      .sort()
      .reverse();

    if (backups.length === 0) {
      console.error("❌ No backups found to undo.");
      process.exit(1);
    }

    if (options.list) {
      console.log(`\n📦 Available undo points:\n`);
      backups.forEach((backup, i) => {
        const stats = fs.statSync(path.join(backupDir, backup));
        console.log(`${i + 1}. ${backup}`);
        console.log(`   Created: ${stats.mtime.toLocaleString()}`);
      });
      return;
    }

    // Use most recent backup
    const latestBackup = backups[0];
    const backupPath = path.join(backupDir, latestBackup);

    console.log(`\n⏪ Undoing to: ${latestBackup}`);

    const lock = new ProjectLock(project.rootPath);
    lock.acquire();

    try {
      // Copy files from backup to project root
      const copyRecursive = (src: string, dest: string): number => {
        let count = 0;
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            count += copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            count++;
          }
        }
        return count;
      };

      const filesRestored = copyRecursive(backupPath, project.rootPath);
      console.log(`✓ Restored ${filesRestored} files from backup`);

      // Remove used backup
      fs.rmSync(backupPath, { recursive: true });
      console.log(`  Backup removed: ${latestBackup}`);
    } finally {
      lock.release();
    }
  });

// Blame - Show which checkpoint introduced a line
program
  .command("blame")
  .description("Show which checkpoint introduced a specific line")
  .argument("<file>", "File path")
  .option("-l, --line <n>", "Line number")
  .option("--json", "Output as JSON")
  .action(async (file, options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    const lineNum = options.line ? parseInt(options.line) : null;
    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 100);

    // Track when each line was last changed
    const lineBlame: Map<number, { checkpointId: string; description: string; timestamp: string }> = new Map();
    let prevContent: string[] | null = null;

    for (const cp of checkpoints) {
      try {
        const manifestBlob = cas.getBytes(cp.manifestBlobHash);
        const manifest = parseManifestJson(manifestBlob.toString("utf8"));
        const fileEntry = (manifest.files || []).find((f) => f.path === file);

        if (fileEntry) {
          const content = cas.getBytes(fileEntry.hash).toString("utf8");
          const lines = content.split("\n");

          if (prevContent === null) {
            // First checkpoint - all lines attributed to this
            for (let i = 0; i < lines.length; i++) {
              lineBlame.set(i + 1, {
                checkpointId: cp.checkpointId,
                description: cp.name,
                timestamp: cp.createdAt,
              });
            }
          } else {
            // Find lines that changed
            for (let i = 0; i < lines.length; i++) {
              if (i >= prevContent.length || lines[i] !== prevContent[i]) {
                lineBlame.set(i + 1, {
                  checkpointId: cp.checkpointId,
                  description: cp.name,
                  timestamp: cp.createdAt,
                });
              }
            }
          }
          prevContent = lines;
        }
      } catch {}
    }

    if (options.json) {
      if (lineNum) {
        const blame = lineBlame.get(lineNum);
        console.log(JSON.stringify(blame || { error: "Line not found" }));
      } else {
        const output: Record<string, { checkpointId: string; description: string; timestamp: string }> = {};
        for (const [line, blame] of lineBlame) {
          output[String(line)] = blame;
        }
        console.log(JSON.stringify(output, null, 2));
      }
      return;
    }

    if (lineNum) {
      const blame = lineBlame.get(lineNum);
      if (blame) {
        console.log(`\nLine ${lineNum} in ${file}:`);
        console.log(`  Checkpoint: ${blame.checkpointId}`);
        console.log(`  Description: ${blame.description}`);
        console.log(`  Time: ${new Date(blame.timestamp).toLocaleString()}`);
      } else {
        console.log(`Line ${lineNum} not found or has no history.`);
      }
    } else {
      console.log(`\nBlame for ${file}:\n`);
      const sortedLines = Array.from(lineBlame.entries()).slice(0, 20);
      for (const [line, blame] of sortedLines) {
        console.log(`  L${line}: ${blame.description} (${new Date(blame.timestamp).toLocaleDateString()})`);
      }
      if (lineBlame.size > 20) {
        console.log(`  ... and ${lineBlame.size - 20} more lines`);
      }
    }
  });

// Conversation - Show conversation history for a checkpoint
program
  .command("conversation")
  .description("Show conversation history associated with a checkpoint")
  .option("-c, --checkpoint <id>", "Checkpoint ID")
  .option("-l, --limit <n>", "Limit messages", "20")
  .option("--json", "Output as JSON")
  .option("--format <format>", "Output format (plain|markdown)", "plain")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    // Get events/messages for the project
    const events = repo.listEvents(project.projectId, "chat.message", parseInt(options.limit));
    const messages = events.filter((e) => {
      const payload = asRecord(e.payload);
      return (
        e.type === "chat.message" ||
        e.type.startsWith("message.") ||
        typeof payload?.role === "string"
      );
    });

    if (options.json) {
      const output = messages.map((e) => {
        const payload = asRecord(e.payload);
        return {
          id: e.eventId,
          timestamp: e.createdAt,
          role: typeof payload?.role === "string" ? payload.role : "unknown",
          content:
            typeof payload?.content === "string"
              ? payload.content
              : typeof payload?.message === "string"
                ? payload.message
                : "",
          checkpointId: options.checkpoint || null,
        };
      });
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (messages.length === 0) {
      console.log("No conversation history found.");
      console.log("Conversations are captured when using 'aitm claude' or 'aitm run'.");
      return;
    }

    console.log(`\n💬 Conversation History:\n`);

    for (const event of messages.reverse()) {
      const payload = asRecord(event.payload);
      const role = typeof payload?.role === "string" ? payload.role : "unknown";
      const content =
        typeof payload?.content === "string"
          ? payload.content
          : typeof payload?.message === "string"
            ? payload.message
            : "";
      const time = new Date(event.createdAt ?? event.timestamp).toLocaleTimeString();
      const icon = role === "user" ? "👤" : role === "assistant" ? "🤖" : "⚙️";

      if (options.format === "markdown") {
        console.log(`### ${icon} ${role.charAt(0).toUpperCase() + role.slice(1)} (${time})\n`);
        console.log(content);
        console.log("\n---\n");
      } else {
        const truncated = content.length > 200 ? content.slice(0, 200) + "..." : content;
        console.log(`${icon} [${time}] ${role}:`);
        console.log(`   ${truncated.replace(/\n/g, "\n   ")}`);
        console.log("");
      }
    }
  });

// Bisect - Binary search for breaking change
program
  .command("bisect")
  .description("Binary search to find when a test/command started failing")
  .option("-t, --test <command>", "Test command to run")
  .option("-g, --good <checkpoint>", "Known good checkpoint ID")
  .option("-b, --bad <checkpoint>", "Known bad checkpoint ID (default: current)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: "Project not initialized" }));
      } else {
        console.error("❌ Project not initialized.");
      }
      process.exit(1);
    }

    if (!options.test) {
      console.error("❌ Must specify --test <command> to run");
      process.exit(1);
    }

    // Find good and bad checkpoints
    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 100);

    let goodCheckpoint = options.good
      ? checkpoints.find(cp => cp.checkpointId === options.good || cp.checkpointId.startsWith(options.good))
      : null;

    let badCheckpoint = options.bad
      ? checkpoints.find(cp => cp.checkpointId === options.bad || cp.checkpointId.startsWith(options.bad))
      : checkpoints[0]; // Default to most recent

    if (!goodCheckpoint) {
      // Find last green checkpoint
      const { findLastGreenCheckpoint } = await import("./cli/natural-language.js");
      const green = findLastGreenCheckpoint(repo, project.projectId);
      if (green) {
        goodCheckpoint = checkpoints.find(cp => cp.checkpointId === green.checkpointId);
      }
    }

    if (!goodCheckpoint || !badCheckpoint) {
      console.error("❌ Could not determine good/bad checkpoints.");
      console.log("   Use --good <checkpoint-id> and optionally --bad <checkpoint-id>");
      process.exit(1);
    }

    console.log(`\n🔍 Bisecting between:`);
    console.log(`   ✅ Good: ${goodCheckpoint.name} (${goodCheckpoint.checkpointId.slice(0, 12)})`);
    console.log(`   ❌ Bad: ${badCheckpoint.name} (${badCheckpoint.checkpointId.slice(0, 12)})`);
    console.log(`   Test: ${options.test}\n`);

    // Get checkpoints between good and bad
    const goodTime = new Date(goodCheckpoint.createdAt).getTime();
    const badTime = new Date(badCheckpoint.createdAt).getTime();

    const range = checkpoints.filter(cp => {
      const cpTime = new Date(cp.createdAt).getTime();
      return cpTime >= Math.min(goodTime, badTime) && cpTime <= Math.max(goodTime, badTime);
    });

    if (range.length < 2) {
      console.log("No checkpoints between good and bad to bisect.");
      process.exit(0);
    }

    console.log(`📊 ${range.length} checkpoints to bisect\n`);

    // Binary search
    let left = 0;
    let right = range.length - 1;
    let firstBad: typeof range[0] | null = null;
    let iterations = 0;
    const maxIterations = Math.ceil(Math.log2(range.length)) + 1;

    const { execSync } = await import("child_process");
    const lock = new ProjectLock(project.rootPath);

    while (left < right && iterations < maxIterations) {
      iterations++;
      const mid = Math.floor((left + right) / 2);
      const checkpoint = range[mid];

      console.log(`[${iterations}/${maxIterations}] Testing: ${checkpoint.name}`);

      // Restore to checkpoint
      lock.acquire();
      try {
        const manifestBlob = cas.getBytes(checkpoint.manifestBlobHash);
        const manifest = parseManifestJson(manifestBlob.toString("utf8"));

        restoreWorkspaceAtomic({
          projectRoot: project.rootPath,
          cas,
          manifest,
          mode: "hard",
          backupCurrent: false,
        });

        // Run test
        try {
          execSync(options.test, { cwd: project.rootPath, stdio: "inherit" });
          console.log(`   ✅ Test passed\n`);
          left = mid + 1;
        } catch {
          console.log(`   ❌ Test failed\n`);
          firstBad = checkpoint;
          right = mid;
        }
      } finally {
        lock.release();
      }
    }

    // Restore to latest
    const latestCheckpoint = checkpoints[0];
    lock.acquire();
    try {
      const manifestBlob = cas.getBytes(latestCheckpoint.manifestBlobHash);
      const manifest = parseManifestJson(manifestBlob.toString("utf8"));
      restoreWorkspaceAtomic({
        projectRoot: project.rootPath,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });
    } finally {
      lock.release();
    }

    if (options.json) {
      console.log(JSON.stringify({
        firstBadCheckpoint: firstBad ? {
          id: firstBad.checkpointId,
          description: firstBad.name,
          timestamp: firstBad.createdAt,
        } : null,
        iterations,
        restored: latestCheckpoint.checkpointId,
      }, null, 2));
      return;
    }

    if (firstBad) {
      console.log(`\n🎯 First bad checkpoint found:`);
      console.log(`   ${firstBad.name}`);
      console.log(`   ID: ${firstBad.checkpointId}`);
      console.log(`   Time: ${new Date(firstBad.createdAt).toLocaleString()}`);
      console.log(`\n   Run 'aitm diff ${firstBad.checkpointId}' to see what changed.`);
    } else {
      console.log(`\n❓ Could not determine the first bad checkpoint.`);
    }

    console.log(`\n✓ Restored to latest checkpoint.`);
  });

// Why - Explain why something broke
program
  .command("why")
  .description("Analyze why something might have broken")
  .argument("<query...>", "What broke (e.g., 'tests failing', 'build broken')")
  .action(async (queryParts) => {
    const { findLastGreenCheckpoint, parseTimeQuery, findCheckpointsForQuery, analyzeChanges, explainChanges } = await import("./cli/natural-language.js");

    const cwd = process.cwd();
    const repo = getRepo();
    const cas = getCas();

    const projects = repo.listProjects();
    const project = projects.find(p => p.rootPath === cwd);

    if (!project) {
      console.error("❌ Project not initialized.");
      process.exit(1);
    }

    const query = queryParts.join(" ");
    console.log(`\n🔍 Analyzing: "${query}"\n`);

    // Find last green checkpoint
    const green = findLastGreenCheckpoint(repo, project.projectId);
    if (!green) {
      console.log("❓ No 'green' checkpoint found to compare against.");
      console.log("   Create checkpoints like 'Tests green' to enable this analysis.");
      process.exit(1);
    }

    // Get current/latest checkpoint
    const checkpoints = repo.listCheckpointsNewestFirst(project.projectId, 1);
    if (checkpoints.length === 0) {
      console.error("❌ No checkpoints found.");
      process.exit(1);
    }

    const currentCheckpoint = checkpoints[0];
    const greenCheckpoint = repo.getCheckpoint(project.projectId, green.checkpointId)!;

    console.log(`📊 Comparing:`);
    console.log(`   ✅ Last green: ${greenCheckpoint.name}`);
    console.log(`      ${new Date(greenCheckpoint.createdAt).toLocaleString()}`);
    console.log(`   ❓ Current: ${currentCheckpoint.name}`);
    console.log(`      ${new Date(currentCheckpoint.createdAt).toLocaleString()}`);
    console.log("");

    // Load manifests and analyze
    const greenManifestBlob = cas.getBytes(greenCheckpoint.manifestBlobHash);
    const currentManifestBlob = cas.getBytes(currentCheckpoint.manifestBlobHash);

    const greenManifest = JSON.parse(greenManifestBlob.toString("utf8"));
    const currentManifest = JSON.parse(currentManifestBlob.toString("utf8"));

    const analysis = analyzeChanges(greenManifest, currentManifest);

    console.log(`🔎 Changes since last green state:\n`);
    console.log(explainChanges(analysis));

    // Suggest likely culprits based on file types
    const likelyCulprits: string[] = [];

    // Test-related files
    if (query.toLowerCase().includes("test")) {
      const testFiles = analysis.filesModified.filter(f =>
        /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f) ||
        f.includes("__tests__") ||
        f.includes("test/") ||
        f.includes("tests/")
      );
      if (testFiles.length > 0) {
        likelyCulprits.push(...testFiles);
      }
    }

    // Config files
    const configFiles = analysis.filesModified.filter(f =>
      /\.(json|yaml|yml|toml|config\.\w+)$/.test(f) ||
      f.includes("config") ||
      f === "package.json" ||
      f === "tsconfig.json"
    );
    if (configFiles.length > 0) {
      likelyCulprits.push(...configFiles);
    }

    if (likelyCulprits.length > 0) {
      console.log(`\n💡 Likely culprits:`);
      likelyCulprits.slice(0, 5).forEach(f => console.log(`   ${f}`));
    }

    console.log(`\n🛠️  Suggestions:`);
    console.log(`   • Run 'aitm back-to last-green' to restore working state`);
    console.log(`   • Run 'aitm diff ${greenCheckpoint.checkpointId.slice(0, 12)}' for detailed changes`);
  });

// Raw git passthrough: `aitm git <...args>` forwards verbatim to the resolved
// git binary (bundled bin/git when present, else system git) via GitEngine.
// `enablePositionalOptions` + `passThroughOptions` ensure flags like `-m` are
// handed to git untouched rather than parsed by commander.
program
  .command("git")
  .description("Run a git command through AITM's resolved git engine")
  .argument("[args...]", "Arguments passed verbatim to git")
  .allowUnknownOption(true)
  .passThroughOptions(true)
  .action(async (args: string[]) => {
    const engine = new GitEngine({ cwd: process.cwd() });
    if (!Array.isArray(args) || args.length === 0) {
      console.error("Usage: aitm git <git-args...>");
      console.error(`Using git binary: ${engine.getBinary()}`);
      process.exit(1);
    }
    try {
      const result = await engine.run(args);
      if (result.stdout.length > 0) {
        process.stdout.write(result.stdout + "\n");
      }
      if (result.stderr.length > 0) {
        process.stderr.write(result.stderr + "\n");
      }
    } catch (err) {
      console.error(errorMessage(err));
      process.exit(1);
    }
  });

program.parse();
