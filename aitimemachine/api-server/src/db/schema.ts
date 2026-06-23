import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  boolean,
  uuid,
  numeric,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// ============================================
// USERS & AUTH
// ============================================

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull(),
  name: text("name"),
  plan: text("plan").default("free"), // free, pro, team
  polarCustomerId: text("polar_customer_id"), // Polar.sh customer ID
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0), // Total storage used by user in bytes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  keyHash: text("key_hash").notNull(), // SHA-256 of the API key
  keyPrefix: text("key_prefix").notNull(), // First 12 chars for display
  name: text("name").default("Default"),
  scopes: text("scopes").array().default(["read", "write"]), // Available: read, write, admin
  expiresAt: timestamp("expires_at"), // Optional expiration timestamp
  allowedIps: text("allowed_ips").array(), // Optional IP whitelist
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

// ============================================
// SESSIONS (User session management)
// ============================================

export interface DeviceInfo {
  browser?: string;
  os?: string;
  device?: string;
  isMobile?: boolean;
}

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(), // SHA-256 of session token
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceInfo: jsonb("device_info").$type<DeviceInfo>(),
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revoked: boolean("revoked").default(false),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_auth_sessions_user").on(table.userId),
    tokenHashIdx: index("idx_auth_sessions_token_hash").on(table.tokenHash),
    expiresAtIdx: index("idx_auth_sessions_expires").on(table.expiresAt),
    revokedIdx: index("idx_auth_sessions_revoked").on(table.revoked),
  })
);

// ============================================
// SUBSCRIPTIONS (Polar.sh)
// ============================================

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // Polar subscription ID
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    polarCustomerId: text("polar_customer_id").notNull(),
    polarProductId: text("polar_product_id").notNull(),
    status: text("status").notNull(), // active, canceled, past_due, unpaid, incomplete
    plan: text("plan").notNull(), // pro, team
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_subscriptions_user").on(table.userId),
    statusIdx: index("idx_subscriptions_status").on(table.status),
    polarCustomerIdx: index("idx_subscriptions_polar_customer").on(
      table.polarCustomerId
    ),
  })
);

// ============================================
// ORGANIZATIONS
// ============================================

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerId: text("owner_id")
      .references(() => users.id)
      .notNull(),
    plan: text("plan").default("team"), // team, enterprise
    metadata: jsonb("metadata"), // SSO config and other org-level settings
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    slugIdx: index("idx_organizations_slug").on(table.slug),
    ownerIdx: index("idx_organizations_owner").on(table.ownerId),
  })
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"), // owner, admin, member
    invitedBy: text("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => ({
    orgIdx: index("idx_org_members_org").on(table.orgId),
    userIdx: index("idx_org_members_user").on(table.userId),
    orgUserIdx: index("idx_org_members_org_user").on(table.orgId, table.userId),
  })
);

export const orgInvitations = pgTable(
  "org_invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // admin, member
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    invitedBy: text("invited_by")
      .references(() => users.id)
      .notNull(),
  },
  (table) => ({
    orgIdx: index("idx_org_invitations_org").on(table.orgId),
    emailIdx: index("idx_org_invitations_email").on(table.email),
    tokenIdx: index("idx_org_invitations_token").on(table.token),
  })
);

// ============================================
// PROJECTS
// ============================================

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    orgId: text("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }), // Nullable - personal or org project
    name: text("name").notNull(),
    rootPath: text("root_path"), // Local path on user's machine
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    lastSyncedAt: timestamp("last_synced_at"),
  },
  (table) => ({
    userIdx: index("idx_projects_user").on(table.userId),
    orgIdx: index("idx_projects_org").on(table.orgId),
  })
);

// ============================================
// CHECKPOINTS (TimePoints)
// ============================================

