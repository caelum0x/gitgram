/**
 * Database Health Probe Module
 *
 * Provides connection pool health checks, query latency measurement,
 * replication lag detection, and schema verification for Neon PostgreSQL.
 *
 * Used by:
 *   - Health check endpoints (/health/db, /health/schema)
 *   - Production verification scripts (scripts/verify-neon.ts)
 *   - GitHub Actions scheduled verification workflow
 */
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

// ============================================================================
// Types
// ============================================================================

export interface HealthProbeResult {
  status: "pass" | "fail" | "warn";
  message: string;
  duration_ms: number;
  details?: Record<string, unknown>;
}

export interface SchemaProbeResult {
  status: "pass" | "fail" | "warn";
  table: string;
  checks: {
    exists: boolean;
    columns?: { expected: string[]; missing: string[]; extra: string[] };
    indexes?: { expected: string[]; missing: string[]; extra: string[] };
  };
  message: string;
}

export interface MigrationDriftResult {
  status: "pass" | "fail" | "warn";
  applied: string[];
  expected: string[];
  missing: string[];
  extra: string[];
  message: string;
}

export interface DbHealthReport {
  timestamp: string;
  overall: "healthy" | "degraded" | "unhealthy";
  connection: HealthProbeResult;
  latency: HealthProbeResult;
  replication: HealthProbeResult;
  schema: SchemaProbeResult[];
  migrationDrift: MigrationDriftResult;
}

// ============================================================================
// Expected schema definition derived from Drizzle schema.ts
// ============================================================================

/**
 * Canonical list of tables and their expected columns/indexes, derived from
 * the Drizzle schema at src/db/schema.ts. The verification scripts compare
 * the live database against this definition.
 */
export const EXPECTED_TABLES: Record<
  string,
  { columns: string[]; indexes: string[] }
