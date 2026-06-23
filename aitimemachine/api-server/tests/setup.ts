/**
 * Test Setup
 *
 * Mocks all external dependencies (database, services, logging) so that
 * integration tests can exercise the full Express request/response cycle
 * without requiring a real Postgres/Neon connection, Redis, or any other
 * external service.
 */
import { vi, beforeAll } from "vitest";
import crypto from "crypto";
import http from "http";
import net from "net";

// ============================================================================
// Prevent the server from actually listening on a port
// ============================================================================

// Set a test port environment variable to avoid conflicts
process.env.PORT = "0"; // 0 = random port; but we also mock .listen below
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
if (!process.env.AITM_TEST_NO_LISTEN) {
  process.env.AITM_TEST_NO_LISTEN = "1";
}

const disableListen = process.env.AITM_TEST_NO_LISTEN === "1";

// Store original .listen so supertest can use it to create real test servers.
const originalHttpListen = http.Server.prototype.listen;
const originalNetListen = net.Server.prototype.listen;

// Track whether we are currently inside the app module import phase.
// During import, listen calls from src/index.ts are intercepted.
// After import, listen calls from supertest are allowed through.
let interceptingListen = false;

if (disableListen) {
  const mockListen = function (this: any, ...args: any[]) {
    if (!interceptingListen) {
      // Not in import phase — let supertest's listen through
      return originalHttpListen.apply(this, args as any);
    }
    const last = args[args.length - 1];
    const cb = typeof last === "function" ? last : undefined;
    const address = { port: 0, address: "127.0.0.1", family: "IPv4" };
    (this as any).address = () => address;
    process.nextTick(() => {
      this.emit("listening");
      if (cb) cb();
    });
    return this;
  };

  // Avoid binding to actual sockets during app import.
  (http.Server.prototype as any).listen = mockListen;
  (net.Server.prototype as any).listen = mockListen;
}

// ============================================================================
// In-memory data stores
// ============================================================================