export const checkpoints = pgTable(
  "checkpoints",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    orgId: text("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }), // Nullable - inherits from project
    parentId: text("parent_id"),
    name: text("name").notNull(),
    description: text("description"),
    scope: text("scope").default("files"), // files, files+chat, files+chat+terminal
    manifestHash: text("manifest_hash").notNull(), // Hash of the manifest blob
    rootTreeHash: text("root_tree_hash"), // Hash of the root tree object (Git-like tree hierarchy)
    triggerType: text("trigger_type"), // manual, auto, before_action, after_action
    linkedCheckpointId: text("linked_checkpoint_id"),
    embeddingJson: jsonb("embedding_json"), // Semantic embedding vector for similarity search
    embeddingModel: text("embedding_model"), // Provider that generated the embedding
    createdAt: timestamp("created_at").defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    projectIdx: index("idx_checkpoints_project").on(table.projectId),
    userIdx: index("idx_checkpoints_user").on(table.userId),
    orgIdx: index("idx_checkpoints_org").on(table.orgId),
    createdAtIdx: index("idx_checkpoints_created").on(table.createdAt),
  })
);

// ============================================
// CANONICAL CHECKPOINT FILES + DIFFS
// ============================================

export const checkpointFiles = pgTable(
  "checkpoint_files",
  {
    checkpointId: text("checkpoint_id")
      .references(() => checkpoints.id, { onDelete: "cascade" })
      .notNull(),
    filePath: text("file_path").notNull(),
    blobHash: text("blob_hash"),
    size: bigint("size", { mode: "number" }),
    mode: integer("mode"),
    mtimeMs: bigint("mtime_ms", { mode: "number" }),
    changeType: text("change_type").notNull().default("unchanged"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.checkpointId, table.filePath] }),
    pathIdx: index("idx_checkpoint_files_path").on(table.filePath),
  })
);

export const diffs = pgTable(
  "diffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCheckpointId: text("from_checkpoint_id")
      .references(() => checkpoints.id, { onDelete: "cascade" })
      .notNull(),
    toCheckpointId: text("to_checkpoint_id")
      .references(() => checkpoints.id, { onDelete: "cascade" })
      .notNull(),
    filePath: text("file_path").notNull(),
    diffContent: text("diff_content").notNull(),
    stats: jsonb("stats").default({}),
    algorithm: text("algorithm").default("histogram"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    fromToIdx: index("idx_diffs_from_to").on(
      table.fromCheckpointId,
      table.toCheckpointId
    ),
  })
);

export const restoreEvents = pgTable(
  "restore_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fromCheckpointId: text("from_checkpoint_id").references(() => checkpoints.id, {
      onDelete: "set null",
    }),
    toCheckpointId: text("to_checkpoint_id").references(() => checkpoints.id, {
      onDelete: "set null",
    }),
    scopeType: text("scope_type").notNull(), // file | folder | project
    scopePath: text("scope_path"),
    status: text("status").notNull(), // requested | applied | failed
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index("idx_restore_events_project_created").on(
      table.projectId,
      table.createdAt
    ),
  })
);

// ============================================
// BLOBS (Content-addressable storage)
// ============================================

export const blobs = pgTable("blobs", {
  hash: text("hash").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type"),
  content: text("content"), // Base64 encoded for small files, or S3 URL for large
  storageType: text("storage_type").default("inline"), // inline, s3
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// TREES (Git-like directory tree objects)
// ============================================

export interface TreeEntryJson {
  name: string;
  type: "blob" | "tree";
  hash: string;
  mode: number;
  size: number;
}

export const trees = pgTable(
  "trees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    hash: text("hash").notNull(), // Content-addressed hash of this tree
    parentPath: text("parent_path").notNull(), // Directory path this tree represents, e.g. "/" or "src/"
    entries: jsonb("entries").$type<TreeEntryJson[]>().notNull(), // Array of tree entries
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    projectHashIdx: index("idx_trees_project_hash").on(
      table.projectId,
      table.hash
    ),
    hashIdx: index("idx_trees_hash").on(table.hash),
    parentPathIdx: index("idx_trees_parent_path").on(
      table.projectId,
      table.parentPath
    ),
  })
);

// ============================================
// CHAT SESSIONS & MESSAGES
// ============================================

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    tool: text("tool").notNull(), // claude-cli, cursor, vscode, etc.
    startedAt: timestamp("started_at").defaultNow(),
    endedAt: timestamp("ended_at"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    projectIdx: index("idx_sessions_project").on(table.projectId),
    userIdx: index("idx_sessions_user").on(table.userId),
  })
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .references(() => chatSessions.id)
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    checkpointId: text("checkpoint_id").references(() => checkpoints.id),
    role: text("role").notNull(), // user, assistant, system
    content: text("content").notNull(),
    contentHash: text("content_hash"), // For long messages stored as blobs
    isContextInjection: boolean("is_context_injection").default(false),
    timestamp: timestamp("timestamp").defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    sessionIdx: index("idx_messages_session").on(table.sessionId),
    projectIdx: index("idx_messages_project").on(table.projectId),
    timestampIdx: index("idx_messages_timestamp").on(table.timestamp),
  })
);

