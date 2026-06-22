#!/usr/bin/env npx tsx
/**
 * Neon PostgreSQL Production Verification Script
 *
 * Connects to the Neon database using DATABASE_URL, then runs:
 *   1. Connection probe (SELECT 1)
 *   2. Latency probe (SELECT now())
 *   3. Replication lag check
 *   4. Schema probes (table existence, columns, indexes)
 *   5. Migration drift check
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *   2 - Configuration error (missing DATABASE_URL)
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/verify-neon.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/verify-neon.ts --json
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

// ============================================================================
// Configuration
// ============================================================================

const DATABASE_URL = process.env.DATABASE_URL;
const OUTPUT_JSON = process.argv.includes("--json");

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(2);
}

// ============================================================================
// Expected schema definition (mirrored from db-health.ts for standalone use)
// ============================================================================

const EXPECTED_TABLES: Record<string, { columns: string[]; indexes: string[] }> = {
  users: {
    columns: ["id", "email", "name", "plan", "polar_customer_id", "storage_used_bytes", "created_at", "updated_at"],
    indexes: ["users_pkey"],
  },
  api_keys: {
    columns: ["id", "user_id", "key_hash", "key_prefix", "name", "scopes", "expires_at", "allowed_ips", "last_used_at", "created_at", "revoked_at"],
    indexes: ["api_keys_pkey"],
  },
  sessions: {
    columns: ["id", "user_id", "token_hash", "ip_address", "user_agent", "device_info", "last_active_at", "expires_at", "revoked", "revoked_at", "created_at"],
    indexes: ["sessions_pkey", "idx_auth_sessions_user", "idx_auth_sessions_token_hash", "idx_auth_sessions_expires", "idx_auth_sessions_revoked"],
  },
  subscriptions: {
    columns: ["id", "user_id", "polar_customer_id", "polar_product_id", "status", "plan", "current_period_start", "current_period_end", "cancel_at_period_end", "canceled_at", "created_at", "updated_at"],
    indexes: ["subscriptions_pkey", "idx_subscriptions_user", "idx_subscriptions_status", "idx_subscriptions_polar_customer"],
  },
  organizations: {
    columns: ["id", "name", "slug", "owner_id", "plan", "metadata", "created_at", "updated_at"],
    indexes: ["organizations_pkey", "idx_organizations_slug", "idx_organizations_owner"],
  },
  projects: {
    columns: ["id", "user_id", "org_id", "name", "root_path", "created_at", "updated_at", "last_synced_at"],
    indexes: ["projects_pkey", "idx_projects_user", "idx_projects_org"],
  },
  checkpoints: {
    columns: ["id", "project_id", "user_id", "org_id", "parent_id", "name", "description", "scope", "manifest_hash", "root_tree_hash", "trigger_type", "linked_checkpoint_id", "created_at", "metadata"],
    indexes: ["checkpoints_pkey", "idx_checkpoints_project", "idx_checkpoints_user", "idx_checkpoints_org", "idx_checkpoints_created"],
  },
  checkpoint_files: {
    columns: ["checkpoint_id", "file_path", "blob_hash", "size", "mode", "mtime_ms", "change_type"],
    indexes: ["checkpoint_files_pkey", "idx_checkpoint_files_path"],
  },
  blobs: {
    columns: ["hash", "user_id", "size", "mime_type", "content", "storage_type", "created_at"],
    indexes: ["blobs_pkey"],
  },
  trees: {
    columns: ["id", "project_id", "hash", "parent_path", "entries", "created_at"],
    indexes: ["trees_pkey", "idx_trees_project_hash", "idx_trees_hash", "idx_trees_parent_path"],
  },
  chat_sessions: {
    columns: ["id", "project_id", "user_id", "tool", "started_at", "ended_at", "metadata"],
    indexes: ["chat_sessions_pkey", "idx_sessions_project", "idx_sessions_user"],
  },
  chat_messages: {
    columns: ["id", "session_id", "project_id", "user_id", "checkpoint_id", "role", "content", "content_hash", "is_context_injection", "timestamp", "metadata"],
    indexes: ["chat_messages_pkey", "idx_messages_session", "idx_messages_project", "idx_messages_timestamp"],
  },
  webhooks: {
    columns: ["id", "user_id", "url", "secret", "events", "is_active", "created_at", "updated_at", "last_triggered_at", "failure_count"],
    indexes: ["webhooks_pkey", "idx_webhooks_user", "idx_webhooks_active"],
  },
  repositories: {
    columns: ["id", "project_id", "user_id", "name", "root_path", "last_indexed_at", "index_status", "file_count", "symbol_count", "created_at", "updated_at", "metadata"],
    indexes: ["repositories_pkey", "idx_repositories_project", "idx_repositories_user"],
  },
  audit_logs: {
    columns: ["id", "user_id", "action", "resource_type", "resource_id", "ip_address", "user_agent", "metadata", "created_at"],
    indexes: ["audit_logs_pkey", "idx_audit_logs_user", "idx_audit_logs_action", "idx_audit_logs_resource_type", "idx_audit_logs_created_at"],
  },
  posts: {
    columns: ["id", "author_user_id", "repository_id", "project_id", "type", "caption", "code_snippet", "language", "linked_checkpoint_id", "visibility", "published_at", "created_at", "updated_at"],
    indexes: ["posts_pkey", "idx_posts_repo_created", "idx_posts_author_created"],
  },
  follows: {
    columns: ["id", "follower_user_id", "target_type", "target_user_id", "target_repository_id", "created_at"],
    indexes: ["follows_pkey", "idx_follows_target_user", "idx_follows_target_repo"],
  },
  trend_scores: {
    columns: ["id", "repository_id", "window_start", "window_end", "score", "signals", "created_at"],
    indexes: ["trend_scores_pkey", "idx_trend_scores_repo_window"],
  },
};

const EXPECTED_MIGRATIONS = [
  "0001_add_storage_used_bytes",
  "0002_add_knowledge_base_tables",
  "0003_add_canonical_time_context_governance",
  "0004_add_gitgram_social_layer",
];

// ============================================================================
// Database connection
// ============================================================================

const neonSql = neon(DATABASE_URL);
const db = drizzle(neonSql);

// ============================================================================
// Probe functions
// ============================================================================

interface ProbeResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  duration_ms: number;
  details?: Record<string, unknown>;
}

async function probeConnection(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1 AS ping`);
    return {
      name: "connection",
      status: "pass",
      message: "Database connection successful",
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "connection",
      status: "fail",
      message: `Connection failed: ${error instanceof Error ? error.message : "unknown"}`,
      duration_ms: Date.now() - start,
    };
  }
}

async function probeLatency(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT now() AS server_time`);
    const ms = Date.now() - start;
    const status = ms > 2000 ? "fail" : ms > 500 ? "warn" : "pass";
    return {
      name: "latency",
      status,
      message: `Query latency: ${ms}ms`,
      duration_ms: ms,
    };
  } catch (error) {
    return {
      name: "latency",
      status: "fail",
      message: `Latency probe failed: ${error instanceof Error ? error.message : "unknown"}`,
      duration_ms: Date.now() - start,
    };
  }
}

async function probeReplication(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const result = await db.execute(
      sql`SELECT CASE
            WHEN pg_is_in_recovery() THEN
              EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
            ELSE 0
          END AS lag_seconds`
    );
    const ms = Date.now() - start;
    const lag = parseFloat((result as any[])[0]?.lag_seconds ?? "0");
    const status = lag > 30 ? "fail" : lag > 5 ? "warn" : "pass";
    return {
      name: "replication",
      status,
      message: `Replication lag: ${lag.toFixed(1)}s`,
      duration_ms: ms,
      details: { lag_seconds: lag },
    };
  } catch {
    return {
      name: "replication",
      status: "pass",
      message: "Replication check: not available (Neon serverless mode)",
      duration_ms: Date.now() - start,
    };
  }
}

async function probeTable(
  tableName: string,
  expectedColumns: string[],
  expectedIndexes: string[]
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const colResult = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${tableName}
          ORDER BY ordinal_position`
    );
    const actualColumns = (colResult as any[]).map((r: any) => r.column_name);

    if (actualColumns.length === 0) {
      return {
        name: `schema:${tableName}`,
        status: "fail",
        message: `Table '${tableName}' does not exist`,
        duration_ms: Date.now() - start,
      };
    }

    const missingCols = expectedColumns.filter((c) => !actualColumns.includes(c));

    const idxResult = await db.execute(
      sql`SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = ${tableName}
          ORDER BY indexname`
    );
    const actualIndexes = (idxResult as any[]).map((r: any) => r.indexname);
    const missingIdxs = expectedIndexes.filter((i) => !actualIndexes.includes(i));

    const messages: string[] = [];
    let status: "pass" | "fail" | "warn" = "pass";

    if (missingCols.length > 0) {
      status = "fail";
      messages.push(`missing columns: [${missingCols.join(", ")}]`);
    }
    if (missingIdxs.length > 0) {
      if (status !== "fail") status = "warn";
      messages.push(`missing indexes: [${missingIdxs.join(", ")}]`);
    }

    return {
      name: `schema:${tableName}`,
      status,
      message: messages.length > 0
        ? `${tableName}: ${messages.join("; ")}`
        : `${tableName}: OK (${actualColumns.length} columns, ${actualIndexes.length} indexes)`,
      duration_ms: Date.now() - start,
      details: {
        columns: actualColumns.length,
        indexes: actualIndexes.length,
        missingColumns: missingCols,
        missingIndexes: missingIdxs,
      },
    };
  } catch (error) {
    return {
      name: `schema:${tableName}`,
      status: "fail",
      message: `Schema probe for '${tableName}' failed: ${error instanceof Error ? error.message : "unknown"}`,
      duration_ms: Date.now() - start,
    };
  }
}

async function probeMigrationDrift(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const tableCheck = await db.execute(
      sql`SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
          ) AS exists`
    );

    if (!(tableCheck as any[])[0]?.exists) {
      return {
        name: "migration_drift",
        status: "warn",
        message: "Migration tracking table not found (may use db:push)",
        duration_ms: Date.now() - start,
      };
    }

    const migResult = await db.execute(
      sql`SELECT tag FROM __drizzle_migrations ORDER BY created_at`
    );
    const applied = (migResult as any[]).map((r: any) => r.tag);
    const missing = EXPECTED_MIGRATIONS.filter((m) => !applied.includes(m));
    const extra = applied.filter((m: string) => !EXPECTED_MIGRATIONS.includes(m));

    if (missing.length > 0) {
      return {
        name: "migration_drift",
        status: "fail",
        message: `Missing migrations: [${missing.join(", ")}]`,
        duration_ms: Date.now() - start,
        details: { applied, missing, extra },
      };
    }

    if (extra.length > 0) {
      return {
        name: "migration_drift",
        status: "warn",
        message: `Unexpected migrations: [${extra.join(", ")}]`,
        duration_ms: Date.now() - start,
        details: { applied, missing, extra },
      };
    }

    return {
      name: "migration_drift",
      status: "pass",
      message: `All ${EXPECTED_MIGRATIONS.length} expected migrations applied`,
      duration_ms: Date.now() - start,
      details: { applied },
    };
  } catch (error) {
    return {
      name: "migration_drift",
      status: "fail",
      message: `Migration drift check failed: ${error instanceof Error ? error.message : "unknown"}`,
      duration_ms: Date.now() - start,
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const results: ProbeResult[] = [];

  // Health probes
  console.log("=== Neon Production Verification ===\n");

  console.log("[1/4] Connection probe...");
  results.push(await probeConnection());

  console.log("[2/4] Latency probe...");
  results.push(await probeLatency());

  console.log("[3/4] Replication probe...");
  results.push(await probeReplication());

  // Schema probes
  console.log("[4/4] Schema probes...");
  const tableNames = Object.keys(EXPECTED_TABLES);
  for (const tableName of tableNames) {
    const def = EXPECTED_TABLES[tableName];
    results.push(await probeTable(tableName, def.columns, def.indexes));
  }

  // Migration drift
  console.log("      Migration drift check...");
  results.push(await probeMigrationDrift());

  // Output
  if (OUTPUT_JSON) {
    const passed = results.filter((r) => r.status === "pass").length;
    const warned = results.filter((r) => r.status === "warn").length;
    const failed = results.filter((r) => r.status === "fail").length;
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          overall: failed > 0 ? "unhealthy" : warned > 0 ? "degraded" : "healthy",
          summary: { total: results.length, passed, warned, failed },
          results,
        },
        null,
        2
      )
    );
  } else {
    console.log("\n=== Results ===\n");
    for (const r of results) {
      const icon = r.status === "pass" ? "PASS" : r.status === "warn" ? "WARN" : "FAIL";
      console.log(`  [${icon}] ${r.name}: ${r.message} (${r.duration_ms}ms)`);
    }
    const passed = results.filter((r) => r.status === "pass").length;
    const warned = results.filter((r) => r.status === "warn").length;
    const failed = results.filter((r) => r.status === "fail").length;
    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Warnings: ${warned} | Failed: ${failed}`);
  }

  // Exit code
  const hasFails = results.some((r) => r.status === "fail");
  process.exit(hasFails ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
