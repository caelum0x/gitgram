import { pgTable, text, timestamp, integer, jsonb, vector, index, boolean, uuid, primaryKey } from 'drizzle-orm/pg-core';

// ============================================
// PROJECTS
// ============================================

export const projects = pgTable('projects', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// TIME LAYER: Checkpoints, Trees, Blobs
// ============================================

export const commits = pgTable('commits', {
    id: text('id').primaryKey(), // TimePoint ID
    projectId: text('project_id').references(() => projects.id),
    parentId: text('parent_id'),
    message: text('message'),
    timestamp: timestamp('timestamp').notNull(),
    treeHash: text('tree_hash').notNull(), // Root Merkle Tree Hash
    sessionId: text('session_id'),
    triggerType: text('trigger_type'), // 'manual', 'auto', 'before_action', 'after_action'
    linkedCheckpointId: text('linked_checkpoint_id'), // Links before/after checkpoints
    metadata: jsonb('metadata'), // Trigger info, stats
});

export const trees = pgTable('trees', {
    hash: text('hash').primaryKey(),
    content: jsonb('content').notNull(), // Serialized TreeEntries
});

export const blobs = pgTable('blobs', {
    hash: text('hash').primaryKey(),
    size: integer('size').notNull(),
    language: text('language'),
});

// Files in each checkpoint
export const checkpointFiles = pgTable('checkpoint_files', {
    checkpointId: text('checkpoint_id').references(() => commits.id),
    filePath: text('file_path').notNull(),
    blobHash: text('blob_hash').references(() => blobs.hash),
    size: integer('size'),
    mode: integer('mode'),
    changeType: text('change_type'), // 'added', 'modified', 'deleted', 'unchanged'
}, (table) => ({
    pk: primaryKey({ columns: [table.checkpointId, table.filePath] })
}));

// Pre-computed diffs
export const diffs = pgTable('diffs', {
    id: uuid('id').primaryKey().defaultRandom(),
    fromCheckpointId: text('from_checkpoint_id').references(() => commits.id),
    toCheckpointId: text('to_checkpoint_id').references(() => commits.id),
    filePath: text('file_path'),
    diffContent: text('diff_content'),
    stats: jsonb('stats'), // {added: 10, removed: 5}
    algorithm: text('algorithm').default('histogram'),
});

// ============================================
// CONTEXT LAYER: Messages, Tool Calls, Contexts
// ============================================

// All chat messages
export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: text('project_id').references(() => projects.id),
    sessionId: text('session_id').notNull(),
    checkpointId: text('checkpoint_id').references(() => commits.id),
    timestamp: timestamp('timestamp').defaultNow(),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    thinking: text('thinking'), // AI's internal reasoning
    metadata: jsonb('metadata'),
});

// All tool calls (AI actions)
export const toolCalls = pgTable('tool_calls', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => messages.id),
    checkpointBeforeId: text('checkpoint_before_id').references(() => commits.id),
    checkpointAfterId: text('checkpoint_after_id').references(() => commits.id),
    toolName: text('tool_name').notNull(),
    arguments: jsonb('arguments').notNull(),
    result: jsonb('result'),
    success: boolean('success'),
    error: text('error'),
    timestamp: timestamp('timestamp').defaultNow(),
});

// Mental state snapshots
export const contexts = pgTable('contexts', {
    id: uuid('id').primaryKey().defaultRandom(),
    checkpointId: text('checkpoint_id').references(() => commits.id),
    sessionId: text('session_id'),
    summary: text('summary'),
    activeFiles: jsonb('active_files'), // ["src/api.ts", "src/db.ts"]
    cursorPosition: jsonb('cursor_position'), // {file: "api.ts", line: 42, col: 10}
    currentTask: text('current_task'),
    goals: jsonb('goals'), // ["Implement auth", "Add tests"]
    timestamp: timestamp('timestamp').defaultNow(),
});

// ============================================
// AUGMENTED LAYER: Embeddings
// ============================================

export const embeddings = pgTable('embeddings', {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id),
    checkpointId: text('checkpoint_id').references(() => commits.id),
    entityType: text('entity_type').notNull(), // 'blob' | 'commit' | 'chat'
    entityId: text('entity_id').notNull(),
    filePath: text('file_path'),
    chunkText: text('chunk_text'),
    chunkStartLine: integer('chunk_start_line'),
    chunkEndLine: integer('chunk_end_line'),
    content: text('content').notNull(), // The text chunk
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI ada-002
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    embeddingIndex: index('embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// ============================================
// INDEXES for Performance
// ============================================

export const checkpointsProjectIdx = index('idx_checkpoints_project').on(commits.projectId);
export const checkpointsTimestampIdx = index('idx_checkpoints_timestamp').on(commits.timestamp);
export const checkpointsSessionIdx = index('idx_checkpoints_session').on(commits.sessionId);
export const messagesProjectIdx = index('idx_messages_project').on(messages.projectId);
export const messagesSessionIdx = index('idx_messages_session').on(messages.sessionId);
export const toolCallsMessageIdx = index('idx_tool_calls_message').on(toolCalls.messageId);
export const diffsFromIdx = index('idx_diffs_from').on(diffs.fromCheckpointId);
export const diffsToIdx = index('idx_diffs_to').on(diffs.toCheckpointId);