// ============================================
// TOOL CALLS (AI Actions)
// ============================================

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").references(() => chatMessages.id),
    sessionId: text("session_id")
      .references(() => chatSessions.id)
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    checkpointBeforeId: text("checkpoint_before_id").references(
      () => checkpoints.id
    ),
    checkpointAfterId: text("checkpoint_after_id").references(
      () => checkpoints.id
    ),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments"),
    result: jsonb("result"),
    success: boolean("success"),
    error: text("error"),
    timestamp: timestamp("timestamp").defaultNow(),
  },
  (table) => ({
    sessionIdx: index("idx_toolcalls_session").on(table.sessionId),
    projectIdx: index("idx_toolcalls_project").on(table.projectId),
  })
);

// ============================================
// TERMINAL EVENTS
// ============================================

export const terminalEvents = pgTable(
  "terminal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").references(() => chatSessions.id),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    eventType: text("event_type").notNull(), // command, output, exit
    command: text("command"),
    exitCode: integer("exit_code"),
    stdoutHash: text("stdout_hash"), // Blob hash
    stderrHash: text("stderr_hash"), // Blob hash
    stderrPreview: text("stderr_preview"), // First 2000 chars
    cwd: text("cwd"),
    durationMs: integer("duration_ms"),
    timestamp: timestamp("timestamp").defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_terminal_project").on(table.projectId),
    sessionIdx: index("idx_terminal_session").on(table.sessionId),
  })
);

// ============================================
// EVENTS (Generic event log)
// ============================================

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    timestamp: timestamp("timestamp").defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_events_project").on(table.projectId),
    typeIdx: index("idx_events_type").on(table.eventType),
    timestampIdx: index("idx_events_timestamp").on(table.timestamp),
  })
);

// ============================================
// WEBHOOKS
// ============================================

export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(), // HMAC secret for signature verification
    events: jsonb("events").notNull().$type<string[]>(), // Array of event types to subscribe to
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    lastTriggeredAt: timestamp("last_triggered_at"),
    failureCount: integer("failure_count").default(0),
  },
  (table) => ({
    userIdx: index("idx_webhooks_user").on(table.userId),
    activeIdx: index("idx_webhooks_active").on(table.isActive),
  })
);

// ============================================
// REPOSITORIES (For code indexing)
// ============================================

export const repositories = pgTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull(),
    lastIndexedAt: timestamp("last_indexed_at"),
    indexStatus: text("index_status").default("pending"), // pending, indexing, completed, failed
    fileCount: integer("file_count").default(0),
    symbolCount: integer("symbol_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    projectIdx: index("idx_repositories_project").on(table.projectId),
    userIdx: index("idx_repositories_user").on(table.userId),
  })
);

// ============================================
// CODE EMBEDDINGS (For semantic search)
// ============================================

export const codeEmbeddings = pgTable(
  "code_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: text("repository_id")
      .references(() => repositories.id)
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    filePath: text("file_path").notNull(),
    symbol: text("symbol"),
    symbolType: text("symbol_type"), // function, class, method, variable, interface, type
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(), // For deduplication
    // Note: vector column requires pgvector extension
    // embedding: vector("embedding", { dimensions: 1536 }),
    embeddingJson: jsonb("embedding_json"), // Fallback: store as JSON array
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    language: text("language"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    repoIdx: index("idx_embeddings_repo").on(table.repositoryId),
    projectIdx: index("idx_embeddings_project").on(table.projectId),
    filePathIdx: index("idx_embeddings_filepath").on(table.filePath),
    symbolIdx: index("idx_embeddings_symbol").on(table.symbol),
    contentHashIdx: index("idx_embeddings_content_hash").on(table.contentHash),
  })
);