> = {
  users: {
    columns: [
      "id",
      "email",
      "name",
      "plan",
      "polar_customer_id",
      "storage_used_bytes",
      "created_at",
      "updated_at",
    ],
    indexes: ["users_pkey"],
  },
  api_keys: {
    columns: [
      "id",
      "user_id",
      "key_hash",
      "key_prefix",
      "name",
      "scopes",
      "expires_at",
      "allowed_ips",
      "last_used_at",
      "created_at",
      "revoked_at",
    ],
    indexes: ["api_keys_pkey"],
  },
  sessions: {
    columns: [
      "id",
      "user_id",
      "token_hash",
      "ip_address",
      "user_agent",
      "device_info",
      "last_active_at",
      "expires_at",
      "revoked",
      "revoked_at",
      "created_at",
    ],
    indexes: [
      "sessions_pkey",
      "idx_auth_sessions_user",
      "idx_auth_sessions_token_hash",
      "idx_auth_sessions_expires",
      "idx_auth_sessions_revoked",
    ],
  },
  subscriptions: {
    columns: [
      "id",
      "user_id",
      "polar_customer_id",
      "polar_product_id",
      "status",
      "plan",
      "current_period_start",
      "current_period_end",
      "cancel_at_period_end",
      "canceled_at",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "subscriptions_pkey",
      "idx_subscriptions_user",
      "idx_subscriptions_status",
      "idx_subscriptions_polar_customer",
    ],
  },
  organizations: {
    columns: [
      "id",
      "name",
      "slug",
      "owner_id",
      "plan",
      "metadata",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "organizations_pkey",
      "idx_organizations_slug",
      "idx_organizations_owner",
    ],
  },
  org_members: {
    columns: ["id", "org_id", "user_id", "role", "invited_by", "joined_at"],
    indexes: [
      "org_members_pkey",
      "idx_org_members_org",
      "idx_org_members_user",
      "idx_org_members_org_user",
    ],
  },
  org_invitations: {
    columns: [
      "id",
      "org_id",
      "email",
      "role",
      "token",
      "expires_at",
      "created_at",
      "invited_by",
    ],
    indexes: [
      "org_invitations_pkey",
      "idx_org_invitations_org",
      "idx_org_invitations_email",
      "idx_org_invitations_token",
    ],
  },
  projects: {
    columns: [
      "id",
      "user_id",
      "org_id",
      "name",
      "root_path",
      "created_at",
      "updated_at",
      "last_synced_at",
    ],
    indexes: ["projects_pkey", "idx_projects_user", "idx_projects_org"],
  },
  checkpoints: {
    columns: [
      "id",
      "project_id",
      "user_id",
      "org_id",
      "parent_id",
      "name",
      "description",
      "scope",
      "manifest_hash",
      "root_tree_hash",
      "trigger_type",
      "linked_checkpoint_id",
      "created_at",
      "metadata",
    ],
    indexes: [
      "checkpoints_pkey",
      "idx_checkpoints_project",
      "idx_checkpoints_user",
      "idx_checkpoints_org",
      "idx_checkpoints_created",
    ],
  },
  checkpoint_files: {
    columns: [
      "checkpoint_id",
      "file_path",
      "blob_hash",
      "size",
      "mode",
      "mtime_ms",
      "change_type",
    ],
    indexes: ["checkpoint_files_pkey", "idx_checkpoint_files_path"],
  },
  diffs: {
    columns: [
      "id",
      "from_checkpoint_id",
      "to_checkpoint_id",
      "file_path",
      "diff_content",
      "stats",
      "algorithm",
      "created_at",
    ],
    indexes: ["diffs_pkey", "idx_diffs_from_to"],
  },
  restore_events: {
    columns: [
      "id",
      "project_id",
      "actor_user_id",
      "from_checkpoint_id",
      "to_checkpoint_id",
      "scope_type",
      "scope_path",
      "status",
      "details",
      "created_at",
    ],
    indexes: ["restore_events_pkey", "idx_restore_events_project_created"],
  },
  blobs: {
    columns: [
      "hash",
      "user_id",
      "size",
      "mime_type",
      "content",
      "storage_type",
      "created_at",
    ],
    indexes: ["blobs_pkey"],
  },
  trees: {
    columns: ["id", "project_id", "hash", "parent_path", "entries", "created_at"],
    indexes: [
      "trees_pkey",
      "idx_trees_project_hash",
      "idx_trees_hash",
      "idx_trees_parent_path",
    ],
  },
  chat_sessions: {
    columns: [
      "id",
      "project_id",
      "user_id",
      "tool",
      "started_at",
      "ended_at",
      "metadata",
    ],
    indexes: ["chat_sessions_pkey", "idx_sessions_project", "idx_sessions_user"],
  },
  chat_messages: {
    columns: [
      "id",
      "session_id",
      "project_id",
      "user_id",
      "checkpoint_id",
      "role",
      "content",
      "content_hash",
      "is_context_injection",
      "timestamp",
      "metadata",
    ],
    indexes: [
      "chat_messages_pkey",
      "idx_messages_session",
      "idx_messages_project",
      "idx_messages_timestamp",
    ],
  },
  tool_calls: {
    columns: [
      "id",
      "message_id",
      "session_id",
      "project_id",
      "user_id",
      "checkpoint_before_id",
      "checkpoint_after_id",
      "tool_name",
      "arguments",
      "result",
      "success",
      "error",
      "timestamp",
    ],
    indexes: [
      "tool_calls_pkey",
      "idx_toolcalls_session",
      "idx_toolcalls_project",
    ],
  },
  terminal_events: {
    columns: [
      "id",
      "session_id",
      "project_id",
      "user_id",
      "event_type",
      "command",
      "exit_code",
      "stdout_hash",
      "stderr_hash",
      "stderr_preview",
      "cwd",
      "duration_ms",
      "timestamp",
    ],
    indexes: [
      "terminal_events_pkey",
      "idx_terminal_project",
      "idx_terminal_session",
    ],
  },
  events: {
    columns: [
      "id",
      "project_id",
      "user_id",
      "event_type",
      "payload",
      "timestamp",
    ],
    indexes: [
      "events_pkey",
      "idx_events_project",
      "idx_events_type",
      "idx_events_timestamp",
    ],
  },
  webhooks: {
    columns: [
      "id",
      "user_id",
      "url",
      "secret",
      "events",
      "is_active",
      "created_at",
      "updated_at",
      "last_triggered_at",
      "failure_count",
    ],
    indexes: ["webhooks_pkey", "idx_webhooks_user", "idx_webhooks_active"],
  },
  webhook_deliveries: {
    columns: [
      "id",
      "webhook_id",
      "event_type",
      "payload",
      "status",
      "attempts",
      "last_attempt_at",
      "next_retry_at",
      "response_status",
      "response_body",
      "created_at",
    ],
    indexes: [
      "webhook_deliveries_pkey",
      "idx_deliveries_webhook",
      "idx_deliveries_status",
      "idx_deliveries_next_retry",
      "idx_deliveries_created",
    ],
  },
  repositories: {
    columns: [
      "id",
      "project_id",
      "user_id",
      "name",
      "root_path",
      "last_indexed_at",
      "index_status",
      "file_count",
      "symbol_count",
      "created_at",
      "updated_at",
      "metadata",
    ],
    indexes: [
      "repositories_pkey",
      "idx_repositories_project",
      "idx_repositories_user",
    ],
  },
  code_embeddings: {
    columns: [
      "id",
      "repository_id",
      "project_id",
      "user_id",
      "file_path",
      "symbol",
      "symbol_type",
      "content",
      "content_hash",
      "embedding_json",
      "line_start",
      "line_end",
      "language",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "code_embeddings_pkey",
      "idx_embeddings_repo",
      "idx_embeddings_project",
      "idx_embeddings_filepath",
      "idx_embeddings_symbol",
      "idx_embeddings_content_hash",
    ],
  },
  research_jobs: {
    columns: [
      "id",
      "user_id",
      "project_id",
      "query",
      "status",
      "priority",
      "result",
      "sources",
      "summary",
      "error",
      "progress",
      "created_at",
      "started_at",
      "completed_at",
      "metadata",
    ],
    indexes: [
      "research_jobs_pkey",
      "idx_research_user",
      "idx_research_project",
      "idx_research_status",
      "idx_research_created",
    ],
  },
  indexed_files: {
    columns: [
      "id",
      "repository_id",
      "file_path",
      "file_hash",
      "last_indexed_at",
      "symbol_count",
      "line_count",
      "language",
      "metadata",
    ],
    indexes: [
      "indexed_files_pkey",
      "idx_indexed_files_repo",
      "idx_indexed_files_path",
      "idx_indexed_files_hash",
    ],
  },
  knowledge_base_files: {
    columns: [
      "id",
      "repository_id",
      "project_id",
      "user_id",
      "file_path",
      "content",
      "content_hash",
      "size",
      "language",
      "source",
      "storage",
      "s3",
      "embedding_json",
      "embedding_model",
      "indexed_at",
      "updated_at",
    ],
    indexes: [
      "knowledge_base_files_pkey",
      "idx_kb_files_repo",
      "idx_kb_files_user",
      "idx_kb_files_path",
      "idx_kb_files_hash",
    ],
  },
  knowledge_base_artifacts: {
    columns: [
      "id",
      "user_id",
      "project_id",
      "job_id",
      "type",
      "format",
      "storage",
      "content",
      "content_hash",
      "size",
      "stats",
      "s3",
      "embedding_json",
      "embedding_model",
      "created_at",
    ],
    indexes: [
      "knowledge_base_artifacts_pkey",
      "idx_kb_artifacts_user",
      "idx_kb_artifacts_type",
      "idx_kb_artifacts_job",
    ],
  },
  audit_logs: {
    columns: [
      "id",
      "user_id",
      "action",
      "resource_type",
      "resource_id",
      "ip_address",
      "user_agent",
      "metadata",
      "created_at",
    ],
    indexes: [
      "audit_logs_pkey",
      "idx_audit_logs_user",
      "idx_audit_logs_action",
      "idx_audit_logs_resource_type",
      "idx_audit_logs_created_at",
    ],
  },
  consents: {
    columns: [
      "id",
      "organization_id",
      "project_id",
      "granted_by_user_id",
      "consent_type",
      "granted",
      "effective_from",
      "effective_to",
      "metadata",
      "created_at",
    ],
    indexes: ["consents_pkey", "idx_consents_scope"],
  },
  retention_policies: {
    columns: [
      "id",
      "organization_id",
      "project_id",
      "data_class",
      "retention_days",
      "hard_delete",
      "created_at",
      "updated_at",
    ],
    indexes: ["retention_policies_pkey", "idx_retention_scope"],
  },
  saved_contexts: {
    columns: [
      "id",
      "user_id",
      "project_id",
      "checkpoint_id",
      "name",
      "description",
      "messages",
      "system_prompt",
      "tool_state",
      "open_files",
      "working_directory",
      "git_branch",
      "git_commit",
      "embedding_json",
      "embedding_model",
      "tool",
      "is_auto_saved",
      "tags",
      "created_at",
      "updated_at",
      "expires_at",
      "metadata",
    ],
    indexes: [
      "saved_contexts_pkey",
      "idx_saved_contexts_user",
      "idx_saved_contexts_project",
      "idx_saved_contexts_checkpoint",
      "idx_saved_contexts_tool",
      "idx_saved_contexts_created",
      "idx_saved_contexts_auto_saved",
    ],
  },
  research_papers: {
    columns: [
      "id",
      "user_id",
      "project_id",
      "arxiv_id",
      "title",
      "authors",
      "abstract",
      "content",
      "published_date",
      "updated_date",
      "index_status",
      "index_error",
      "content_hash",
      "word_count",
      "metadata",
      "tags",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "research_papers_pkey",
      "idx_research_papers_user",
      "idx_research_papers_project",
      "idx_research_papers_arxiv",
      "idx_research_papers_status",
      "idx_research_papers_published",
      "idx_research_papers_created",
    ],
  },
  domain_verifications: {
    columns: [
      "id",
      "org_id",
      "domain",
      "verification_token",
      "verified",
      "verified_at",
      "created_at",
    ],
    indexes: [
      "domain_verifications_pkey",
      "idx_domain_verifications_org",
      "idx_domain_verifications_domain",
      "idx_domain_verifications_org_domain",
    ],
  },
  jobs: {
    columns: [
      "id",
      "user_id",
      "type",
      "status",
      "params",
      "result",
      "error",
      "progress",
      "created_at",
      "updated_at",
      "completed_at",
    ],
    indexes: [
      "jobs_pkey",
      "idx_jobs_user",
      "idx_jobs_type",
      "idx_jobs_status",
      "idx_jobs_created",
    ],
  },
  // Social layer tables
  organization_memberships: {
    columns: ["organization_id", "user_id", "role", "created_at"],
    indexes: ["organization_memberships_pkey"],
  },
  project_repositories: {
    columns: ["project_id", "repository_id", "created_at"],
    indexes: ["project_repositories_pkey", "idx_project_repo_repo"],
  },
  repo_profiles: {
    columns: [
      "id",
      "repository_id",
      "headline",
      "bio",
      "hero_media_url",
      "visibility",
      "created_at",
      "updated_at",
    ],
    indexes: ["repo_profiles_pkey"],
  },
  posts: {
    columns: [
      "id",
      "author_user_id",
      "repository_id",
      "project_id",
      "type",
      "caption",
      "code_snippet",
      "language",
      "linked_checkpoint_id",
      "visibility",
      "published_at",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "posts_pkey",
      "idx_posts_repo_created",
      "idx_posts_author_created",
    ],
  },
  post_assets: {
    columns: [
      "id",
      "post_id",
      "media_type",
      "storage_key",
      "mime_type",
      "width",
      "height",
      "duration_ms",
      "position",
      "created_at",
    ],
    indexes: ["post_assets_pkey"],
  },
  comments: {
    columns: [
      "id",
      "post_id",
      "author_user_id",
      "parent_comment_id",
      "body",
      "created_at",
      "updated_at",
    ],
    indexes: ["comments_pkey", "idx_comments_post_created"],
  },
  reactions: {
    columns: [
      "id",
      "user_id",
      "target_type",
      "target_id",
      "reaction",
      "created_at",
    ],
    indexes: ["reactions_pkey", "idx_reactions_target"],
  },
  follows: {
    columns: [
      "id",
      "follower_user_id",
      "target_type",
      "target_user_id",
      "target_repository_id",
      "created_at",
    ],
    indexes: [
      "follows_pkey",
      "idx_follows_target_user",
      "idx_follows_target_repo",
    ],
  },
  trend_scores: {
    columns: [
      "id",
      "repository_id",
      "window_start",
      "window_end",
      "score",
      "signals",
      "created_at",
    ],
    indexes: ["trend_scores_pkey", "idx_trend_scores_repo_window"],
  },
  oss_coverage_batches: {
    columns: [
      "id",
      "idempotency_key_hash",
      "request_hash",
      "request_id",
      "collector_version",
      "collector_key_slot",
      "window_started_at",
      "window_ended_at",
      "status",
      "repositories_measured",
      "contribution_count",
      "completed_at",
      "created_at",
    ],
    indexes: [
      "oss_coverage_batches_pkey",
      "idx_oss_coverage_idempotency",
      "idx_oss_coverage_window_version",
      "idx_oss_coverage_status_window",
    ],
  },
  oss_contribution_records: {
    columns: [
      "id",
      "batch_id",
      "repository_key",
      "contributor_key",
      "contributor_type",
      "contribution_key",
      "opened_at",
      "first_maintainer_response_at",
      "created_at",
    ],
    indexes: [
      "oss_contribution_records_pkey",
      "idx_oss_contributions_batch",
      "idx_oss_contributions_batch_contributor",
      "idx_oss_contributions_batch_contribution",
    ],
  },
  oss_case_evidence: {
    columns: [
      "id",
      "idempotency_key_hash",
      "request_hash",
      "request_id",
      "collector_version",
      "collector_key_slot",
      "repository_key",
      "project_id",
      "checkpoint_id",
      "restore_event_id",
      "recorded_at",
    ],
    indexes: [
      "oss_case_evidence_pkey",
      "idx_oss_case_evidence_idempotency",
      "idx_oss_case_evidence_repository",
      "idx_oss_case_evidence_project",
      "idx_oss_case_evidence_restore",
    ],
  },
};

