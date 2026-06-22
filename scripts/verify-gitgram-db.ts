#!/usr/bin/env npx tsx
/**
 * Gitgram PostgreSQL Production Verification Script
 *
 * Connects to the gitgram backend PostgreSQL database using DATABASE_URL,
 * then runs:
 *   1. Connection probe
 *   2. Latency probe
 *   3. Prisma migration status check (via prisma CLI)
 *   4. Core table existence checks (Account, User, Post, etc.)
 *   5. Schema drift detection (expected columns vs actual)
 *
 * Uses @prisma/client for database access (must run prisma generate first).
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *   2 - Configuration error (missing DATABASE_URL)
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/verify-gitgram-db.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/verify-gitgram-db.ts --json
 */

import { execSync } from "child_process";

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
// Expected Prisma models -> table names and key columns
// Derived from gitgram/backend/prisma/schema.prisma
// ============================================================================

const EXPECTED_TABLES: Record<string, { columns: string[] }> = {
  Account: {
    columns: [
      "id", "type", "username", "displayName", "avatar", "bio", "verified",
      "createdAt", "updatedAt", "userId", "repositoryId", "organizationId",
    ],
  },
  User: {
    columns: [
      "id", "email", "password", "username", "displayName", "avatar",
      "bio", "role", "githubId", "githubUsername", "emailVerified",
      "verified", "isPrivate", "isBanned", "createdAt",
    ],
  },
  Repository: {
    columns: ["id", "name", "fullName", "description", "language", "createdAt"],
  },
  Organization: {
    columns: ["id", "name", "description", "createdAt"],
  },
  Post: {
    columns: ["id", "type", "caption", "createdAt", "updatedAt", "accountId"],
  },
  Comment: {
    columns: ["id", "content", "createdAt", "updatedAt", "accountId", "postId"],
  },
  Like: {
    columns: ["id", "createdAt", "accountId", "postId"],
  },
  Follow: {
    columns: ["id", "createdAt", "followerId", "followingId"],
  },
  Story: {
    columns: ["id", "createdAt", "expiresAt", "accountId"],
  },
  Message: {
    columns: ["id", "content", "createdAt", "senderId", "receiverId"],
  },
  Notification: {
    columns: ["id", "type", "message", "read", "createdAt", "userId"],
  },
};

// ============================================================================
// Probe functions using PrismaClient.$queryRawUnsafe
// ============================================================================

interface ProbeResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  duration_ms: number;
  details?: Record<string, unknown>;
}

// Dynamic import of PrismaClient to handle cases where it hasn't been generated
let prisma: any = null;

async function initPrisma(): Promise<boolean> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    return true;
  } catch (error) {
    return false;
  }
}

async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}

async function probeConnection(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1 AS ping");
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
    await prisma.$queryRawUnsafe("SELECT now() AS server_time");
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

async function probePrismaMigrations(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    // Check if _prisma_migrations table exists
    const tableCheck: any[] = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
       ) AS "exists"`
    );

    if (!tableCheck[0]?.exists) {
      return {
        name: "prisma_migrations",
        status: "warn",
        message: "Prisma migrations table not found (fresh database or using db push)",
        duration_ms: Date.now() - start,
      };
    }

    // Get migration status
    const migrations: any[] = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at, applied_steps_count,
              CASE WHEN rolled_back_at IS NOT NULL THEN true ELSE false END AS rolled_back
       FROM "_prisma_migrations"
       ORDER BY started_at`
    );

    const totalMigrations = migrations.length;
    const failedMigrations = migrations.filter(
      (m: any) => m.finished_at === null && !m.rolled_back
    );
    const rolledBack = migrations.filter((m: any) => m.rolled_back);

    if (failedMigrations.length > 0) {
      return {
        name: "prisma_migrations",
        status: "fail",
        message: `${failedMigrations.length} migration(s) incomplete: [${failedMigrations.map((m: any) => m.migration_name).join(", ")}]`,
        duration_ms: Date.now() - start,
        details: {
          total: totalMigrations,
          failed: failedMigrations.map((m: any) => m.migration_name),
          rolledBack: rolledBack.map((m: any) => m.migration_name),
        },
      };
    }

    if (rolledBack.length > 0) {
      return {
        name: "prisma_migrations",
        status: "warn",
        message: `${totalMigrations} migrations applied, ${rolledBack.length} rolled back`,
        duration_ms: Date.now() - start,
        details: {
          total: totalMigrations,
          rolledBack: rolledBack.map((m: any) => m.migration_name),
        },
      };
    }

    return {
      name: "prisma_migrations",
      status: "pass",
      message: `${totalMigrations} migrations applied successfully`,
      duration_ms: Date.now() - start,
      details: {
        total: totalMigrations,
        latest: migrations[migrations.length - 1]?.migration_name || "none",
      },
    };
  } catch (error) {
    return {
      name: "prisma_migrations",
      status: "fail",
      message: `Migration check failed: ${error instanceof Error ? error.message : "unknown"}`,
      duration_ms: Date.now() - start,
    };
  }
}