// ============================================
// RESEARCH JOBS (For async research tasks)
// ============================================

export const researchJobs = pgTable(
  "research_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    projectId: text("project_id").references(() => projects.id),
    query: text("query").notNull(),
    status: text("status").default("pending"), // pending, running, completed, failed
    priority: integer("priority").default(0),
    result: jsonb("result"), // Structured research result
    sources: jsonb("sources"), // Array of sources used
    summary: text("summary"), // Brief summary of findings
    error: text("error"), // Error message if failed
    progress: integer("progress").default(0), // 0-100 progress percentage
    createdAt: timestamp("created_at").defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    userIdx: index("idx_research_user").on(table.userId),
    projectIdx: index("idx_research_project").on(table.projectId),
    statusIdx: index("idx_research_status").on(table.status),
    createdAtIdx: index("idx_research_created").on(table.createdAt),
  })
);

// ============================================
// INDEXED FILES (Track indexed files for incremental updates)
// ============================================

export const indexedFiles = pgTable(
  "indexed_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: text("repository_id")
      .references(() => repositories.id)
      .notNull(),
    filePath: text("file_path").notNull(),
    fileHash: text("file_hash").notNull(), // Content hash for change detection
    lastIndexedAt: timestamp("last_indexed_at").defaultNow(),
    symbolCount: integer("symbol_count").default(0),
    lineCount: integer("line_count").default(0),
    language: text("language"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    repoIdx: index("idx_indexed_files_repo").on(table.repositoryId),
    filePathIdx: index("idx_indexed_files_path").on(table.filePath),
    hashIdx: index("idx_indexed_files_hash").on(table.fileHash),
  })
);

// ============================================
// KNOWLEDGE BASE FILES (Persistent file content)
// ============================================

export const knowledgeBaseFiles = pgTable(
  "knowledge_base_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: text("repository_id")
      .references(() => repositories.id)
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    filePath: text("file_path").notNull(),
    content: text("content"),
    contentHash: text("content_hash").notNull(),
    size: integer("size").default(0),
    language: text("language"),
    source: text("source").default("local"), // local, git
    storage: text("storage").default("db"), // db, s3
    s3: jsonb("s3"),
    embeddingJson: jsonb("embedding_json").$type<number[]>(),
    embeddingModel: text("embedding_model"),
    indexedAt: timestamp("indexed_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    repoIdx: index("idx_kb_files_repo").on(table.repositoryId),
    userIdx: index("idx_kb_files_user").on(table.userId),
    filePathIdx: index("idx_kb_files_path").on(table.filePath),
    contentHashIdx: index("idx_kb_files_hash").on(table.contentHash),
  })
);

// ============================================
// KNOWLEDGE BASE ARTIFACTS (Exports/Pipelines)
// ============================================

export const knowledgeBaseArtifacts = pgTable(
  "knowledge_base_artifacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    projectId: text("project_id").references(() => projects.id),
    jobId: text("job_id"),
    type: text("type").notNull(), // export, pipeline
    format: text("format").notNull(),
    storage: text("storage").default("db"), // db, s3
    content: jsonb("content"),
    contentHash: text("content_hash"),
    size: integer("size").default(0),
    stats: jsonb("stats"),
    s3: jsonb("s3"),
    embeddingJson: jsonb("embedding_json").$type<number[]>(),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_kb_artifacts_user").on(table.userId),
    typeIdx: index("idx_kb_artifacts_type").on(table.type),
    jobIdx: index("idx_kb_artifacts_job").on(table.jobId),
  })
);

// ============================================
// AUDIT LOGS
// ============================================

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    action: text("action").notNull(), // key.created, key.revoked, checkpoint.created, etc.
    resourceType: text("resource_type"), // api_key, checkpoint, webhook, settings, etc.
    resourceId: text("resource_id"), // ID of the affected resource
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"), // Additional context (old values, new values, etc.)
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_audit_logs_user").on(table.userId),
    actionIdx: index("idx_audit_logs_action").on(table.action),
    resourceTypeIdx: index("idx_audit_logs_resource_type").on(table.resourceType),
    createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
  })
);