export interface MockUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  polarCustomerId: string | null;
  storageUsedBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockApiKey {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  allowedIps: string[] | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface MockProject {
  id: string;
  userId: string;
  orgId: string | null;
  name: string;
  rootPath: string;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date | null;
}

export interface MockSavedContext {
  id: string;
  userId: string;
  projectId: string;
  checkpointId: string | null;
  name: string;
  description: string | null;
  messages: Array<{ role: string; content: string; timestamp: string }> | null;
  systemPrompt: string | null;
  toolState: any;
  openFiles: string[] | null;
  workingDirectory: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  embeddingJson: number[] | null;
  embeddingModel: string | null;
  tool: string;
  isAutoSaved: boolean;
  tags: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata: any;
}

// In-memory stores
export const mockUsers: MockUser[] = [];
export const mockApiKeys: MockApiKey[] = [];
export const mockProjects: MockProject[] = [];
export const mockSavedContexts: MockSavedContext[] = [];
export const mockSubscriptions: any[] = [];
export const mockCheckpoints: any[] = [];
export const mockCodeEmbeddings: any[] = [];
export const mockChatMessages: any[] = [];
export const mockRepositories: any[] = [];
export const mockOrganizations: any[] = [];
export const mockOrgMembers: any[] = [];
export const mockDomainVerifications: any[] = [];
export const mockJobs: any[] = [];
export const mockResearchPapers: any[] = [];
export const mockOracleSessions: any[] = [];
export const mockOrgInvitations: any[] = [];
export const mockEvents: any[] = [];
export const mockIndexedFiles: any[] = [];
export const mockAuditLogs: any[] = [];
export const mockWebhooks: any[] = [];
export const mockWebhookDeliveries: any[] = [];
export const mockBlobs: any[] = [];
export const mockChatSessions: any[] = [];
export const mockToolCalls: any[] = [];
export const mockSessions: any[] = [];
export const mockTerminalEvents: any[] = [];
export const mockKnowledgeBaseFiles: any[] = [];
export const mockKnowledgeBaseArtifacts: any[] = [];
export const mockCheckpointFiles: any[] = [];
export const mockDiffs: any[] = [];
export const mockConsents: any[] = [];
export const mockRetentionPolicies: any[] = [];
export const mockProjectRepositories: any[] = [];
export const mockRepoProfiles: any[] = [];
export const mockPosts: any[] = [];
export const mockPostAssets: any[] = [];
export const mockComments: any[] = [];
export const mockReactions: any[] = [];
export const mockFollows: any[] = [];
export const mockTrendScores: any[] = [];
export const mockRestoreEvents: any[] = [];
export const mockTrees: any[] = [];

export function resetStores() {
  mockUsers.length = 0;
  mockApiKeys.length = 0;
  mockProjects.length = 0;
  mockSavedContexts.length = 0;
  mockSubscriptions.length = 0;
  mockCheckpoints.length = 0;
  mockCodeEmbeddings.length = 0;
  mockChatMessages.length = 0;
  mockRepositories.length = 0;
  mockOrganizations.length = 0;
  mockOrgMembers.length = 0;
  mockDomainVerifications.length = 0;
  mockJobs.length = 0;
  mockResearchPapers.length = 0;
  mockOracleSessions.length = 0;
  mockOrgInvitations.length = 0;
  mockEvents.length = 0;
  mockIndexedFiles.length = 0;
  mockAuditLogs.length = 0;
  mockWebhooks.length = 0;
  mockWebhookDeliveries.length = 0;
  mockBlobs.length = 0;
  mockChatSessions.length = 0;
  mockToolCalls.length = 0;
  mockSessions.length = 0;
  mockTerminalEvents.length = 0;
  mockKnowledgeBaseFiles.length = 0;
  mockKnowledgeBaseArtifacts.length = 0;
  mockCheckpointFiles.length = 0;
  mockDiffs.length = 0;
  mockConsents.length = 0;
  mockRetentionPolicies.length = 0;
  mockProjectRepositories.length = 0;
  mockRepoProfiles.length = 0;
  mockPosts.length = 0;
  mockPostAssets.length = 0;
  mockComments.length = 0;
  mockReactions.length = 0;
  mockFollows.length = 0;
  mockTrendScores.length = 0;
  mockRestoreEvents.length = 0;
  mockTrees.length = 0;
}

// ============================================================================
// Test data constants
// ============================================================================

export const TEST_API_KEY = "aitm_testkey123456789abcdef";
export const EXPIRED_API_KEY = "aitm_expiredkey123456789abc";
export const TEST_API_KEY_2 = "aitm_testkey2_abcdef123456";

// ============================================================================
// Schema field stubs (used by the mock eq/and/etc. operators)
// ============================================================================

const fieldProxy = (tableName: string) =>
  new Proxy({} as any, {
    get: (_target, prop) => {
      if (typeof prop === "string") {
        return { __table: tableName, __field: prop };
      }
      return undefined;
    },
  });

const mockSchema: any = {
  users: fieldProxy("users"),
  apiKeys: fieldProxy("apiKeys"),
  projects: fieldProxy("projects"),
  checkpoints: fieldProxy("checkpoints"),
  savedContexts: fieldProxy("savedContexts"),
  subscriptions: fieldProxy("subscriptions"),
  codeEmbeddings: fieldProxy("codeEmbeddings"),
  chatMessages: fieldProxy("chatMessages"),
  repositories: fieldProxy("repositories"),
  organizations: fieldProxy("organizations"),
  orgMembers: fieldProxy("orgMembers"),
  domainVerifications: fieldProxy("domainVerifications"),
  jobs: fieldProxy("jobs"),
  researchPapers: fieldProxy("researchPapers"),
  researchJobs: fieldProxy("researchJobs"),
  orgInvitations: fieldProxy("orgInvitations"),
  events: fieldProxy("events"),
  indexedFiles: fieldProxy("indexedFiles"),
  auditLogs: fieldProxy("auditLogs"),
  webhooks: fieldProxy("webhooks"),
  webhookDeliveries: fieldProxy("webhookDeliveries"),
  blobs: fieldProxy("blobs"),
  chatSessions: fieldProxy("chatSessions"),
  toolCalls: fieldProxy("toolCalls"),
  sessions: fieldProxy("sessions"),
  terminalEvents: fieldProxy("terminalEvents"),
  knowledgeBaseFiles: fieldProxy("knowledgeBaseFiles"),
  knowledgeBaseArtifacts: fieldProxy("knowledgeBaseArtifacts"),
  checkpointFiles: fieldProxy("checkpointFiles"),
  diffs: fieldProxy("diffs"),
  consents: fieldProxy("consents"),
  retentionPolicies: fieldProxy("retentionPolicies"),
  projectRepositories: fieldProxy("projectRepositories"),
  repoProfiles: fieldProxy("repoProfiles"),
  posts: fieldProxy("posts"),
  postAssets: fieldProxy("postAssets"),
  comments: fieldProxy("comments"),
  reactions: fieldProxy("reactions"),
  follows: fieldProxy("follows"),
  trendScores: fieldProxy("trendScores"),
  restoreEvents: fieldProxy("restoreEvents"),
  trees: fieldProxy("trees"),
};

// Map table names to stores
function getStore(tableName: string): any[] {
  switch (tableName) {
    case "users": return mockUsers;
    case "apiKeys": return mockApiKeys;
    case "projects": return mockProjects;
    case "checkpoints": return mockCheckpoints;
    case "savedContexts": return mockSavedContexts;
    case "subscriptions": return mockSubscriptions;
    case "codeEmbeddings": return mockCodeEmbeddings;
    case "chatMessages": return mockChatMessages;
    case "repositories": return mockRepositories;
    case "organizations": return mockOrganizations;
    case "orgMembers": return mockOrgMembers;
    case "domainVerifications": return mockDomainVerifications;
    case "jobs": return mockJobs;
    case "researchPapers": return mockResearchPapers;
    case "researchJobs": return mockOracleSessions;
    case "orgInvitations": return mockOrgInvitations;
    case "events": return mockEvents;
    case "indexedFiles": return mockIndexedFiles;
    case "auditLogs": return mockAuditLogs;
    case "webhooks": return mockWebhooks;
    case "webhookDeliveries": return mockWebhookDeliveries;
    case "blobs": return mockBlobs;
    case "chatSessions": return mockChatSessions;
    case "toolCalls": return mockToolCalls;
    case "sessions": return mockSessions;
    case "terminalEvents": return mockTerminalEvents;
    case "knowledgeBaseFiles": return mockKnowledgeBaseFiles;
    case "knowledgeBaseArtifacts": return mockKnowledgeBaseArtifacts;
    case "checkpointFiles": return mockCheckpointFiles;
    case "diffs": return mockDiffs;
    case "consents": return mockConsents;
    case "retentionPolicies": return mockRetentionPolicies;
    case "projectRepositories": return mockProjectRepositories;
    case "repoProfiles": return mockRepoProfiles;
    case "posts": return mockPosts;
    case "postAssets": return mockPostAssets;
    case "comments": return mockComments;
    case "reactions": return mockReactions;
    case "follows": return mockFollows;
    case "trendScores": return mockTrendScores;
    case "restoreEvents": return mockRestoreEvents;
    case "trees": return mockTrees;
    default: return [];
  }
}

// ============================================================================
// Drizzle operator mocks (eq, and, isNull, desc, like, or, sql, inArray)
// ============================================================================

interface Condition {
  type: string;
  field?: string;
  value?: any;
  conditions?: Condition[];
}

function mockEq(fieldRef: any, value: any): Condition {
  return { type: "eq", field: fieldRef?.__field, value };
}

function mockNe(fieldRef: any, value: any): Condition {
  return { type: "ne", field: fieldRef?.__field, value };
}

function mockAnd(...conditions: any[]): Condition {
  // Flatten in case conditions are passed as an array
  const flat = conditions.flat().filter(Boolean);
  return { type: "and", conditions: flat };
}

function mockOr(...conditions: any[]): Condition {
  const flat = conditions.flat().filter(Boolean);
  return { type: "or", conditions: flat };
}

function mockIsNull(fieldRef: any): Condition {
  return { type: "isNull", field: fieldRef?.__field };
}

function mockIsNotNull(fieldRef: any): Condition {
  return { type: "isNotNull", field: fieldRef?.__field };
}

function mockDesc(fieldRef: any): any {
  return { type: "desc", field: fieldRef?.__field };
}

function mockLike(fieldRef: any, pattern: string): Condition {
  return { type: "like", field: fieldRef?.__field, value: pattern };
}

function mockInArray(fieldRef: any, values: any[]): Condition {
  return { type: "inArray", field: fieldRef?.__field, value: values };
}

// SQL tagged template mock
function mockSql(strings: TemplateStringsArray, ...values: any[]): any {
  return { type: "sql", value: "raw_sql", as: () => ({ type: "sql", value: "raw_sql" }) };
}
mockSql.join = () => "";

/**
 * Evaluate a condition tree against a record
 */
function matchesCondition(record: any, condition: Condition): boolean {
  if (!condition) return true;

  switch (condition.type) {
    case "eq":
      return record[condition.field!] === condition.value;

    case "ne":
      return record[condition.field!] !== condition.value;

    case "isNull":
      return record[condition.field!] === null || record[condition.field!] === undefined;

    case "isNotNull":
      return record[condition.field!] !== null && record[condition.field!] !== undefined;

    case "like": {
      const val = record[condition.field!];
      if (val === null || val === undefined) return false;
      const str = String(val).toLowerCase();
      const pattern = String(condition.value)
        .replace(/%/g, ".*")
        .toLowerCase();
      return new RegExp(`^${pattern}$`).test(str);
    }

    case "inArray": {
      const arr = condition.value as any[];
      return arr.includes(record[condition.field!]);
    }

    case "and":
      return (condition.conditions || []).every((c: Condition) => matchesCondition(record, c));

    case "or":
      return (condition.conditions || []).some((c: Condition) => matchesCondition(record, c));

    case "gte": {
      const gteVal = record[condition.field!];
      if (gteVal === null || gteVal === undefined) return false;
      if (gteVal instanceof Date && condition.value instanceof Date) {
        return gteVal.getTime() >= condition.value.getTime();
      }
      return gteVal >= condition.value;
    }

    case "lte": {
      const lteVal = record[condition.field!];
      if (lteVal === null || lteVal === undefined) return false;
      if (lteVal instanceof Date && condition.value instanceof Date) {
        return lteVal.getTime() <= condition.value.getTime();
      }
      return lteVal <= condition.value;
    }

    case "sql":
      // Raw SQL conditions can't be evaluated in mock - default to true
      return true;

    default:
      return true;
  }
}

// ============================================================================
// Mock DB with proper chainable query builder
// ============================================================================

function createSelectChain() {
  let _table: string | null = null;
  let _conditions: Condition | null = null;
  let _limit: number | undefined;
  let _offset: number | undefined;
  let _fields: any = null;

  function resolve(): any[] {
    if (!_table) return [];
    let store = getStore(_table);
    let results = [...store];

    // Apply conditions
    if (_conditions) {
      results = results.filter((r) => matchesCondition(r, _conditions!));
    }

    // Apply offset and limit
    if (_offset !== undefined || _limit !== undefined) {
      const start = _offset || 0;
      const end = _limit !== undefined ? start + _limit : undefined;
      results = results.slice(start, end);
    }

    // Project fields if specified
    if (_fields && typeof _fields === "object" && Object.keys(_fields).length > 0) {
      results = results.map((row) => {
        const projected: any = {};
        for (const [alias, fieldRef] of Object.entries(_fields)) {
          const fieldName = (fieldRef as any)?.__field || alias;
          projected[alias] = row[fieldName] !== undefined ? row[fieldName] : row[alias];
        }
        return projected;
      });
    }

    return results;
  }

  const chain: any = {
    from: (tableRef: any) => {
      // tableRef is a proxy; figure out the table name
      if (tableRef && typeof tableRef === "object") {
        // Try to detect via a known field
        for (const [tName, tProxy] of Object.entries(mockSchema)) {
          if (tableRef === tProxy) {
            _table = tName;
            break;
          }
        }
      }
      return chain;
    },
    where: (...conditions: any[]) => {
      if (conditions.length === 1) {
        _conditions = conditions[0];
      } else {
        _conditions = mockAnd(...conditions);
      }
      return chain;
    },
    orderBy: () => chain,
    groupBy: () => chain,
    innerJoin: () => chain,
    limit: (n: number) => { _limit = n; return chain; },
    offset: (n: number) => { _offset = n; return chain; },
    then: (onFulfill: any, onReject?: any) => {
      return Promise.resolve(resolve()).then(onFulfill, onReject);
    },
  };

  return (fields?: any) => {
    _fields = fields || null;
    return chain;
  };
}

function createInsertChain(tableRef: any) {
  let _tableName: string | null = null;
  let _values: any = null;

  for (const [tName, tProxy] of Object.entries(mockSchema)) {
    if (tableRef === tProxy) {
      _tableName = tName;
      break;
    }
  }

  const chain: any = {
    values: (vals: any) => {
      _values = vals;
      return chain;
    },
    onConflictDoUpdate: () => chain,
    onConflictDoNothing: () => chain,
    returning: (fields?: any) => {
      if (!_tableName || !_values) return Promise.resolve([]);
      const store = getStore(_tableName);
      const record = {
        id: _values.id || crypto.randomUUID(),
        ..._values,
        createdAt: _values.createdAt || new Date(),
        updatedAt: _values.updatedAt || new Date(),
      };
      store.push(record);
      // If specific fields requested, project them
      if (fields && typeof fields === "object") {
        const projected: any = {};
        for (const [alias, fieldRef] of Object.entries(fields)) {
          const fieldName = (fieldRef as any)?.__field || alias;
          projected[alias] = record[fieldName] !== undefined ? record[fieldName] : record[alias];
        }
        return Promise.resolve([projected]);
      }
      return Promise.resolve([record]);
    },
    then: (onFulfill: any, onReject?: any) => {
      // Support non-returning inserts (await db.insert(...).values(...))
      if (_tableName && _values) {
        const store = getStore(_tableName);
        const record = {
          ..._values,
          createdAt: _values.createdAt || new Date(),
          updatedAt: _values.updatedAt || new Date(),
        };
        store.push(record);
      }
      return Promise.resolve(undefined).then(onFulfill, onReject);
    },
  };
  return chain;
}

function createUpdateChain(tableRef: any) {
  let _tableName: string | null = null;
  let _updates: any = null;
  let _conditions: Condition | null = null;

  for (const [tName, tProxy] of Object.entries(mockSchema)) {
    if (tableRef === tProxy) {
      _tableName = tName;
      break;
    }
  }

  const chain: any = {
    set: (updates: any) => {
      _updates = updates;
      return chain;
    },
    where: (...conditions: any[]) => {
      if (conditions.length === 1) {
        _conditions = conditions[0];
      } else {
        _conditions = mockAnd(...conditions);
      }
      return chain;
    },
    returning: () => {
      if (!_tableName) return Promise.resolve([]);
      const store = getStore(_tableName);
      const matched = _conditions
        ? store.filter((r) => matchesCondition(r, _conditions!))
        : store;
      if (matched.length > 0 && _updates) {
        Object.assign(matched[0], _updates);
        return Promise.resolve([matched[0]]);
      }
      return Promise.resolve(matched.length > 0 ? [matched[0]] : []);
    },
    then: (onFulfill: any, onReject?: any) => {
      // Non-returning update
      if (_tableName && _updates) {
        const store = getStore(_tableName);
        const matched = _conditions
          ? store.filter((r) => matchesCondition(r, _conditions!))
          : store;
        if (matched.length > 0) {
          Object.assign(matched[0], _updates);
        }
      }
      return Promise.resolve(undefined).then(onFulfill, onReject);
    },
  };
  return chain;
}

function createDeleteChain(tableRef: any) {
  let _tableName: string | null = null;
  let _conditions: Condition | null = null;

  for (const [tName, tProxy] of Object.entries(mockSchema)) {
    if (tableRef === tProxy) {
      _tableName = tName;
      break;
    }
  }

  const chain: any = {
    where: (...conditions: any[]) => {
      if (conditions.length === 1) {
        _conditions = conditions[0];
      } else {
        _conditions = mockAnd(...conditions);
      }
      return chain;
    },
    then: (onFulfill: any, onReject?: any) => {
      if (_tableName) {
        const store = getStore(_tableName);
        if (_conditions) {
          const toRemove = store.filter((r) => matchesCondition(r, _conditions!));
          for (const item of toRemove) {
            const idx = store.indexOf(item);
            if (idx >= 0) store.splice(idx, 1);
          }
        }
      }
      return Promise.resolve(undefined).then(onFulfill, onReject);
    },
  };
  return chain;
}

const mockDb: any = {
  select: (fields?: any) => {
    const chainFactory = createSelectChain();
    return chainFactory(fields);
  },
  insert: (tableRef: any) => createInsertChain(tableRef),
  update: (tableRef: any) => createUpdateChain(tableRef),
  delete: (tableRef: any) => createDeleteChain(tableRef),
  execute: vi.fn().mockResolvedValue([{ health_check: 1 }]),
};

// ============================================================================
// Module mocks
// ============================================================================

// Mock the database module
vi.mock("../src/db/index.js", () => ({
  db: mockDb,
  schema: mockSchema,
}));

// Mock drizzle-orm operators
function mockAsc(fieldRef: any): any {
  return { type: "asc", field: fieldRef?.__field };
}

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
  ne: mockNe,
  and: mockAnd,
  or: mockOr,
  isNull: mockIsNull,
  isNotNull: mockIsNotNull,
  desc: mockDesc,
  asc: mockAsc,
  like: mockLike,
  ilike: mockLike, // ilike uses same logic as like in mock (case-insensitive by default)
  inArray: mockInArray,
  sql: mockSql,
  gte: (fieldRef: any, value: any) => ({ type: "gte", field: fieldRef?.__field, value }),
  lte: (fieldRef: any, value: any) => ({ type: "lte", field: fieldRef?.__field, value }),
  count: () => ({ type: "count" }),
  sum: (fieldRef: any) => ({ type: "sum", field: fieldRef?.__field }),
}));