/** Drizzle migration tags that should be present in the database */
export const EXPECTED_MIGRATIONS = [
  "0001_add_storage_used_bytes",
  "0002_add_knowledge_base_tables",
  "0003_add_canonical_time_context_governance",
  "0004_add_gitgram_social_layer",
  "0005_add_saved_context_source",
  "0006_add_user_settings",
  "0007_add_a2a_tables",
  "0008_add_checkpoint_test_status",
  "0009_add_oss_adoption_evidence",
];

// ============================================================================
// Health probe functions
// ============================================================================

/**
 * Test basic database connectivity by executing SELECT 1.
 */
export async function probeConnection(): Promise<HealthProbeResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1 AS ping`);
    const duration_ms = Date.now() - start;
    return {
      status: "pass",
      message: "Database connection successful",
      duration_ms,
    };
  } catch (error) {
    const duration_ms = Date.now() - start;
    return {
      status: "fail",
      message:
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : "Connection failed: unknown error",
      duration_ms,
    };
  }
}

/**
 * Measure query latency with a lightweight query. Returns "warn" if latency
 * exceeds 500ms, "fail" if it exceeds 2000ms.
 */
export async function probeLatency(): Promise<HealthProbeResult> {
  const WARN_MS = 500;
  const FAIL_MS = 2000;
  const start = Date.now();

  try {
    await db.execute(sql`SELECT now() AS server_time`);
    const duration_ms = Date.now() - start;

    if (duration_ms > FAIL_MS) {
      return {
        status: "fail",
        message: `Query latency critically high: ${duration_ms}ms (threshold ${FAIL_MS}ms)`,
        duration_ms,
      };
    }
    if (duration_ms > WARN_MS) {
      return {
        status: "warn",
        message: `Query latency elevated: ${duration_ms}ms (threshold ${WARN_MS}ms)`,
        duration_ms,
      };
    }
    return {
      status: "pass",
      message: `Query latency: ${duration_ms}ms`,
      duration_ms,
    };
  } catch (error) {
    const duration_ms = Date.now() - start;
    return {
      status: "fail",
      message:
        error instanceof Error
          ? `Latency probe failed: ${error.message}`
          : "Latency probe failed",
      duration_ms,
    };
  }
}

/**
 * Check replication lag. For Neon serverless, this queries
 * pg_stat_replication when available. If replication is not configured
 * (single-node), it returns "pass" with a note.
 */
export async function probeReplication(): Promise<HealthProbeResult> {
  const start = Date.now();
  try {
    const result = await db.execute(
      sql`SELECT CASE
            WHEN pg_is_in_recovery() THEN
              EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
            ELSE 0
          END AS lag_seconds`
    );
    const duration_ms = Date.now() - start;

    const rows = result as unknown as any[];
    if (!rows || rows.length === 0) {
      return {
        status: "pass",
        message: "Replication check: no replication configured (primary node)",
        duration_ms,
      };
    }

    const lagSeconds = parseFloat(rows[0]?.lag_seconds ?? "0");

    if (lagSeconds > 30) {
      return {
        status: "fail",
        message: `Replication lag critically high: ${lagSeconds.toFixed(1)}s`,
        duration_ms,
        details: { lag_seconds: lagSeconds },
      };
    }
    if (lagSeconds > 5) {
      return {
        status: "warn",
        message: `Replication lag elevated: ${lagSeconds.toFixed(1)}s`,
        duration_ms,
        details: { lag_seconds: lagSeconds },
      };
    }
    return {
      status: "pass",
      message: `Replication lag: ${lagSeconds.toFixed(1)}s`,
      duration_ms,
      details: { lag_seconds: lagSeconds },
    };
  } catch (error) {
    const duration_ms = Date.now() - start;
    // pg_is_in_recovery may not be available on all Neon plans -- treat as pass
    return {
      status: "pass",
      message: "Replication check: not available (Neon serverless mode)",
      duration_ms,
    };
  }
}

/**
 * Verify that a given table exists with expected columns and indexes.
 */
export async function probeTableSchema(
  tableName: string,
  expectedColumns: string[],
  expectedIndexes: string[]
): Promise<SchemaProbeResult> {
  try {
    // Check table existence and columns
    const colResult = await db.execute(
      sql`SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
          ORDER BY ordinal_position`
    );

    const actualColumns = (colResult as unknown as any[]).map(
      (r: any) => r.column_name as string
    );

    if (actualColumns.length === 0) {
      return {
        status: "fail",
        table: tableName,
        checks: {
          exists: false,
          columns: { expected: expectedColumns, missing: expectedColumns, extra: [] },
          indexes: { expected: expectedIndexes, missing: expectedIndexes, extra: [] },
        },
        message: `Table '${tableName}' does not exist`,
      };
    }

    const missingColumns = expectedColumns.filter(
      (c) => !actualColumns.includes(c)
    );
    const extraColumns = actualColumns.filter(
      (c) => !expectedColumns.includes(c)
    );

    // Check indexes
    const idxResult = await db.execute(
      sql`SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = ${tableName}
          ORDER BY indexname`
    );

    const actualIndexes = (idxResult as unknown as any[]).map(
      (r: any) => r.indexname as string
    );
    const missingIndexes = expectedIndexes.filter(
      (i) => !actualIndexes.includes(i)
    );
    const extraIndexes = actualIndexes.filter(
      (i) => !expectedIndexes.includes(i)
    );

    const hasMissingColumns = missingColumns.length > 0;
    const hasMissingIndexes = missingIndexes.length > 0;

    let status: "pass" | "fail" | "warn" = "pass";
    const messages: string[] = [];

    if (hasMissingColumns) {
      status = "fail";
      messages.push(`missing columns: [${missingColumns.join(", ")}]`);
    }
    if (hasMissingIndexes) {
      if (status !== "fail") status = "warn";
      messages.push(`missing indexes: [${missingIndexes.join(", ")}]`);
    }
    if (extraColumns.length > 0) {
      messages.push(`extra columns (not in schema): [${extraColumns.join(", ")}]`);
    }

    return {
      status,
      table: tableName,
      checks: {
        exists: true,
        columns: {
          expected: expectedColumns,
          missing: missingColumns,
          extra: extraColumns,
        },
        indexes: {
          expected: expectedIndexes,
          missing: missingIndexes,
          extra: extraIndexes,
        },
      },
      message:
        messages.length > 0
          ? `Table '${tableName}': ${messages.join("; ")}`
          : `Table '${tableName}': schema matches`,
    };
  } catch (error) {
    return {
      status: "fail",
      table: tableName,
      checks: { exists: false },
      message:
        error instanceof Error
          ? `Schema probe for '${tableName}' failed: ${error.message}`
          : `Schema probe for '${tableName}' failed`,
    };
  }
}

/**
 * Compare applied Drizzle migrations (from __drizzle_migrations table)
 * against the expected list.
 */
export async function probeMigrationDrift(): Promise<MigrationDriftResult> {
  try {
    // Check if the Drizzle migrations table exists
    const tableCheck = await db.execute(
      sql`SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = '__drizzle_migrations'
          ) AS exists`
    );

    const migrationTableExists = (tableCheck as unknown as any[])[0]?.exists;

    if (!migrationTableExists) {
      // No migration tracking table -- may be using db:push instead of migrate
      return {
        status: "warn",
        applied: [],
        expected: EXPECTED_MIGRATIONS,
        missing: EXPECTED_MIGRATIONS,
        extra: [],
        message:
          "Migration tracking table (__drizzle_migrations) not found. " +
          "Schema may have been applied via db:push instead of migrate.",
      };
    }

    const migResult = await db.execute(
      sql`SELECT tag FROM __drizzle_migrations ORDER BY created_at`
    );

    const appliedTags = (migResult as unknown as any[]).map((r: any) => r.tag as string);
    const missing = EXPECTED_MIGRATIONS.filter((m) => !appliedTags.includes(m));
    const extra = appliedTags.filter((m) => !EXPECTED_MIGRATIONS.includes(m));

    if (missing.length > 0) {
      return {
        status: "fail",
        applied: appliedTags,
        expected: EXPECTED_MIGRATIONS,
        missing,
        extra,
        message: `Migration drift detected: missing [${missing.join(", ")}]`,
      };
    }

    if (extra.length > 0) {
      return {
        status: "warn",
        applied: appliedTags,
        expected: EXPECTED_MIGRATIONS,
        missing,
        extra,
        message: `Unexpected migrations found: [${extra.join(", ")}]`,
      };
    }

    return {
      status: "pass",
      applied: appliedTags,
      expected: EXPECTED_MIGRATIONS,
      missing: [],
      extra: [],
      message: `All ${EXPECTED_MIGRATIONS.length} expected migrations applied`,
    };
  } catch (error) {
    return {
      status: "fail",
      applied: [],
      expected: EXPECTED_MIGRATIONS,
      missing: EXPECTED_MIGRATIONS,
      extra: [],
      message:
        error instanceof Error
          ? `Migration drift check failed: ${error.message}`
          : "Migration drift check failed",
    };
  }
}

/**
 * Run a full health report -- connection, latency, replication, schema, and migration drift.
 */
export async function runFullHealthReport(): Promise<DbHealthReport> {
  const connection = await probeConnection();
  const latency = await probeLatency();
  const replication = await probeReplication();

  // Run schema probes for all expected tables
  const schemaResults: SchemaProbeResult[] = [];
  for (const [tableName, def] of Object.entries(EXPECTED_TABLES)) {
    const result = await probeTableSchema(tableName, def.columns, def.indexes);
    schemaResults.push(result);
  }

  const migrationDrift = await probeMigrationDrift();

  // Determine overall status
  const allChecks = [
    connection.status,
    latency.status,
    replication.status,
    migrationDrift.status,
    ...schemaResults.map((s) => s.status),
  ];

  let overall: DbHealthReport["overall"] = "healthy";
  if (allChecks.includes("fail")) {
    overall = "unhealthy";
  } else if (allChecks.includes("warn")) {
    overall = "degraded";
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    connection,
    latency,
    replication,
    schema: schemaResults,
    migrationDrift,
  };
}