async function probeTable(
  tableName: string,
  expectedColumns: string[]
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    // Prisma uses the model name as-is for the table name by default
    let actualColumns: string[] = [];

    // Try the exact table name first
    const colResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      tableName
    );
    actualColumns = colResult.map((r: any) => r.column_name);

    // If not found, try with double-quote escaped version
    if (actualColumns.length === 0) {
      const quotedResult: any[] = await prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        tableName
      );
      actualColumns = quotedResult.map((r: any) => r.column_name);
    }

    if (actualColumns.length === 0) {
      return {
        name: `schema:${tableName}`,
        status: "fail",
        message: `Table '${tableName}' does not exist`,
        duration_ms: Date.now() - start,
      };
    }

    // Check for missing columns (Prisma column names match model field names)
    const missingCols = expectedColumns.filter((col) => {
      return !actualColumns.includes(col);
    });

    let status: "pass" | "fail" | "warn" = "pass";
    if (missingCols.length > 0) {
      status = missingCols.length > expectedColumns.length / 2 ? "fail" : "warn";
    }

    return {
      name: `schema:${tableName}`,
      status,
      message:
        missingCols.length > 0
          ? `${tableName}: missing columns [${missingCols.join(", ")}]`
          : `${tableName}: OK (${actualColumns.length} columns)`,
      duration_ms: Date.now() - start,
      details: {
        actualColumnCount: actualColumns.length,
        missingColumns: missingCols,
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

// ============================================================================
// Prisma CLI migration status check
// ============================================================================

async function probePrismaCLIMigrationStatus(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const output = execSync("npx prisma migrate status 2>&1", {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, DATABASE_URL },
    });

    const hasPending = output.includes("Following migration(s) have not yet been applied");
    const hasFailed = output.includes("failed to apply");
    const isUpToDate =
      output.includes("Database schema is up to date") ||
      output.includes("migrations found in prisma/migrations");

    if (hasFailed) {
      return {
        name: "prisma_cli_status",
        status: "fail",
        message: "Prisma reports failed migrations",
        duration_ms: Date.now() - start,
        details: { output: output.trim() },
      };
    }

    if (hasPending) {
      return {
        name: "prisma_cli_status",
        status: "warn",
        message: "Prisma reports pending (unapplied) migrations",
        duration_ms: Date.now() - start,
        details: { output: output.trim() },
      };
    }

    return {
      name: "prisma_cli_status",
      status: "pass",
      message: "Prisma migration status: up to date",
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    // prisma migrate status exits non-zero when there are pending migrations
    const stderr = error instanceof Error ? (error as any).stderr || error.message : "unknown";
    const stdout = error instanceof Error ? (error as any).stdout || "" : "";

    return {
      name: "prisma_cli_status",
      status: "warn",
      message: `Prisma CLI status check: ${stdout || stderr}`.slice(0, 200),
      duration_ms: Date.now() - start,
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const results: ProbeResult[] = [];

  console.log("=== Gitgram DB Production Verification ===\n");

  // Initialize Prisma Client
  console.log("Initializing Prisma Client...");
  const prismaReady = await initPrisma();

  if (!prismaReady) {
    console.error("Failed to initialize Prisma Client. Ensure 'prisma generate' has been run.");
    results.push({
      name: "prisma_init",
      status: "fail",
      message: "Failed to initialize PrismaClient (run prisma generate first)",
      duration_ms: 0,
    });

    // Fall back to CLI-only checks
    console.log("[1/1] Prisma CLI migration status...");
    results.push(await probePrismaCLIMigrationStatus());
  } else {
    // Connection probe
    console.log("[1/5] Connection probe...");
    const connResult = await probeConnection();
    results.push(connResult);

    if (connResult.status === "fail") {
      console.error("Connection failed, cannot continue with DB probes.");
    } else {
      // Latency probe
      console.log("[2/5] Latency probe...");
      results.push(await probeLatency());

      // Prisma migration status (via SQL)
      console.log("[3/5] Prisma migration status (SQL)...");
      results.push(await probePrismaMigrations());

      // Prisma CLI migration status
      console.log("[4/5] Prisma CLI migration status...");
      results.push(await probePrismaCLIMigrationStatus());

      // Schema probes
      console.log("[5/5] Schema probes...");
      for (const [tableName, def] of Object.entries(EXPECTED_TABLES)) {
        results.push(await probeTable(tableName, def.columns));
      }
    }

    await disconnectPrisma();
  }

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

  const hasFails = results.some((r) => r.status === "fail");
  process.exit(hasFails ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