// ============================================
// GOVERNANCE
// ============================================

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    consentType: text("consent_type").notNull(), // operational_capture | training_export
    granted: boolean("granted").notNull(),
    effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
    effectiveTo: timestamp("effective_to"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    scopeIdx: index("idx_consents_scope").on(
      table.organizationId,
      table.projectId,
      table.consentType,
      table.effectiveFrom
    ),
  })
);

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    dataClass: text("data_class").notNull(), // checkpoints | messages | tool_calls | social_media | exports | audit_logs
    retentionDays: integer("retention_days").notNull(),
    hardDelete: boolean("hard_delete").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    scopeIdx: index("idx_retention_scope").on(
      table.organizationId,
      table.projectId,
      table.dataClass
    ),
  })
);

// ============================================
// GITGRAM SOCIAL LAYER (CANONICAL V1)
// ============================================

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.userId] }),
  })
);

export const projectRepositories = pgTable(
  "project_repositories",
  {
    projectId: text("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    repositoryId: text("repository_id")
      .references(() => repositories.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.repositoryId] }),
    repoIdx: index("idx_project_repo_repo").on(table.repositoryId),
  })
);

export const repoProfiles = pgTable("repo_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: text("repository_id")
    .references(() => repositories.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  headline: text("headline"),
  bio: text("bio"),
  heroMediaUrl: text("hero_media_url"),
  visibility: text("visibility").notNull().default("public"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: text("author_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    repositoryId: text("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    caption: text("caption"),
    codeSnippet: text("code_snippet"),
    language: text("language"),
    linkedCheckpointId: text("linked_checkpoint_id").references(() => checkpoints.id, {
      onDelete: "set null",
    }),
    visibility: text("visibility").notNull().default("public"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    repoCreatedIdx: index("idx_posts_repo_created").on(table.repositoryId, table.createdAt),
    authorCreatedIdx: index("idx_posts_author_created").on(
      table.authorUserId,
      table.createdAt
    ),
  })
);

export const postAssets = pgTable("post_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  mediaType: text("media_type").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: text("author_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    postCreatedIdx: index("idx_comments_post_created").on(table.postId, table.createdAt),
  })
);

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    targetIdx: index("idx_reactions_target").on(table.targetType, table.targetId),
  })
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerUserId: text("follower_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetType: text("target_type").notNull(),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    targetRepositoryId: text("target_repository_id").references(() => repositories.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    targetUserIdx: index("idx_follows_target_user").on(table.targetUserId),
    targetRepoIdx: index("idx_follows_target_repo").on(table.targetRepositoryId),
  })
);

export const trendScores = pgTable(
  "trend_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: text("repository_id")
      .references(() => repositories.id, { onDelete: "cascade" })
      .notNull(),
    windowStart: timestamp("window_start").notNull(),
    windowEnd: timestamp("window_end").notNull(),
    score: numeric("score", { precision: 12, scale: 4 }).notNull(),
    signals: jsonb("signals").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    repoWindowIdx: index("idx_trend_scores_repo_window").on(
      table.repositoryId,
      table.windowEnd
    ),
  })
);

// ============================================
// SAVED CONTEXTS (Conversation context snapshots)
// ============================================

/**
 * Source of a saved context in the unified memory layer.
 * - conversation: a conversation/context snapshot (default, the original use)
 * - task: ingested from a Beads DAG task
 * - library: ingested from a Context7 library documentation fetch
 * - checkpoint: derived from a checkpoint
 */
export const SAVED_CONTEXT_SOURCES = [
  "conversation",
  "task",
  "library",
  "checkpoint",
] as const;

export type SavedContextSource = (typeof SAVED_CONTEXT_SOURCES)[number];

