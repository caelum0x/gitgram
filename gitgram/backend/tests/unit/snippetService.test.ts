/**
 * Unit tests for snippetController
 *
 * Controllers are invoked directly with mocked req/res objects.
 * All Prisma calls are intercepted by the in-memory mock defined in tests/setup.ts.
 * No real database, network, or Express app is needed.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers';

// ---------------------------------------------------------------------------
// Import controllers after setup mocks have been registered
// ---------------------------------------------------------------------------

import {
  createSnippet,
  getSnippets,
  getSnippet,
  getTrendingSnippets,
  updateSnippet,
  deleteSnippet,
  likeSnippet,
} from '../../src/controllers/snippetController';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Snippet {
  id: string;
  userId: string;
  repositoryId: string | null;
  title: string | null;
  description: string | null;
  code: string;
  language: string | null;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Interaction {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Mock req / res factories
// ---------------------------------------------------------------------------

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<{
  userId: string;
  params: Record<string, string>;
  query: Record<string, string>;
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
// Handler invocation helpers
// ---------------------------------------------------------------------------

interface HandlerResult {
  res: any;
  error: unknown;
}

/**
 * Invoke an asyncHandler-wrapped controller and return both the mocked response
 * and any error forwarded to next(). The promise settles when res.json is called
 * (success path) or when next(err) is called (error path).
 */
async function callHandler(handler: Function, req: any): Promise<HandlerResult> {
  return new Promise((resolve) => {
    const res = makeRes();

    res.json.mockImplementation((...args: any[]) => {
      resolve({ res, error: undefined });
      return res;
    });

    handler(req, res, (err?: unknown) => {
      resolve({ res, error: err });
    });
  });
}

/**
 * Assert that calling the handler produces an ApiError with the given statusCode.
 */
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

