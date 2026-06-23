import { generateTestTokens, TEST_USER_ID, TEST_USER_ID_2, TEST_ADMIN_ID } from './helpers';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password?: string;
  accessToken: string;
  refreshToken: string;
  verified: boolean;
  role: string;
}

export interface TestPost {
  id: string;
  userId: string;
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestComment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export interface TestConversation {
  id: string;
  participants: string[];
  createdAt: Date;
}

export interface TestWebhook {
  id: string;
  userId: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
}

/**
 * Factory functions for creating test data (works with mocked Prisma)
 */
export const testFixtures = {
  createTestUser(overrides: Partial<TestUser & { id: string }> = {}): TestUser {
    const id = overrides.id || TEST_USER_ID;
    const tokens = generateTestTokens(id);
    return {
      id,
      username: overrides.username || 'testuser',
      email: overrides.email || 'test@example.com',
      password: overrides.password || 'TestPassword123!',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      verified: overrides.verified ?? true,
      role: overrides.role || 'USER',
    };
  },

  createTestUser2(overrides: Partial<TestUser> = {}): TestUser {
    return testFixtures.createTestUser({
      id: TEST_USER_ID_2,
      username: 'testuser2',
      email: 'test2@example.com',
      ...overrides,
    });
  },

  createTestAdmin(overrides: Partial<TestUser> = {}): TestUser {
    return testFixtures.createTestUser({
      id: TEST_ADMIN_ID,
      username: 'admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      ...overrides,
    });
  },

  createTestPost(userId: string, overrides: Partial<TestPost> = {}): TestPost {
    return {
      id: overrides.id || `post-${Date.now()}`,
      userId,
      content: overrides.content || 'Test post content',
      mediaUrls: overrides.mediaUrls || [],
      hashtags: overrides.hashtags || [],
      type: overrides.type || 'TEXT',
      createdAt: overrides.createdAt || new Date(),
      updatedAt: overrides.updatedAt || new Date(),
    };
  },

  createTestComment(postId: string, userId: string, overrides: Partial<TestComment> = {}): TestComment {
    return {
      id: overrides.id || `comment-${Date.now()}`,
      postId,
      userId,
      content: overrides.content || 'Test comment',
      createdAt: overrides.createdAt || new Date(),
    };
  },

  createTestConversation(participantIds: string[], overrides: Partial<TestConversation> = {}): TestConversation {
    return {
      id: overrides.id || `conv-${Date.now()}`,
      participants: participantIds,
      createdAt: overrides.createdAt || new Date(),
    };
  },

  createTestWebhook(userId: string, overrides: Partial<TestWebhook> = {}): TestWebhook {
    return {
      id: overrides.id || `webhook-${Date.now()}`,
      userId,
      name: overrides.name || 'Test Webhook',
      url: overrides.url || 'https://example.com/webhook',
      secret: overrides.secret ?? 'test-webhook-secret',
      events: overrides.events || ['post.created'],
    };
  },

  /**
   * Create a full user record as it would come from Prisma
   */
  createPrismaUser(overrides: Record<string, any> = {}) {
    return {
      id: overrides.id || TEST_USER_ID,
      username: overrides.username || 'testuser',
      email: overrides.email || 'test@example.com',
      password: overrides.password || '$2a$10$hashedpassword',
      name: overrides.name || 'Test User',
      bio: overrides.bio || null,
      avatar: overrides.avatar || null,
      verified: overrides.verified ?? false,
      emailVerified: overrides.emailVerified ?? false,
      isPrivate: overrides.isPrivate ?? false,
      role: overrides.role || 'USER',
      twoFactorEnabled: overrides.twoFactorEnabled ?? false,
      createdAt: overrides.createdAt || new Date(),
      updatedAt: overrides.updatedAt || new Date(),
      deletedAt: overrides.deletedAt || null,
      ...overrides,
    };
  },

  /**
   * Create a full post record as it would come from Prisma
   */
  createPrismaPost(overrides: Record<string, any> = {}) {
    return {
      id: overrides.id || `post-${Date.now()}`,
      userId: overrides.userId || TEST_USER_ID,
      content: overrides.content || 'Test post content',
      mediaUrls: overrides.mediaUrls || [],
      hashtags: overrides.hashtags || [],
      type: overrides.type || 'TEXT',
      mediaType: overrides.mediaType || null,
      codeSnippet: overrides.codeSnippet || null,
      language: overrides.language || null,
      isArchived: overrides.isArchived ?? false,
      createdAt: overrides.createdAt || new Date(),
      updatedAt: overrides.updatedAt || new Date(),
      _count: overrides._count || { likes: 0, comments: 0 },
      user: overrides.user || {
        id: overrides.userId || TEST_USER_ID,
        username: 'testuser',
        avatar: null,
        verified: false,
      },
      ...overrides,
    };
  },

  /**
   * Create a Prisma comment record
   */
  createPrismaComment(overrides: Record<string, any> = {}) {
    return {
      id: overrides.id || `comment-${Date.now()}`,
      postId: overrides.postId || 'test-post-id',
      userId: overrides.userId || TEST_USER_ID,
      content: overrides.content || 'Test comment',
      parentId: overrides.parentId || null,
      createdAt: overrides.createdAt || new Date(),
      updatedAt: overrides.updatedAt || new Date(),
      user: overrides.user || {
        id: overrides.userId || TEST_USER_ID,
        username: 'testuser',
        avatar: null,
      },
      ...overrides,
    };
  },
};