export const savedContexts = pgTable(
  "saved_contexts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    projectId: text("project_id")
      .references(() => projects.id)
      .notNull(),
    checkpointId: text("checkpoint_id").references(() => checkpoints.id),
    name: text("name").notNull(),
    description: text("description"),
    // Context data
    messages: jsonb("messages").$type<Array<{
      role: "user" | "assistant" | "system";
      content: string;
      timestamp: string;
    }>>(),
    systemPrompt: text("system_prompt"),
    toolState: jsonb("tool_state"), // State of any MCP tools
    // File context at time of save
    openFiles: text("open_files").array(),
    workingDirectory: text("working_directory"),
    gitBranch: text("git_branch"),
    gitCommit: text("git_commit"),
    // Semantic search embeddings
    embeddingJson: jsonb("embedding_json").$type<number[]>(), // Embedding vector for semantic search
    embeddingModel: text("embedding_model"), // Model used to generate embedding (openai-small, voyage, local)
    // Metadata
    tool: text("tool").default("claude-code"), // claude-code, cursor, aider, etc.
    // Source of this context in the unified memory layer.
    // Allowed values: conversation | task | library | checkpoint (see SavedContextSource).
    source: text("source")
      .$type<SavedContextSource>()
      .default("conversation"),
    isAutoSaved: boolean("is_auto_saved").default(false),
    tags: text("tags").array(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    expiresAt: timestamp("expires_at"), // Optional TTL for auto-cleanup
    metadata: jsonb("metadata"),
  },
  (table) => ({
    userIdx: index("idx_saved_contexts_user").on(table.userId),
    projectIdx: index("idx_saved_contexts_project").on(table.projectId),
    checkpointIdx: index("idx_saved_contexts_checkpoint").on(table.checkpointId),
    toolIdx: index("idx_saved_contexts_tool").on(table.tool),
    sourceIdx: index("idx_saved_contexts_source").on(table.source),
    createdAtIdx: index("idx_saved_contexts_created").on(table.createdAt),
    autoSavedIdx: index("idx_saved_contexts_auto_saved").on(table.isAutoSaved),
  })
);

// ============================================
// WEBHOOK DELIVERIES (Reliable delivery queue)
// ============================================

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .references(() => webhooks.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(), // checkpoint.created, checkpoint.restored, sync.completed, sync.failed
    payload: jsonb("payload").notNull(), // Full webhook payload
    status: text("status").default("pending"), // pending, success, failed
    attempts: integer("attempts").default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
    nextRetryAt: timestamp("next_retry_at"),
    responseStatus: integer("response_status"), // HTTP status code from target
    responseBody: text("response_body"), // Response body (truncated if large)
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    webhookIdx: index("idx_deliveries_webhook").on(table.webhookId),
    statusIdx: index("idx_deliveries_status").on(table.status),
    nextRetryIdx: index("idx_deliveries_next_retry").on(table.nextRetryAt),
    createdAtIdx: index("idx_deliveries_created").on(table.createdAt),
  })
);

// ============================================
// RESEARCH PAPERS (arXiv paper indexing)
// ============================================

export interface ResearchPaperAuthor {
  name: string;
  affiliation?: string;
}

export interface ResearchPaperMetadata {
  pdfUrl?: string;
  primaryCategory?: string;
  categories?: string[];
  journalRef?: string;
  doi?: string;
  comments?: string;
}

export const researchPapers = pgTable(
  "research_papers",
  {
    id: text("id").primaryKey(), // paper_xxxx format
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    projectId: text("project_id").references(() => projects.id), // Optional project association
    arxivId: text("arxiv_id").notNull(), // e.g., "2301.00001" or "2301.00001v2"
    title: text("title").notNull(),
    authors: jsonb("authors").$type<ResearchPaperAuthor[]>().notNull(),
    abstract: text("abstract").notNull(),
    content: text("content"), // Full paper text content for search
    publishedDate: timestamp("published_date"),
    updatedDate: timestamp("updated_date"),
    indexStatus: text("index_status").default("pending"), // pending, indexing, completed, failed
    indexError: text("index_error"),
    contentHash: text("content_hash"), // For deduplication
    wordCount: integer("word_count").default(0),
    metadata: jsonb("metadata").$type<ResearchPaperMetadata>(),
    tags: text("tags").array(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_research_papers_user").on(table.userId),
    projectIdx: index("idx_research_papers_project").on(table.projectId),
    arxivIdx: index("idx_research_papers_arxiv").on(table.arxivId),
    statusIdx: index("idx_research_papers_status").on(table.indexStatus),
    publishedIdx: index("idx_research_papers_published").on(table.publishedDate),
    createdAtIdx: index("idx_research_papers_created").on(table.createdAt),
  })
);

// ============================================
// DOMAIN VERIFICATIONS (SSO domain ownership)
// ============================================