let snippetCounter = 0;

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  snippetCounter += 1;
  return {
    id: `snippet-${snippetCounter}`,
    userId: TEST_USER_ID,
    repositoryId: null,
    title: `Snippet ${snippetCounter}`,
    description: 'A helpful code snippet',
    code: 'const x = 1;',
    language: 'typescript',
    likesCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function seedSnippet(snippet: Snippet): void {
  mockPrisma.codeSnippet.__rows.push(snippet);
}

function seedInteraction(interaction: Interaction): void {
  mockPrisma.interaction.__rows.push(interaction);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('snippetController', () => {
  beforeEach(() => {
    mockPrisma.codeSnippet.__rows.length = 0;
    mockPrisma.interaction.__rows.length = 0;
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createSnippet
  // -------------------------------------------------------------------------

  describe('createSnippet', () => {
    it('creates a snippet and responds 201 with the new record', async () => {
      const req = makeReq({
        userId: TEST_USER_ID,
        body: {
          title: 'Debounce hook',
          description: 'Reusable debounce utility',
          code: 'export function useDebounce<T>(value: T, delay: number): T { /* ... */ }',
          language: 'typescript',
        },
      });

      const { res, error } = await callHandler(createSnippet, req);

      expect(error).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(201);
      const [body] = res.json.mock.calls[0];
      expect(body).toHaveProperty('id');
      expect(body.userId).toBe(TEST_USER_ID);
      expect(body.code).toContain('useDebounce');
    });

    it('returns 400 when code field is missing', async () => {
      const req = makeReq({ body: { title: 'No code', language: 'javascript' } });
      await expectError(createSnippet, req, 400);
    });

    it('returns 400 when code is only whitespace', async () => {
      const req = makeReq({ body: { code: '   ', language: 'python' } });
      await expectError(createSnippet, req, 400);
    });

    it('creates a snippet with an associated repositoryId', async () => {
      const req = makeReq({
        body: { code: 'git log --oneline', language: 'bash', repositoryId: 'repo-abc-123' },
      });

      const { res, error } = await callHandler(createSnippet, req);

      expect(error).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(201);
      const [body] = res.json.mock.calls[0];
      expect(body.repositoryId).toBe('repo-abc-123');
    });
  });

  // -------------------------------------------------------------------------
  // getSnippets
  // -------------------------------------------------------------------------

  describe('getSnippets', () => {
    it('returns paginated snippets with default page and limit', async () => {
      seedSnippet(makeSnippet({ language: 'typescript' }));
      seedSnippet(makeSnippet({ language: 'python' }));

      const { res, error } = await callHandler(getSnippets, makeReq({ query: {} }));

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body).toHaveProperty('snippets');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('totalPages');
      expect(Array.isArray(body.snippets)).toBe(true);
      expect(body.total).toBe(2);
    });

    it('filters snippets by language', async () => {
      seedSnippet(makeSnippet({ language: 'typescript' }));
      seedSnippet(makeSnippet({ language: 'python' }));
      seedSnippet(makeSnippet({ language: 'typescript' }));

      const { res } = await callHandler(getSnippets, makeReq({ query: { language: 'typescript' } }));

      const [body] = res.json.mock.calls[0];
      expect(body.total).toBe(2);
      (body.snippets as Snippet[]).forEach((s) => {
        expect(s.language).toBe('typescript');
      });
    });

    it('filters snippets by userId', async () => {
      seedSnippet(makeSnippet({ userId: TEST_USER_ID }));
      seedSnippet(makeSnippet({ userId: TEST_USER_ID_2 }));
      seedSnippet(makeSnippet({ userId: TEST_USER_ID }));

      const { res } = await callHandler(getSnippets, makeReq({ query: { userId: TEST_USER_ID } }));

      const [body] = res.json.mock.calls[0];
      expect(body.total).toBe(2);
    });

    it('applies pagination: page 2 with limit 2 returns 2 records', async () => {
      for (let i = 0; i < 5; i++) {
        seedSnippet(makeSnippet());
      }

      const { res } = await callHandler(
        getSnippets,
        makeReq({ query: { page: '2', limit: '2' } })
      );

      const [body] = res.json.mock.calls[0];
      expect(body.page).toBe(2);
      expect(body.snippets.length).toBe(2);
      expect(body.totalPages).toBe(3);
    });

    it('returns empty array and total 0 when no snippets exist', async () => {
      const { res } = await callHandler(getSnippets, makeReq({ query: {} }));

      const [body] = res.json.mock.calls[0];
      expect(body.snippets).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSnippet
  // -------------------------------------------------------------------------

  describe('getSnippet', () => {
    it('returns a snippet by id', async () => {
      const snippet = makeSnippet({ id: 'snip-get-001' });
      seedSnippet(snippet);

      const { res, error } = await callHandler(
        getSnippet,
        makeReq({ params: { id: 'snip-get-001' } })
      );

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body.id).toBe('snip-get-001');
      expect(body.code).toBe(snippet.code);
    });

    it('returns 404 when snippet does not exist', async () => {
      await expectError(getSnippet, makeReq({ params: { id: 'does-not-exist' } }), 404);
    });
  });

  // -------------------------------------------------------------------------
  // getTrendingSnippets
  // -------------------------------------------------------------------------

  describe('getTrendingSnippets', () => {
    it('calls findMany with likesCount desc ordering and returns the sorted list', async () => {
      const high = makeSnippet({ id: 'snip-high', likesCount: 99 });
      const mid = makeSnippet({ id: 'snip-mid', likesCount: 50 });
      const low = makeSnippet({ id: 'snip-low', likesCount: 3 });

      // The in-memory mock does not support multi-field array orderBy; provide
      // pre-sorted data so we can assert on both the response order and the
      // arguments the controller passed to findMany.
      mockPrisma.codeSnippet.findMany.mockResolvedValueOnce([high, mid, low]);

      const { res, error } = await callHandler(getTrendingSnippets, makeReq({ query: {} }));

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].id).toBe('snip-high');
      expect(body[1].id).toBe('snip-mid');
      expect(body[2].id).toBe('snip-low');

      const findManyCall = mockPrisma.codeSnippet.findMany.mock.calls[0][0];
      expect(findManyCall.orderBy).toEqual([{ likesCount: 'desc' }, { createdAt: 'desc' }]);
    });

    it('limits results to 10 by default', async () => {
      mockPrisma.codeSnippet.findMany.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => makeSnippet({ id: `trend-${i}`, likesCount: i }))
      );

      await callHandler(getTrendingSnippets, makeReq({ query: {} }));

      const findManyCall = mockPrisma.codeSnippet.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(10);
    });

    it('filters trending snippets by language', async () => {
      seedSnippet(makeSnippet({ language: 'go', likesCount: 100 }));

      const { res } = await callHandler(
        getTrendingSnippets,
        makeReq({ query: { language: 'go' } })
      );

      const [body] = res.json.mock.calls[0];
      expect(body.length).toBe(1);
      expect(body[0].language).toBe('go');
    });
  });

  // -------------------------------------------------------------------------
  // updateSnippet
  // -------------------------------------------------------------------------

  describe('updateSnippet', () => {
    it('allows the owner to update their snippet', async () => {
      const snippet = makeSnippet({ id: 'snip-upd-001', userId: TEST_USER_ID });
      seedSnippet(snippet);

      const req = makeReq({
        userId: TEST_USER_ID,
        params: { id: 'snip-upd-001' },
        body: { title: 'Updated title', code: 'const updated = true;' },
      });

      const { res, error } = await callHandler(updateSnippet, req);

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body.title).toBe('Updated title');
    });

    it('returns 403 when a different user tries to update', async () => {
      const snippet = makeSnippet({ id: 'snip-upd-002', userId: TEST_USER_ID });
      seedSnippet(snippet);

      const req = makeReq({
        userId: TEST_USER_ID_2,
        params: { id: 'snip-upd-002' },
        body: { title: 'Hijacked title' },
      });
      await expectError(updateSnippet, req, 403);
    });

    it('returns 404 when the target snippet does not exist', async () => {
      const req = makeReq({
        userId: TEST_USER_ID,
        params: { id: 'nonexistent-snip' },
        body: { title: 'Whatever' },
      });
      await expectError(updateSnippet, req, 404);
    });
  });

  // -------------------------------------------------------------------------
  // deleteSnippet
  // -------------------------------------------------------------------------

  describe('deleteSnippet', () => {
    it('allows the owner to delete their snippet', async () => {
      const snippet = makeSnippet({ id: 'snip-del-001', userId: TEST_USER_ID });
      seedSnippet(snippet);

      const req = makeReq({ userId: TEST_USER_ID, params: { id: 'snip-del-001' } });
      const { res, error } = await callHandler(deleteSnippet, req);

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body.deleted).toBe(true);
    });

    it('returns 403 when a non-owner tries to delete', async () => {
      const snippet = makeSnippet({ id: 'snip-del-002', userId: TEST_USER_ID });
      seedSnippet(snippet);

      const req = makeReq({ userId: TEST_USER_ID_2, params: { id: 'snip-del-002' } });
      await expectError(deleteSnippet, req, 403);
    });

    it('returns 404 when deleting a non-existent snippet', async () => {
      const req = makeReq({ userId: TEST_USER_ID, params: { id: 'ghost-snip-999' } });
      await expectError(deleteSnippet, req, 404);
    });
  });

  // -------------------------------------------------------------------------
  // likeSnippet (toggle)
  // -------------------------------------------------------------------------

  describe('likeSnippet', () => {
    it('likes a snippet and returns liked: true on first call', async () => {
      seedSnippet(makeSnippet({ id: 'snip-like-001', likesCount: 0 }));

      const { res, error } = await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID, params: { id: 'snip-like-001' } })
      );

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body.liked).toBe(true);
    });

    it('unlikes and returns liked: false when interaction already exists (toggle off)', async () => {
      seedSnippet(makeSnippet({ id: 'snip-like-002', likesCount: 1 }));
      seedInteraction({
        id: 'interaction-001',
        userId: TEST_USER_ID,
        contentType: 'SNIPPET',
        contentId: 'snip-like-002',
        type: 'like',
      });

      const { res, error } = await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID, params: { id: 'snip-like-002' } })
      );

      expect(error).toBeUndefined();
      const [body] = res.json.mock.calls[0];
      expect(body.liked).toBe(false);
    });

    it('decrements likesCount when toggling off', async () => {
      seedSnippet(makeSnippet({ id: 'snip-like-003', likesCount: 5 }));
      seedInteraction({
        id: 'interaction-002',
        userId: TEST_USER_ID,
        contentType: 'SNIPPET',
        contentId: 'snip-like-003',
        type: 'like',
      });

      await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID, params: { id: 'snip-like-003' } })
      );

      const updateCall = mockPrisma.codeSnippet.update.mock.calls[0][0];
      expect(updateCall.data.likesCount).toEqual({ decrement: 1 });
    });

    it('increments likesCount when toggling on', async () => {
      seedSnippet(makeSnippet({ id: 'snip-like-004', likesCount: 0 }));

      await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID, params: { id: 'snip-like-004' } })
      );

      const updateCall = mockPrisma.codeSnippet.update.mock.calls[0][0];
      expect(updateCall.data.likesCount).toEqual({ increment: 1 });
    });

    it('allows two different users to like the same snippet independently', async () => {
      seedSnippet(makeSnippet({ id: 'snip-like-005', likesCount: 0 }));

      const { res: res1 } = await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID, params: { id: 'snip-like-005' } })
      );
      const { res: res2 } = await callHandler(
        likeSnippet,
        makeReq({ userId: TEST_USER_ID_2, params: { id: 'snip-like-005' } })
      );

      expect(res1.json.mock.calls[0][0].liked).toBe(true);
      expect(res2.json.mock.calls[0][0].liked).toBe(true);
    });
  });
});
