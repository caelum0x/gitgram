/**
 * Test Setup
 *
 * Mocks Prisma, Redis, and external services so integration tests
 * can run without requiring real Postgres, Redis, or third-party APIs.
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
process.env.RESEND_API_KEY = 're_test_key';
process.env.DODOPAY_API_KEY = '';
process.env.GOOGLE_MAPS_API_KEY = '';
process.env.FRONTEND_URL = 'http://localhost:3000';

// ============================================================================
// Mock Prisma Client
// ============================================================================

let mockIdCounter = 0;

const toComparableTime = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const matchesCondition = (actual: unknown, expected: any): boolean => {
  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !Array.isArray(expected)) {
    const operatorKeys = ['in', 'notIn', 'not', 'gt', 'gte', 'lt', 'lte', 'contains', 'equals'];
    const hasOperator = operatorKeys.some((operator) => operator in expected);

    if ('in' in expected) return Array.isArray(expected.in) ? expected.in.includes(actual) : true;
    if ('notIn' in expected) return Array.isArray(expected.notIn) ? !expected.notIn.includes(actual) : true;
    if ('not' in expected) return actual !== expected.not;

    const comparableActual = toComparableTime(actual) as any;
    if ('gt' in expected && !(comparableActual > (toComparableTime(expected.gt) as any))) return false;
    if ('gte' in expected && !(comparableActual >= (toComparableTime(expected.gte) as any))) return false;
    if ('lt' in expected && !(comparableActual < (toComparableTime(expected.lt) as any))) return false;
    if ('lte' in expected && !(comparableActual <= (toComparableTime(expected.lte) as any))) return false;
    if ('contains' in expected) {
      return String(actual ?? '').toLowerCase().includes(String(expected.contains).toLowerCase());
    }
    if ('equals' in expected) return actual === expected.equals;
    if (hasOperator) return true;
  }

  return actual === expected;
};

const matchesWhere = (row: any, where?: any): boolean => {
  if (!where) return true;

  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND' && Array.isArray(expected)) return expected.every((entry) => matchesWhere(row, entry));
    if (key === 'OR' && Array.isArray(expected)) return expected.some((entry) => matchesWhere(row, entry));
    if (key === 'NOT') return !matchesWhere(row, expected);

    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      const values = Object.entries(expected);
      const isCompositeUnique = values.length > 0 && values.every(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value));
      if (isCompositeUnique && row[key] === undefined) {
        return values.every(([nestedKey, nestedExpected]) => matchesCondition(row[nestedKey], nestedExpected));
      }
    }

    return matchesCondition(row[key], expected);
  });
};

const getMockRows = (modelName: string): any[] => mockPrisma?.[modelName]?.__rows ?? [];

const countRelation = (row: any, relation: string) => {
  switch (relation) {
    case 'posts':
      return getMockRows('post').filter((entry) => entry.userId === row.id || entry.accountId === row.id || entry.repositoryId === row.id).length;
    case 'followers':
      return getMockRows('follow').filter((entry) => entry.followingId === row.id || entry.followingUserId === row.id).length;
    case 'following':
      return getMockRows('follow').filter((entry) => entry.followerId === row.id || entry.followerUserId === row.id).length;
    case 'likes':
      return getMockRows('like').filter((entry) => entry.postId === row.id).length;
    case 'comments':
      return getMockRows('comment').filter((entry) => entry.postId === row.id).length;
    case 'replies':
      // Threaded replies live in the same table, linked by parentId.
      return [...getMockRows('unifiedComment'), ...getMockRows('comment')].filter(
        (entry) => entry.parentId === row.id,
      ).length;
    case 'deliveries':
      return getMockRows('webhookDelivery').filter((entry) => entry.webhookId === row.id || entry.userWebhookId === row.id).length;
    default:
      return 0;
  }
};

const getRelation = (row: any, relation: string) => {
  switch (relation) {
    case 'user':
      return getMockRows('user').find((entry) => entry.id === row.userId) ?? null;
    case 'account':
      return getMockRows('account').find((entry) => entry.id === row.accountId || entry.userId === row.userId) ?? null;
    case 'repository':
      return getMockRows('repository').find((entry) => entry.id === row.repositoryId) ?? null;
    case 'post':
      return getMockRows('post').find((entry) => entry.id === row.postId) ?? null;
    case 'follower':
    case 'followerUser':
      return getMockRows('user').find((entry) => entry.id === row.followerId || entry.id === row.followerUserId) ?? null;
    case 'following':
    case 'followingUser':
      return getMockRows('user').find((entry) => entry.id === row.followingId || entry.id === row.followingUserId) ?? null;
    case 'blocked':
      return getMockRows('user').find((entry) => entry.id === row.blockedId) ?? null;
    case 'blocker':
      return getMockRows('user').find((entry) => entry.id === row.blockerId) ?? null;
    case 'deliveries':
      return getMockRows('webhookDelivery').filter((entry) => entry.webhookId === row.id || entry.userWebhookId === row.id);
    case 'collections':
      return getMockRows('savedPostCollection').filter((entry) => entry.savedPostId === row.id);
    default:
      return row[relation];
  }
};

const applyShape = (row: any, select?: Record<string, any>, include?: Record<string, any>): any => {
  if (!row) return row;

  if (select) {
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key, config]) => {
          if (key === '_count') {
            const countSelect = config?.select ?? {};
            return [
              key,
              Object.fromEntries(Object.keys(countSelect).map((relation) => [relation, countRelation(row, relation)])),
            ];
          }

          if (config && typeof config === 'object' && config.select) {
            return [key, applyShape(getRelation(row, key), config.select)];
          }

          return [key, row[key]];
        })
    );
  }

  if (include) {
    const shaped = { ...row };
    Object.entries(include)
      .filter(([, enabled]) => Boolean(enabled))
      .forEach(([key, config]) => {
        if (key === '_count') {
          const countSelect = (config as any)?.select ?? {};
          shaped[key] = Object.fromEntries(Object.keys(countSelect).map((relation) => [relation, countRelation(row, relation)]));
          return;
        }

        const relation = getRelation(row, key);
        if (Array.isArray(relation)) {
          shaped[key] = relation.map((entry) => applyShape(entry, (config as any)?.select, (config as any)?.include));
          return;
        }
        shaped[key] = applyShape(relation, (config as any)?.select, (config as any)?.include);
      });
    return shaped;
  }

  return row;
};

const orderRows = (rows: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
  if (!orderBy) return rows;
  const [field, direction] = Object.entries(orderBy)[0] ?? [];
  if (!field) return rows;
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) return 0;
    const result = left > right ? 1 : -1;
    return direction === 'desc' ? -result : result;
  });
};

const createRecord = (data: any) => {
  const defaults: Record<string, unknown> = {};
  if ('token' in (data ?? {}) && 'expiresAt' in (data ?? {}) && !('used' in (data ?? {}))) {
    defaults.used = false;
  }
  if ('password' in (data ?? {}) && !('emailVerified' in (data ?? {}))) {
    defaults.emailVerified = false;
  }
  if ('url' in (data ?? {}) && 'events' in (data ?? {}) && !('active' in (data ?? {}))) {
    defaults.active = true;
  }
  if ('content' in (data ?? {}) && ('accountId' in (data ?? {}) || 'userId' in (data ?? {}))) {
    defaults.isArchived = false;
    defaults.likesCount = 0;
    defaults.commentsCount = 0;
    defaults.mediaUrls = [];
  }

  return {
    id: data?.id ?? `mock-${++mockIdCounter}`,
    ...defaults,
    ...data,
    createdAt: data?.createdAt ?? new Date(),
    updatedAt: data?.updatedAt ?? new Date(),
  };
};

const applyData = (row: any, data: any = {}) => Object.fromEntries(
  Object.entries(data).map(([key, value]: [string, any]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('increment' in value) return [key, (row[key] ?? 0) + value.increment];
      if ('decrement' in value) return [key, (row[key] ?? 0) - value.decrement];
      if ('set' in value) return [key, value.set];
    }
    return [key, value];
  })
);

const createMockPrismaModel = () => {
  const rows: any[] = [];

  const model: any = {
    findUnique: jest.fn().mockImplementation(({ where, select, include } = {}) => {
      const row = rows.find((entry) => matchesWhere(entry, where)) ?? null;
      return Promise.resolve(applyShape(row, select, include));
    }),
    findFirst: jest.fn().mockImplementation(({ where, select, include, orderBy } = {}) => {
      const row = orderRows(rows.filter((entry) => matchesWhere(entry, where)), orderBy)[0] ?? null;
      return Promise.resolve(applyShape(row, select, include));
    }),
    findMany: jest.fn().mockImplementation(({ where, select, include, orderBy, skip = 0, take } = {}) => {
      const filteredRows = orderRows(rows.filter((entry) => matchesWhere(entry, where)), orderBy);
      const slicedRows = typeof take === 'number' ? filteredRows.slice(skip, skip + take) : filteredRows.slice(skip);
      return Promise.resolve(slicedRows.map((row) => applyShape(row, select, include)));
    }),
    create: jest.fn().mockImplementation(({ data, select, include }) => {
      const row = createRecord(data);
      rows.push(row);
      return Promise.resolve(applyShape(row, select, include));
    }),
    createMany: jest.fn().mockImplementation(({ data }) => {
      const records = Array.isArray(data) ? data : [];
      rows.push(...records.map(createRecord));
      return Promise.resolve({ count: records.length });
    }),
    update: jest.fn().mockImplementation(({ where, data, select, include } = {}) => {
      const index = rows.findIndex((entry) => matchesWhere(entry, where));
      const mergedData = applyData(index >= 0 ? rows[index] : {}, data);
      const updated = {
        ...(index >= 0 ? rows[index] : { id: where?.id ?? 'mock-id' }),
        ...mergedData,
        updatedAt: new Date(),
      };
      if (index >= 0) rows[index] = updated;
      return Promise.resolve(applyShape(updated, select, include));
    }),
    updateMany: jest.fn().mockImplementation(({ where, data } = {}) => {
      let count = 0;
      rows.forEach((row, index) => {
        if (matchesWhere(row, where)) {
          rows[index] = { ...row, ...applyData(row, data), updatedAt: new Date() };
          count += 1;
        }
      });
      return Promise.resolve({ count });
    }),
    upsert: jest.fn().mockImplementation(({ where, create, update, select, include } = {}) => {
      const index = rows.findIndex((entry) => matchesWhere(entry, where));
      if (index >= 0) {
        rows[index] = { ...rows[index], ...applyData(rows[index], update), updatedAt: new Date() };
        return Promise.resolve(applyShape(rows[index], select, include));
      }
      const row = createRecord(create);
      rows.push(row);
      return Promise.resolve(applyShape(row, select, include));
    }),
    delete: jest.fn().mockImplementation(({ where } = {}) => {
      const index = rows.findIndex((entry) => matchesWhere(entry, where));
      if (index < 0) return Promise.resolve({ id: where?.id ?? 'mock-id' });
      const [deleted] = rows.splice(index, 1);
      return Promise.resolve(deleted);
    }),
    deleteMany: jest.fn().mockImplementation(({ where } = {}) => {
      let count = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matchesWhere(rows[index], where)) {
          rows.splice(index, 1);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    }),
    count: jest.fn().mockImplementation(({ where } = {}) => Promise.resolve(rows.filter((row) => matchesWhere(row, where)).length)),
    aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 }, _sum: {}, _avg: {}, _min: {}, _max: {} }),
    groupBy: jest.fn().mockResolvedValue([]),
  };

  // Expose __rows as a getter/setter that always reflects the SAME underlying
  // `rows` array the query implementations close over. Tests that reassign
  // `model.__rows = [...]` would otherwise swap in a fresh array the mock never
  // reads, silently making every query return nothing. The setter mutates the
  // original array in place so both direct mutation and reassignment work.
  Object.defineProperty(model, '__rows', {
    get: () => rows,
    set: (next: any[]) => {
      rows.length = 0;
      if (Array.isArray(next)) rows.push(...next);
    },
    enumerable: true,
    configurable: true,
  });

  return model;
};

const mockPrisma: any = {
  aBTestConversion: createMockPrismaModel(),
  user: createMockPrismaModel(),
  post: createMockPrismaModel(),
  comment: createMockPrismaModel(),
  like: createMockPrismaModel(),
  follow: createMockPrismaModel(),
  story: createMockPrismaModel(),
  reel: createMockPrismaModel(),
  message: createMockPrismaModel(),
  conversation: createMockPrismaModel(),
  conversationParticipant: createMockPrismaModel(),
  notification: createMockPrismaModel(),
  session: createMockPrismaModel(),
  account: createMockPrismaModel(),
  collection: createMockPrismaModel(),
  collectionPost: createMockPrismaModel(),
  savedPost: createMockPrismaModel(),
  report: createMockPrismaModel(),
  userBlock: createMockPrismaModel(),
  userWebhook: createMockPrismaModel(),
  webhookDelivery: createMockPrismaModel(),
  passwordResetToken: createMockPrismaModel(),
  emailVerificationToken: createMockPrismaModel(),
  twoFactorAuth: createMockPrismaModel(),
  repository: createMockPrismaModel(),
  repositoryFollow: createMockPrismaModel(),
  codeSnippet: createMockPrismaModel(),
  draft: createMockPrismaModel(),
  scheduledPost: createMockPrismaModel(),
  hashtag: createMockPrismaModel(),
  postHashtag: createMockPrismaModel(),
  postShare: createMockPrismaModel(),
  postView: createMockPrismaModel(),
  storyView: createMockPrismaModel(),
  reelView: createMockPrismaModel(),
  reelLike: createMockPrismaModel(),
  reelComment: createMockPrismaModel(),
  notificationPreference: createMockPrismaModel(),
  emailPreference: createMockPrismaModel(),
  pushSubscription: createMockPrismaModel(),
  profileVisit: createMockPrismaModel(),
  followRequest: createMockPrismaModel(),
  dataExportRequest: createMockPrismaModel(),
  subscription: createMockPrismaModel(),
  advertisement: createMockPrismaModel(),
  moderationAction: createMockPrismaModel(),
  contentFlag: createMockPrismaModel(),
  privacySetting: createMockPrismaModel(),
  commentLike: createMockPrismaModel(),
  mention: createMockPrismaModel(),
  trendingPost: createMockPrismaModel(),
  analytics: createMockPrismaModel(),
  activityLog: createMockPrismaModel(),
  chat: createMockPrismaModel(),
  chatMember: createMockPrismaModel(),
  emailPreferences: createMockPrismaModel(),
  engagementAnomaly: createMockPrismaModel(),
  gitHubWebhook: createMockPrismaModel(),
  interaction: createMockPrismaModel(),
  linkPreview: createMockPrismaModel(),
  linkedAccount: createMockPrismaModel(),
  media: createMockPrismaModel(),
  mediaFingerprint: createMockPrismaModel(),
  mediaUploadQuota: createMockPrismaModel(),
  moderationAppeal: createMockPrismaModel(),
  moderationLog: createMockPrismaModel(),
  notificationPreferences: createMockPrismaModel(),
  organizationMember: createMockPrismaModel(),
  postDraft: createMockPrismaModel(),
  postReport: createMockPrismaModel(),
  profilePrivacySettings: createMockPrismaModel(),
  project: createMockPrismaModel(),
  pushDevice: createMockPrismaModel(),
  repositoryActivity: createMockPrismaModel(),
  repositoryAitmSettings: createMockPrismaModel(),
  repositoryBookmark: createMockPrismaModel(),
  repositoryManager: createMockPrismaModel(),
  savedCollection: createMockPrismaModel(),
  savedPostCollection: createMockPrismaModel(),
  storyArchive: createMockPrismaModel(),
  storyHighlight: createMockPrismaModel(),
  storyReaction: createMockPrismaModel(),
  storyReply: createMockPrismaModel(),
  storySettings: createMockPrismaModel(),
  transcodeJob: createMockPrismaModel(),
  trendingEntry: createMockPrismaModel(),
  trendingHistory: createMockPrismaModel(),
  trendingSignalWeight: createMockPrismaModel(),
  unfollowLog: createMockPrismaModel(),
  unifiedComment: createMockPrismaModel(),
  userLanguagePreference: createMockPrismaModel(),
  userTopicInterest: createMockPrismaModel(),
  star: createMockPrismaModel(),
  organization: createMockPrismaModel(),
  accountSwitchGrant: createMockPrismaModel(),
  adCampaign: createMockPrismaModel(),
  adPreferences: createMockPrismaModel(),
  auditLog: createMockPrismaModel(),
  feedback: createMockPrismaModel(),
  messageReaction: createMockPrismaModel(),
  moment: createMockPrismaModel(),
  momentLike: createMockPrismaModel(),
  mutedWord: createMockPrismaModel(),
  repositoryClone: createMockPrismaModel(),
  repositoryPathView: createMockPrismaModel(),
  repositoryReferrer: createMockPrismaModel(),
  storeItem: createMockPrismaModel(),
  storePurchase: createMockPrismaModel(),
  talentOpportunity: createMockPrismaModel(),
  talentPlacement: createMockPrismaModel(),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn().mockImplementation(async (fn: any) => {
    if (typeof fn === 'function') {
      return fn(mockPrisma);
    }
    return Promise.all(fn);
  }),
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $executeRaw: jest.fn().mockResolvedValue(0),
};

// Mock the prisma module
jest.mock('../src/utils/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ============================================================================
// Mock Redis
// ============================================================================

const mockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(0),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  isOpen: true,
  isReady: true,
};

jest.mock('../src/services/redisService', () => ({
  __esModule: true,
  default: mockRedisClient,
  redisClient: mockRedisClient,
  connectRedis: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDelete: jest.fn().mockResolvedValue(undefined),
  redisDeletePattern: jest.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Mock External Services
// ============================================================================

// Mock email service (Resend)
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: 'email_mock_001' }),
    },
  })),
}));

// Mock Sentry
jest.mock('../src/services/sentryService', () => ({
  initSentry: jest.fn(),
  sentryRequestHandler: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  sentryTracingHandler: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  sentryErrorHandler: jest.fn(() => (_err: any, _req: any, _res: any, next: any) => next(_err)),
  captureException: jest.fn(),
}));

// Mock environment validation
jest.mock('../src/config/env', () => ({
  validateEnvironment: jest.fn(),
  getConfig: jest.fn().mockReturnValue({
    JWT_SECRET: 'test-secret-key-for-testing-at-least-32-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing',
    JWT_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: 10,
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
    PORT: 3000,
  }),
  config: {
    PORT: 3000,
    JWT_SECRET: 'test-secret-key-for-testing-at-least-32-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing',
    JWT_EXPIRES_IN: '15m',
    BCRYPT_ROUNDS: 10,
    DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
    FRONTEND_URL: 'http://localhost:3000',
    jwt: {
      secret: 'test-secret-key-for-testing-at-least-32-chars',
      refreshSecret: 'test-refresh-secret-key-for-testing',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    bcrypt: {
      rounds: 10,
    },
    isProduction: false,
    isDevelopment: false,
  },
}));

// Mock Winston logger
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock error tracker
jest.mock('../src/utils/errorTracker', () => ({
  errorTracker: {
    initialize: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}));

// Mock feature flags
jest.mock('../src/utils/featureFlags', () => ({
  featureFlags: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(false),
    getVariation: jest.fn().mockReturnValue(null),
  },
}));

// Mock storage service (multer)
jest.mock('../src/services/storageService', () => {
  const multer = require('multer');
  const testUpload = multer({ storage: multer.memoryStorage() });

  return {
    upload: {
      single: jest.fn((fieldName: string) => testUpload.single(fieldName)),
      array: jest.fn((fieldName: string, maxCount?: number) => testUpload.array(fieldName, maxCount)),
      fields: jest.fn((fields: any[]) => testUpload.fields(fields)),
    },
    uploadMedia: jest.fn((file: any, folder = 'media') => Promise.resolve(`https://cdn.test/${folder}/${file?.originalname ?? 'file.bin'}`)),
    uploadStoryImage: jest.fn((file: any, folder = 'stories') => Promise.resolve({ url: `https://cdn.test/${folder}/${file?.originalname ?? 'story.jpg'}` })),
    uploadAvatarImage: jest.fn((file: any) => Promise.resolve({ url: `https://cdn.test/avatars/${file?.originalname ?? 'avatar.jpg'}` })),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteMedia: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
  validate: jest.fn().mockReturnValue(true),
}));

// Mock data retention
jest.mock('../src/utils/dataRetention', () => ({
  scheduleDataRetentionCleanup: jest.fn(),
}));

// Mock background jobs
jest.mock('../src/jobs/scheduler', () => ({
  initializeJobs: jest.fn(),
}));

jest.mock('../src/jobs/scheduledPosts', () => ({
  startScheduledPostsJob: jest.fn(),
}));

// Mock security headers
jest.mock('../src/middleware/securityHeaders', () => ({
  applySecurityHeaders: (_req: any, _res: any, next: any) => next(),
  requestId: (_req: any, _res: any, next: any) => {
    _req.id = 'test-request-id';
    next();
  },
}));

// Mock request logger
jest.mock('../src/middleware/requestLogger', () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

// Mock request metrics
jest.mock('../src/middleware/requestMetrics', () => ({
  trackRequestMetrics: (_req: any, _res: any, next: any) => next(),
  getMetricsEndpoint: jest.fn(() => (_req: any, res: any) => res.json({})),
}));

// Mock performance monitor
jest.mock('../src/middleware/performanceMonitor', () => ({
  performanceMonitoringMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock analytics middleware
jest.mock('../src/middleware/analyticsMiddleware', () => ({
  analyticsMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Mock auth middleware - validates token presence like real middleware
jest.mock('../src/middleware/auth', () => {
  const jwt = require('jsonwebtoken');
  return {
    authenticate: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.accessToken;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret-key-for-testing-at-least-32-chars');
        req.userId = (decoded as any).userId;
        req.user = { id: (decoded as any).userId, role: 'USER' };
        next();
      } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    },
    optionalAuth: (req: any, _res: any, next: any) => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret-key-for-testing-at-least-32-chars');
          req.userId = (decoded as any).userId;
          req.user = { id: (decoded as any).userId, role: 'USER' };
        } catch {
          // Optional auth - just skip if invalid
        }
      }
      next();
    },
  };
});

// Mock cache middleware
jest.mock('../src/middleware/cache', () => ({
  cacheMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock rate limiters (passthrough by default)
jest.mock('../src/middleware/rateLimiter', () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  authLimiter: (_req: any, _res: any, next: any) => next(),
  searchLimiter: (_req: any, _res: any, next: any) => next(),
  adminLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetLimiter: (_req: any, _res: any, next: any) => next(),
  refreshTokenLimiter: (_req: any, _res: any, next: any) => next(),
  uploadLimiter: (_req: any, _res: any, next: any) => next(),
  interactionLimiter: (_req: any, _res: any, next: any) => next(),
  emailLimiter: (_req: any, _res: any, next: any) => next(),
  accountDeletionLimiter: (_req: any, _res: any, next: any) => next(),
  dataExportLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/tieredRateLimiter', () => ({
  ipApiLimit: (_req: any, _res: any, next: any) => next(),
  ipAuthLimit: (_req: any, _res: any, next: any) => next(),
  ipUploadLimit: (_req: any, _res: any, next: any) => next(),
  userPostLimit: (_req: any, _res: any, next: any) => next(),
  userCommentLimit: (_req: any, _res: any, next: any) => next(),
  userReactionLimit: (_req: any, _res: any, next: any) => next(),
  userReportLimit: (_req: any, _res: any, next: any) => next(),
  userFollowLimit: (_req: any, _res: any, next: any) => next(),
  userAppealLimit: (_req: any, _res: any, next: any) => next(),
  userModerationActionLimit: (_req: any, _res: any, next: any) => next(),
  userRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock anti-spam middleware
jest.mock('../src/middleware/antiSpamMiddleware', () => ({
  enrichAccountAge: (_req: any, _res: any, next: any) => next(),
  abuseGate: (_req: any, _res: any, next: any) => next(),
  spamCheckPost: (_req: any, _res: any, next: any) => next(),
  spamCheckComment: (_req: any, _res: any, next: any) => next(),
  spamCheckReaction: (_req: any, _res: any, next: any) => next(),
  spamCheckReport: (_req: any, _res: any, next: any) => next(),
  spamCheckFollow: (_req: any, _res: any, next: any) => next(),
  spamCheckAppeal: (_req: any, _res: any, next: any) => next(),
  spamCheck: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock moderation middleware
jest.mock('../src/middleware/moderationMiddleware', () => ({
  moderatePost: (_req: any, _res: any, next: any) => next(),
}));

// Mock media validation
jest.mock('../src/middleware/mediaValidation', () => ({
  validatePostUpload: (_req: any, _res: any, next: any) => next(),
  validateReelUpload: (req: any, res: any, next: any) => {
    if (req.file && !String(req.file.mimetype).startsWith('video/')) {
      return res.status(400).json({ message: 'Reel upload must be a video file' });
    }
    return next();
  },
  validateStoryUpload: (req: any, res: any, next: any) => {
    const mime = String(req.file?.mimetype ?? '');
    if (req.file && !mime.startsWith('image/') && !mime.startsWith('video/')) {
      return res.status(400).json({ message: 'Story media must be an image or video file' });
    }
    return next();
  },
  validateAvatarUpload: (_req: any, _res: any, next: any) => next(),
  validateReelCoverUpload: (_req: any, _res: any, next: any) => next(),
  validateMultiUpload: () => (_req: any, _res: any, next: any) => next(),
  computeFileHash: jest.fn().mockReturnValue('mock-hash'),
  verifyMagicBytes: jest.fn().mockReturnValue(true),
  detectMimeFromBuffer: jest.fn().mockReturnValue('image/jpeg'),
  hasSuspiciousMetadata: jest.fn().mockReturnValue(false),
  isSvgSafe: jest.fn().mockReturnValue(true),
  validateImageDimensions: jest.fn().mockResolvedValue(true),
  ALLOWED_IMAGE_MIMES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_MIMES: ['video/mp4', 'video/webm'],
  SIZE_LIMITS: { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024 },
  DURATION_LIMITS: { reel: 60, story: 30 },
  MAX_IMAGE_DIMENSION: 4096,
}));

// Mock @octokit/rest (ESM module that Jest can't handle)
jest.mock('@octokit/rest', () => {
  const buildRepo = (owner = 'facebook', repo = 'react') => ({
    id: `${owner}/${repo}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0),
    name: repo,
    full_name: `${owner}/${repo}`,
    description: `${repo} repository`,
    stargazers_count: 42,
    forks_count: 7,
    watchers_count: 12,
    open_issues_count: 3,
    language: 'TypeScript',
    topics: ['testing', 'typescript'],
    html_url: `https://github.com/${owner}/${repo}`,
    owner: {
      login: owner,
      avatar_url: `https://avatars.test/${owner}.png`,
    },
  });

  const getRepo = jest.fn(({ owner, repo }: { owner: string; repo: string }) => {
    if (owner === 'nobody' || owner === 'nonexistent' || repo?.includes('nonexistent') || repo?.includes('fakerepo')) {
      const error: any = new Error('Not Found');
      error.status = 404;
      return Promise.reject(error);
    }
    return Promise.resolve({ data: buildRepo(owner, repo) });
  });

  const searchRepos = jest.fn(({ per_page = 10 }: { per_page?: number }) => Promise.resolve({
    data: {
      items: Array.from({ length: Math.min(Number(per_page) || 10, 10) }, (_, index) =>
        buildRepo(`owner${index + 1}`, `repo${index + 1}`)
      ),
    },
  }));

  return {
    Octokit: jest.fn().mockImplementation(() => ({
      repos: {
        get: getRepo,
        listForUser: jest.fn().mockResolvedValue({ data: [] }),
        listForAuthenticatedUser: jest.fn().mockResolvedValue({ data: [] }),
        listLanguages: jest.fn().mockResolvedValue({ data: {} }),
      },
      search: {
        repos: searchRepos,
      },
      users: {
        getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'testuser' } }),
        getByUsername: jest.fn().mockResolvedValue({ data: { id: 123, login: 'testuser' } }),
      },
      rateLimit: {
        get: jest.fn().mockResolvedValue({ data: { rate: { limit: 5000, remaining: 4999, reset: Math.floor(Date.now() / 1000) + 3600 } } }),
      },
      rest: {
        repos: { get: getRepo },
        users: { getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'testuser' } }) },
      },
    })),
  };
});

// Mock WebSocket
jest.mock('../src/websocket/socket', () => ({
  initializeSocket: jest.fn(),
  emitToUser: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
}));

// Mock DB health
jest.mock('../src/utils/dbHealth', () => ({
  checkDatabaseHealth: jest.fn().mockResolvedValue({ status: 'healthy', latency: 5 }),
}));

// ============================================================================
// Export mock instances for test assertions
// ============================================================================

export { mockPrisma, mockRedisClient };

// ============================================================================
// Cleanup
// ============================================================================

beforeEach(() => {
  // Reset all mock calls between tests
  jest.clearAllMocks();
});

afterAll(async () => {
  // Nothing to disconnect since we're using mocks
});