// Mock the monitoring/logging module
vi.mock("../src/lib/monitoring.js", () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
}));

// Mock environment validation (no-op in tests)
vi.mock("../src/lib/validateEnv.js", () => ({
  validateEnvironment: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  validateEnvOrExit: vi.fn(),
}));

// Mock the audit middleware
vi.mock("../src/middleware/auditMiddleware.js", () => ({
  auditMiddleware: () => (_req: any, _res: any, next: any) => next(),
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock the audit log service
vi.mock("../src/services/auditLog.js", () => ({
  logApiKeyUsed: vi.fn(),
  logAction: vi.fn(),
  logCheckpointRestored: vi.fn().mockResolvedValue(undefined),
  logWebhookCreated: vi.fn().mockResolvedValue(undefined),
  logWebhookUpdated: vi.fn().mockResolvedValue(undefined),
  logWebhookDeleted: vi.fn().mockResolvedValue(undefined),
  logKeyCreated: vi.fn().mockResolvedValue(undefined),
  logKeyRevoked: vi.fn().mockResolvedValue(undefined),
  logCheckpointCreated: vi.fn().mockResolvedValue(undefined),
  logProjectCreated: vi.fn().mockResolvedValue(undefined),
}));

// Mock the session manager
vi.mock("../src/services/sessionManager.js", () => ({
  createSession: vi.fn(),
  validateSession: vi.fn(),
  updateActivity: vi.fn().mockResolvedValue(undefined),
  getUserSessions: vi.fn().mockResolvedValue([
    {
      id: "sess_001",
      deviceInfo: { browser: "Chrome", os: "macOS", device: "Desktop", isMobile: false },
      ipAddress: "192.168.1.1",
      lastActiveAt: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isCurrent: false,
    },
  ]),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  revokeAllSessions: vi.fn().mockResolvedValue(1),
  cleanupExpired: vi.fn().mockResolvedValue(3),
  getLocationFromIp: vi.fn().mockResolvedValue("Unknown"),
  getLocationFromIpSync: vi.fn().mockReturnValue("Unknown"),
}));

// Mock the embedding service
vi.mock("../src/services/embeddings.js", () => ({
  getEmbeddingService: () => ({
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      model: "mock-model",
      dimensions: 3,
    }),
    cosineSimilarity: vi.fn().mockReturnValue(0.85),
    getProviderInfo: () => ({
      provider: "mock",
      dimensions: 3,
    }),
  }),
}));

// Mock the indexing service
vi.mock("../src/services/indexing.js", () => ({
  IndexingService: vi.fn(),
  createIndexingService: () => ({
    searchCode: vi.fn().mockResolvedValue([]),
    indexFile: vi.fn().mockResolvedValue(undefined),
    indexRepository: vi.fn().mockResolvedValue({ status: "completed", filesIndexed: 5, error: null }),
    getRepositoryStats: vi.fn().mockResolvedValue({ fileCount: 5, symbolCount: 20, languageBreakdown: {}, symbolTypeBreakdown: {} }),
    getFileSymbols: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock the swagger setup
vi.mock("../src/swagger.js", () => ({
  setupSwagger: vi.fn(),
}));

// Mock dotenv
vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// Mock webhook delivery service
vi.mock("../src/services/webhookDelivery.js", () => ({
  triggerWebhooksForUser: vi.fn().mockResolvedValue(undefined),
  queueWebhook: vi.fn().mockResolvedValue("delivery_mock_001"),
  retryDelivery: vi.fn().mockResolvedValue(true),
  getDeliveryStats: vi.fn().mockResolvedValue({
    total: 10,
    success: 8,
    failed: 1,
    pending: 1,
    successRate: 80,
  }),
}));

// Mock LLM service
vi.mock("../src/services/llm.js", () => ({
  getLLMService: () => ({
    complete: vi.fn().mockResolvedValue({
      content: "Mock LLM synthesis result for testing.",
      model: "mock-model",
      provider: "mock",
      usage: { promptTokens: 100, completionTokens: 50 },
    }),
    isAvailable: vi.fn().mockReturnValue(true),
    getProviderInfo: () => ({
      provider: "mock",
      hasApiKey: true,
    }),
  }),
  LLMService: vi.fn(),
}));

// Mock email service
vi.mock("../src/services/email.js", () => ({
  getEmailService: () => ({
    send: vi.fn().mockResolvedValue({
      id: "email_mock_001",
      provider: "mock",
    }),
    getProviderInfo: () => ({
      provider: "mock",
      hasApiKey: true,
    }),
  }),
  EmailService: vi.fn(),
}));

// Mock web search service
vi.mock("../src/services/web-search.js", () => ({
  getWebSearchService: () => ({
    search: vi.fn().mockResolvedValue([
      { title: "Test Result", url: "https://example.com", snippet: "A test result" },
    ]),
    getProviderInfo: () => ({ provider: "mock", hasApiKey: true }),
  }),
  getWebScrapingService: () => ({
    scrape: vi.fn().mockResolvedValue({ content: "scraped content", title: "Page Title", url: "https://example.com" }),
    getProviderInfo: () => ({ provider: "mock-scraper", hasApiKey: false }),
  }),
}));

// Mock subscription guard middleware
vi.mock("../src/middleware/subscriptionGuard.js", () => ({
  requirePlan: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock quota check middleware
vi.mock("../src/middleware/quotaCheck.js", () => ({
  blobQuotaCheck: (_req: any, _res: any, next: any) => {
    _req.quotaInfo = { used: 1000, limit: 500 * 1024 * 1024, percentage: 0, plan: "free" };
    next();
  },
  quotaCheck: () => (_req: any, _res: any, next: any) => {
    _req.quotaInfo = { used: 1000, limit: 500 * 1024 * 1024, percentage: 0, plan: "free" };
    next();
  },
  quotaInfo: (_req: any, _res: any, next: any) => next(),
  addStorageUsage: vi.fn().mockResolvedValue(undefined),
  removeStorageUsage: vi.fn().mockResolvedValue(undefined),
  formatBytes: (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },
  getStorageUsage: vi.fn().mockResolvedValue({ used: 1000, limit: 500 * 1024 * 1024, percentage: 0, plan: "free" }),
  recalculateStorageUsage: vi.fn().mockResolvedValue(0),
  STORAGE_LIMITS: { free: 500 * 1024 * 1024, pro: 10 * 1024 * 1024 * 1024, team: 50 * 1024 * 1024 * 1024 },
  getStorageLimit: (plan: string) => {
    const limits: Record<string, number> = { free: 500 * 1024 * 1024, pro: 10 * 1024 * 1024 * 1024, team: 50 * 1024 * 1024 * 1024 };
    return limits[plan] ?? limits.free;
  },
  canUpload: () => ({ allowed: true }),
}));

// Mock Polar SDK
vi.mock("@polar-sh/sdk", () => {
  class MockPolar {
    customers = {
      create: vi.fn().mockResolvedValue({ id: "polar_cust_mock", email: "test@example.com" }),
    };
    checkouts = {
      create: vi.fn().mockResolvedValue({ id: "checkout_mock", url: "https://checkout.polar.sh/mock" }),
    };
    customerSessions = {
      create: vi.fn().mockResolvedValue({ customerPortalUrl: "https://portal.polar.sh/mock" }),
    };
    constructor(_opts?: any) {}
  }
  return { Polar: MockPolar };
});

export class MockWebhookVerificationError extends Error {}

export const mockValidatePolarEvent = vi.fn((payload: Buffer | string) => {
  const serialized = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload);
  return JSON.parse(serialized);
});

vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: (...args: any[]) => mockValidatePolarEvent(...args),
  WebhookVerificationError: MockWebhookVerificationError,
}));

// Mock scope check middleware
vi.mock("../src/middleware/scopeCheck.js", () => ({
  requireScope: () => (_req: any, _res: any, next: any) => next(),
  SCOPES: {
    READ: "read",
    WRITE: "write",
    ADMIN: "admin",
  },
  validateScopes: (scopes: string[]) => {
    const valid = ["read", "write", "admin"];
    const invalidScopes = scopes.filter((s: string) => !valid.includes(s));
    return { valid: invalidScopes.length === 0, invalidScopes };
  },
  normalizeScopes: (scopes: string[]) => [...new Set(scopes)],
  DEFAULT_SCOPES: ["read", "write"],
  ALL_SCOPES: ["read", "write", "admin"],
}));

// Mock dns module (used by SSO domain verification)
export const mockResolveTxt = vi.fn((_hostname: string, callback: Function) => {
  callback(null, []);
});

vi.mock("dns", () => ({
  default: { resolveTxt: mockResolveTxt },
  resolveTxt: mockResolveTxt,
}));

// Mock pdf-parse (used by research papers PDF extraction)
export const mockPdfParse = vi.fn().mockResolvedValue({
  text: "Mock extracted PDF text content for testing purposes. This is a research paper about machine learning.",
  numpages: 5,
  info: { Title: "Test Paper" },
});

vi.mock("pdf-parse", () => ({
  default: mockPdfParse,
}));

// Mock fs/promises (used by repositories for file operations)
vi.mock("fs/promises", () => ({
  default: {
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ size: 100, isDirectory: () => false }),
    readFile: vi.fn().mockResolvedValue("// mock file content"),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ size: 100, isDirectory: () => false }),
  readFile: vi.fn().mockResolvedValue("// mock file content"),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process (used by repositories for git clone)
vi.mock("child_process", () => ({
  exec: vi.fn((_cmd: string, callback: Function) => {
    callback(null, { stdout: "", stderr: "" });
  }),
}));

// Mock data pipeline service
vi.mock("../src/services/data-pipeline.js", () => {
  const pipelineJobs = new Map<string, any>();

  return {
    createDataPipeline: vi.fn(),
    DataPipeline: vi.fn(),
    createPipelineJob: vi.fn().mockImplementation(async (userId: string, config: any) => {
      const job = {
        id: `pipeline_mock_${Date.now()}`,
        userId,
        status: "pending",
        config,
        progress: 0,
        stats: { eventsCollected: 0, conversationsFound: 0, codeChangesFound: 0, filesProcessed: 0, bytesGenerated: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      pipelineJobs.set(job.id, job);
      return job;
    }),
    getPipelineJob: vi.fn().mockImplementation((id: string) => pipelineJobs.get(id)),
    listPipelineJobs: vi.fn().mockImplementation((userId: string) =>
      Array.from(pipelineJobs.values()).filter(j => j.userId === userId)
    ),
    getPipelineDownload: vi.fn().mockReturnValue(null),
    schedulePipeline: vi.fn().mockReturnValue("sched_mock"),
    cancelSchedule: vi.fn().mockReturnValue(true),
    uploadToS3: vi.fn().mockResolvedValue({ bucket: "test", key: "test.jsonl", url: "https://s3.example.com/test.jsonl" }),
  };
});

// ============================================================================
// Rate limiter control
//
// By default, the rate limiter is replaced with a passthrough middleware
// that just sets standard headers. The rate-limit.test.ts file can call
// enableRateLimit() to use a simple in-memory mock rate limiter that
// enforces a 10 req/min limit (matching the free plan).
// ============================================================================

export let rateLimitEnabled = false;

/** In-memory counter for the mock rate limiter */
const mockRateLimitCounts = new Map<string, number>();

/** Call this to enable mock rate limiting (10 req/min, returns 429 when exceeded) */
export function enableRateLimit() {
  rateLimitEnabled = true;
}

/** Call this to disable rate limiting (default passthrough mode) */
export function disableRateLimit() {
  rateLimitEnabled = false;
}

/** Reset mock rate limiter counters (call between tests) */
export function resetMockRateLimiter() {
  mockRateLimitCounts.clear();
}

// Mock rate-limit.js (the file imported by index.ts as combinedRateLimit)
const mockRateLimitMiddleware = (req: any, res: any, next: any) => {
  const MOCK_LIMIT = 10;

  if (!rateLimitEnabled) {
    res.setHeader("X-RateLimit-Limit", MOCK_LIMIT);
    res.setHeader("X-RateLimit-Remaining", MOCK_LIMIT - 1);
    res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + 60000) / 1000));
    res.setHeader("X-RateLimit-Limit-Month", 1000);
    res.setHeader("X-RateLimit-Remaining-Month", 999);
    res.setHeader("X-RateLimit-Reset-Month", Math.ceil((Date.now() + 2592000000) / 1000));
    return next();
  }

  const key = req.headers?.["x-api-key"] || req.socket?.remoteAddress || "unknown";
  const count = (mockRateLimitCounts.get(key) || 0) + 1;
  mockRateLimitCounts.set(key, count);

  const remaining = Math.max(0, MOCK_LIMIT - count);
  const reset = Math.ceil((Date.now() + 60000) / 1000);

  res.setHeader("X-RateLimit-Limit", MOCK_LIMIT);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", reset);
  res.setHeader("X-RateLimit-Limit-Month", 1000);
  res.setHeader("X-RateLimit-Remaining-Month", Math.max(0, 1000 - count));
  res.setHeader("X-RateLimit-Reset-Month", Math.ceil((Date.now() + 2592000000) / 1000));

  if (count > MOCK_LIMIT) {
    const retryAfter = 60;
    res.setHeader("Retry-After", retryAfter);
    return res.status(429).json({
      error: {
        type: "rate_limit_exceeded",
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded. Too many requests per minute.",
        details: {
          retry_after: retryAfter,
          limit_type: "minute",
          limit: MOCK_LIMIT,
          current: count,
        },
      },
    });
  }

  next();
};

vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: () => mockRateLimitMiddleware,
  burstRateLimit: () => (_req: any, _res: any, next: any) => next(),
  combinedRateLimit: () => mockRateLimitMiddleware,
  rateLimits: {
    standard: mockRateLimitMiddleware,
    search: mockRateLimitMiddleware,
    write: mockRateLimitMiddleware,
    auth: mockRateLimitMiddleware,
    expensive: mockRateLimitMiddleware,
    health: (_req: any, _res: any, next: any) => next(),
  },
  default: () => mockRateLimitMiddleware,
}));

vi.mock("../src/middleware/rateLimit.js", () => ({
  RATE_LIMITS: {
    free: { requestsPerMinute: 10, requestsPerMonth: 1_000 },
    pro: { requestsPerMinute: 100, requestsPerMonth: 100_000 },
    team: { requestsPerMinute: 500, requestsPerMonth: 500_000 },
    enterprise: { requestsPerMinute: 2000, requestsPerMonth: 2_000_000 },
  },
  ENDPOINT_LIMITS: {},
  rateLimit: (req: any, res: any, next: any) => {
    const MOCK_LIMIT = 10;

    if (!rateLimitEnabled) {
      // Passthrough: set standard headers to simulate the real middleware
      res.setHeader("X-RateLimit-Limit", MOCK_LIMIT);
      res.setHeader("X-RateLimit-Remaining", MOCK_LIMIT - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + 60000) / 1000));
      res.setHeader("X-RateLimit-Limit-Month", 1000);
      res.setHeader("X-RateLimit-Remaining-Month", 999);
      res.setHeader("X-RateLimit-Reset-Month", Math.ceil((Date.now() + 2592000000) / 1000));
      return next();
    }

    // Mock rate limiter: count requests per API key / IP
    const key = req.headers?.["x-api-key"] || req.socket?.remoteAddress || "unknown";
    const count = (mockRateLimitCounts.get(key) || 0) + 1;
    mockRateLimitCounts.set(key, count);

    const remaining = Math.max(0, MOCK_LIMIT - count);
    const reset = Math.ceil((Date.now() + 60000) / 1000);

    res.setHeader("X-RateLimit-Limit", MOCK_LIMIT);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", reset);
    res.setHeader("X-RateLimit-Limit-Month", 1000);
    res.setHeader("X-RateLimit-Remaining-Month", Math.max(0, 1000 - count));
    res.setHeader("X-RateLimit-Reset-Month", Math.ceil((Date.now() + 2592000000) / 1000));

    if (count > MOCK_LIMIT) {
      const retryAfter = 60;
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        error: {
          type: "rate_limit_exceeded",
          code: "rate_limit_exceeded",
          message: "Rate limit exceeded. Too many requests per minute.",
          details: {
            retry_after: retryAfter,
            limit_type: "minute",
            limit: MOCK_LIMIT,
            current: count,
          },
        },
      });
    }

    next();
  },
  strictRateLimit: () => (_req: any, _res: any, next: any) => next(),
  getRateLimitStatus: () => ({
    minute: { count: 0, limit: 10, remaining: 10, reset: Date.now() + 60000 },
    month: { count: 0, limit: 1000, remaining: 1000, reset: Date.now() + 2592000000 },
  }),
  resetRateLimits: () => {},
  getAllRateLimitEntries: () => new Map(),
}));

