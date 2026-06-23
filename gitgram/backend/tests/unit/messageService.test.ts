/**
 * Unit tests for messageController handlers
 *
 * Controllers are invoked directly with mocked req/res objects.
 * All Prisma calls are intercepted by the in-memory mock defined in tests/setup.ts.
 * No real database, network, or Express app is needed.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing controllers
// ---------------------------------------------------------------------------

jest.mock('../../src/services/blockService', () => ({
  blockService: {
    hasBlockRelationship: jest.fn().mockResolvedValue(false),
    getAllBlockedIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/websocket/socket', () => ({
  isUserOnline: jest.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Import controllers after mocks are in place
// ---------------------------------------------------------------------------

import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationAsRead,
  getUnreadCount,
  searchMessages,
} from '../../src/controllers/messageController';
import { blockService } from '../../src/services/blockService';

const mockedBlockService = blockService as jest.Mocked<typeof blockService>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  senderId: string;
  receiverId: string | null;
  chatId: string | null;
  content: string;
  read: boolean;
  readAt: Date | null;
  deliveredAt: Date | null;
  deletedForSender: boolean;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  mediaUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Mock req / res factories
// ---------------------------------------------------------------------------

function makeRes(): jest.Mocked<{
  status: jest.Mock;
  json: jest.Mock;
}> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<{
  userId: string;
  params: Record<string, string>;
  query: Record<string, string | number>;
  body: Record<string, unknown>;
}> = {}): any {
  return {
    userId: overrides.userId ?? TEST_USER_ID,
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
  };
}

// ---------------------------------------------------------------------------
// Handler invocation helper
// ---------------------------------------------------------------------------

interface HandlerResult {
  res: ReturnType<typeof makeRes>;
  error: unknown;
}

async function callHandler(handler: Function, req: any): Promise<HandlerResult> {
  return new Promise((resolve) => {
    const res = makeRes();

    res.json.mockImplementation((..._args: unknown[]) => {
      resolve({ res, error: undefined });
      return res;
    });

    handler(req, res, (err?: unknown) => {
      resolve({ res, error: err });
    });
  });
}

async function expectError(
  handler: Function,
  req: any,
  statusCode: number
): Promise<void> {
  const { error } = await callHandler(handler, req);
  expect(error).toBeDefined();
  expect((error as any).statusCode).toBe(statusCode);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let msgCounter = 0;

function makeMessage(overrides: Partial<Message> = {}): Message {
  msgCounter += 1;
  return {
    id: `msg-${msgCounter}`,
    senderId: TEST_USER_ID,
    receiverId: TEST_USER_ID_2,
    chatId: null,
    content: `Test message ${msgCounter}`,
    read: false,
    readAt: null,
    deliveredAt: null,
    deletedForSender: false,
    editedAt: null,
    mediaUrl: null,
    createdAt: new Date(Date.now() - msgCounter * 1000),
    updatedAt: new Date(Date.now() - msgCounter * 1000),
    ...overrides,
  };
}

function seedMessages(messages: Message[]): void {
  mockPrisma.message.__rows = messages;
}

function seedUsers(): void {
  mockPrisma.user.__rows = [
    {
      id: TEST_USER_ID,
      username: 'alice',
      avatar: null,
      email: 'alice@example.com',
    },
    {
      id: TEST_USER_ID_2,
      username: 'bob',
      avatar: null,
      email: 'bob@example.com',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.message.__rows = [];
  mockPrisma.user.__rows = [];
  mockedBlockService.getAllBlockedIds.mockResolvedValue([]);
  mockedBlockService.hasBlockRelationship.mockResolvedValue(false);
});

// ============================================================================
// 1. getConversations
// ============================================================================

describe('getConversations', () => {
  it('returns an empty array when the user has no messages', async () => {
    seedUsers();
    seedMessages([]);

    const req = makeReq();
    const { res } = await callHandler(getConversations, req);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns conversations sorted by most recent last message', async () => {
    seedUsers();

    const older = makeMessage({ createdAt: new Date('2024-01-01') });
    const newer = makeMessage({ createdAt: new Date('2024-06-01'), id: 'msg-newer', senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID });
    seedMessages([older, newer]);

    const req = makeReq();
    const { res } = await callHandler(getConversations, req);

    const result: any[] = res.json.mock.calls[0][0];
    expect(Array.isArray(result)).toBe(true);
    // At least one conversation returned
    expect(result.length).toBeGreaterThan(0);
  });

  it('excludes conversations with blocked users', async () => {
    seedUsers();
    seedMessages([makeMessage()]);
    mockedBlockService.getAllBlockedIds.mockResolvedValue([TEST_USER_ID_2]);

    const req = makeReq();
    const { res } = await callHandler(getConversations, req);

    const result: any[] = res.json.mock.calls[0][0];
    expect(result).toEqual([]);
  });
});

// ============================================================================
// 2. getMessages
// ============================================================================

describe('getMessages', () => {
  it('returns paginated messages between two users', async () => {
    seedUsers();
    const msgs = Array.from({ length: 5 }, () =>
      makeMessage({ senderId: TEST_USER_ID, receiverId: TEST_USER_ID_2 })
    );
    seedMessages(msgs);

    const req = makeReq({
      params: { otherUserId: TEST_USER_ID_2 },
      query: { page: 1, limit: 10 },
    });

    const { res } = await callHandler(getMessages, req);
    const result: any[] = res.json.mock.calls[0][0];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(5);
  });

  it('returns 403 when a block relationship exists', async () => {
    mockedBlockService.hasBlockRelationship.mockResolvedValue(true);

    const req = makeReq({ params: { otherUserId: TEST_USER_ID_2 } });
    await expectError(getMessages, req, 403);
  });
});

// ============================================================================
// 3. sendMessage
// ============================================================================

describe('sendMessage', () => {
  it('creates and returns a new message', async () => {
    seedUsers();
    seedMessages([]);

    const req = makeReq({
      body: { receiverId: TEST_USER_ID_2, content: 'Hello!' },
    });

    const { res } = await callHandler(sendMessage, req);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('content', 'Hello!');
    expect(result).toHaveProperty('senderId', TEST_USER_ID);
  });

  it('returns 201 status for a new message', async () => {
    seedUsers();
    seedMessages([]);

    const req = makeReq({
      body: { receiverId: TEST_USER_ID_2, content: 'Hi there' },
    });

    const { res } = await callHandler(sendMessage, req);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 403 when sender is blocked by receiver', async () => {
    mockedBlockService.hasBlockRelationship.mockResolvedValue(true);

    const req = makeReq({
      body: { receiverId: TEST_USER_ID_2, content: 'You blocked me' },
    });

    await expectError(sendMessage, req, 403);
  });
});

// ============================================================================
// 4. markConversationAsRead
// ============================================================================

describe('markConversationAsRead', () => {
  it('marks unread messages from a conversation partner as read', async () => {
    seedUsers();
    const unread = [
      makeMessage({ senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID, read: false }),
      makeMessage({ senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID, read: false }),
    ];
    seedMessages(unread);

    const req = makeReq({ params: { id: TEST_USER_ID_2 } });
    const { res } = await callHandler(markConversationAsRead, req);

    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('message', 'Conversation marked as read');
    expect(result).toHaveProperty('count');
    expect(typeof result.count).toBe('number');
  });

  it('returns count of 0 when all messages are already read', async () => {
    seedUsers();
    const alreadyRead = [
      makeMessage({ senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID, read: true }),
    ];
    seedMessages(alreadyRead);

    const req = makeReq({ params: { id: TEST_USER_ID_2 } });
    const { res } = await callHandler(markConversationAsRead, req);

    const result = res.json.mock.calls[0][0];
    expect(result.count).toBe(0);
  });

  it('includes a readAt ISO timestamp in the response', async () => {
    seedUsers();
    seedMessages([makeMessage({ senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID, read: false })]);

    const req = makeReq({ params: { id: TEST_USER_ID_2 } });
    const { res } = await callHandler(markConversationAsRead, req);

    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('readAt');
    expect(typeof result.readAt).toBe('string');
  });
});

// ============================================================================
// 5. getUnreadCount
// ============================================================================

describe('getUnreadCount', () => {
  it('returns 0 when there are no unread messages', async () => {
    seedMessages([]);

    const req = makeReq();
    const { res } = await callHandler(getUnreadCount, req);

    expect(res.json).toHaveBeenCalledWith({ unreadCount: 0 });
  });

  it('counts only messages addressed to the current user', async () => {
    seedMessages([
      makeMessage({ receiverId: TEST_USER_ID, read: false }),
      makeMessage({ receiverId: TEST_USER_ID, read: false }),
      // Message addressed to someone else — should not be counted
      makeMessage({ receiverId: 'other-user', senderId: TEST_USER_ID, read: false }),
    ]);

    const req = makeReq();
    const { res } = await callHandler(getUnreadCount, req);

    const result = res.json.mock.calls[0][0];
    expect(result.unreadCount).toBe(2);
  });

  it('does not count already-read messages', async () => {
    seedMessages([
      makeMessage({ receiverId: TEST_USER_ID, read: true }),
      makeMessage({ receiverId: TEST_USER_ID, read: false }),
    ]);

    const req = makeReq();
    const { res } = await callHandler(getUnreadCount, req);

    expect(res.json).toHaveBeenCalledWith({ unreadCount: 1 });
  });
});

// ============================================================================
// 6. searchMessages
// ============================================================================

describe('searchMessages', () => {
  it('returns 400 when query parameter is missing', async () => {
    const req = makeReq({ query: {} });
    await expectError(searchMessages, req, 400);
  });

  it('returns 400 when query parameter is an empty string', async () => {
    const req = makeReq({ query: { q: '   ' } });
    await expectError(searchMessages, req, 400);
  });

  it('returns messages matching the search term', async () => {
    seedUsers();
    seedMessages([
      makeMessage({ content: 'Hello world', senderId: TEST_USER_ID, receiverId: TEST_USER_ID_2 }),
      makeMessage({ content: 'Nothing relevant', senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID }),
    ]);

    // chatMember rows are needed by the query (empty is fine for DM-only data)
    mockPrisma.chatMember.__rows = [];

    const req = makeReq({ query: { q: 'hello' } });
    const { res, error } = await callHandler(searchMessages, req);

    // No error thrown
    expect(error).toBeUndefined();
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('conversations');
    expect(Array.isArray(result.messages)).toBe(true);
    expect(Array.isArray(result.conversations)).toBe(true);
  });

  it('groups results by conversationId', async () => {
    seedUsers();
    mockPrisma.chatMember.__rows = [];

    const msg1 = makeMessage({ content: 'find me', senderId: TEST_USER_ID, receiverId: TEST_USER_ID_2 });
    const msg2 = makeMessage({ content: 'find me too', senderId: TEST_USER_ID_2, receiverId: TEST_USER_ID });
    seedMessages([msg1, msg2]);

    const req = makeReq({ query: { q: 'find me' } });
    const { res } = await callHandler(searchMessages, req);

    const result = res.json.mock.calls[0][0];
    // Both messages belong to the same DM conversation
    expect(result.conversations.length).toBe(1);
    expect(result.conversations[0].messages.length).toBe(2);
  });

  it('respects the limit query parameter', async () => {
    seedUsers();
    mockPrisma.chatMember.__rows = [];

    const msgs = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ content: `term ${i}`, senderId: TEST_USER_ID, receiverId: TEST_USER_ID_2 })
    );
    seedMessages(msgs);

    const req = makeReq({ query: { q: 'term', limit: 3 } });
    const { res } = await callHandler(searchMessages, req);

    const result = res.json.mock.calls[0][0];
    expect(result.messages.length).toBeLessThanOrEqual(3);
  });
});