export const domainVerifications = pgTable(
  "domain_verifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    domain: text("domain").notNull(),
    verificationToken: text("verification_token").notNull(),
    verified: boolean("verified").default(false),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    orgIdx: index("idx_domain_verifications_org").on(table.orgId),
    domainIdx: index("idx_domain_verifications_domain").on(table.domain),
    orgDomainIdx: index("idx_domain_verifications_org_domain").on(table.orgId, table.domain),
  })
);

// ============================================
// JOBS (Async job tracking for exports, reindexing, pipelines)
// ============================================

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    type: text("type").notNull(), // export, reindex, pipeline
    status: text("status").default("pending"), // pending, running, completed, failed
    params: jsonb("params"), // Job-specific configuration
    result: jsonb("result"), // Job output/result data
    error: text("error"),
    progress: integer("progress").default(0), // 0-100
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userIdx: index("idx_jobs_user").on(table.userId),
    typeIdx: index("idx_jobs_type").on(table.type),
    statusIdx: index("idx_jobs_status").on(table.status),
    createdAtIdx: index("idx_jobs_created").on(table.createdAt),
  })
);

// ============================================
// TEAMS (Sub-groups within organizations)
// ============================================

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    inviteCode: text("invite_code").notNull().unique(), // Random code for invite links
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    orgIdx: index("idx_teams_org").on(table.orgId),
    slugIdx: index("idx_teams_org_slug").on(table.orgId, table.slug),
    inviteCodeIdx: index("idx_teams_invite_code").on(table.inviteCode),
  })
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull().default("member"), // admin, member, viewer
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => ({
    teamIdx: index("idx_team_members_team").on(table.teamId),
    userIdx: index("idx_team_members_user").on(table.userId),
    teamUserIdx: index("idx_team_members_team_user").on(table.teamId, table.userId),
  })
);

// ============================================
// SHARED SESSIONS (Persistent share links)
// ============================================

export const sharedSessions = pgTable(
  "shared_sessions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .references(() => chatSessions.id, { onDelete: "cascade" })
      .notNull(),
    shareId: text("share_id").notNull().unique(), // Public-facing random UUID token
    visibility: text("visibility").notNull().default("public"), // public, private, team
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at"), // Null = no expiry
    createdBy: text("created_by")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    sessionIdx: index("idx_shared_sessions_session").on(table.sessionId),
    shareIdIdx: index("idx_shared_sessions_share_id").on(table.shareId),
    createdByIdx: index("idx_shared_sessions_created_by").on(table.createdBy),
    expiresAtIdx: index("idx_shared_sessions_expires").on(table.expiresAt),
  })
);

// ============================================
// BACKUP JOBS (S3 backup tracking)
// ============================================

export const backupJobs = pgTable(
  "backup_jobs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .references(() => chatSessions.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    key: text("key").notNull(), // S3 object key
    size: bigint("size", { mode: "number" }).notNull().default(0), // Bytes
    status: text("status").notNull().default("pending"), // pending, uploaded, failed
    error: text("error"),
    uploadedAt: timestamp("uploaded_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    sessionIdx: index("idx_backup_jobs_session").on(table.sessionId),
    userIdx: index("idx_backup_jobs_user").on(table.userId),
    statusIdx: index("idx_backup_jobs_status").on(table.status),
    createdAtIdx: index("idx_backup_jobs_created").on(table.createdAt),
  })
);

// ============================================
// EMAIL JOBS (Async email delivery queue)
// ============================================

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: text("id").primaryKey(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    htmlBody: text("html_body").notNull(),
    textBody: text("text_body"),
    fromAddress: text("from_address"),
    priority: integer("priority").notNull().default(0), // Higher = more urgent
    status: text("status").notNull().default("pending"), // pending, sent, failed, cancelled
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at"),
    sentAt: timestamp("sent_at"),
    error: text("error"),
    externalId: text("external_id"), // Provider-returned message ID (e.g. Resend ID)
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_email_jobs_status").on(table.status),
    nextAttemptIdx: index("idx_email_jobs_next_attempt").on(table.nextAttemptAt),
    priorityIdx: index("idx_email_jobs_priority").on(table.priority),
    createdAtIdx: index("idx_email_jobs_created").on(table.createdAt),
  })
);