// ============================================================================
// Seed test data
// ============================================================================

export function seedTestData() {
  resetStores();

  const keyHash = crypto.createHash("sha256").update(TEST_API_KEY).digest("hex");
  const expiredKeyHash = crypto.createHash("sha256").update(EXPIRED_API_KEY).digest("hex");

  mockUsers.push({
    id: "user_test_001",
    email: "test@example.com",
    name: "Test User",
    plan: "free",
    polarCustomerId: null,
    storageUsedBytes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  mockApiKeys.push({
    id: "key_test_001",
    userId: "user_test_001",
    keyHash,
    keyPrefix: TEST_API_KEY.slice(0, 12),
    name: "Test Key",
    scopes: ["read", "write"],
    expiresAt: null,
    allowedIps: null,
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
  });

  mockApiKeys.push({
    id: "key_expired_001",
    userId: "user_test_001",
    keyHash: expiredKeyHash,
    keyPrefix: EXPIRED_API_KEY.slice(0, 12),
    name: "Expired Key",
    scopes: ["read", "write"],
    expiresAt: new Date("2020-01-01"),
    allowedIps: null,
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
  });

  mockProjects.push({
    id: "proj_test_001",
    userId: "user_test_001",
    orgId: null,
    name: "Test Project",
    rootPath: "/home/user/project",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSyncedAt: null,
  });

  mockSavedContexts.push({
    id: "ctx_test_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    checkpointId: null,
    name: "Test Context",
    description: "A test conversation context for debugging",
    messages: [
      { role: "user", content: "Hello", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Hi there!", timestamp: new Date().toISOString() },
    ],
    systemPrompt: null,
    toolState: null,
    openFiles: ["src/index.ts"],
    workingDirectory: "/home/user/project",
    gitBranch: "main",
    gitCommit: "abc123",
    embeddingJson: [0.1, 0.2, 0.3],
    embeddingModel: "mock-model",
    tool: "claude-code",
    isAutoSaved: false,
    tags: ["test", "debug"],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    metadata: null,
  });
}

// ============================================================================
// App factory
// ============================================================================

let _cachedApp: any = null;

/**
 * Create (or return cached) Express app for testing.
 * Patches Express's Application.listen to be a no-op, preventing actual
 * port binding when index.ts is imported.
 */
export async function createTestApp() {
  if (_cachedApp) return _cachedApp;

  // Enable listen interception during module import so the app doesn't
  // actually bind to a port, while allowing supertest to create real
  // test servers afterwards.
  interceptingListen = true;

  // Now import the app module - mocks above will intercept all dependencies
  const mod = await import("../src/index.js");
  _cachedApp = mod.default;

  // Disable interception so supertest's listen calls work normally
  interceptingListen = false;

  return _cachedApp;
}
