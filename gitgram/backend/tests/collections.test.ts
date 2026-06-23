import request from 'supertest';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';
import { testFixtures } from './fixtures';
import { generateTestAccessToken, authHeader, TEST_USER_ID } from './helpers';

// Mock websocket
jest.mock('../src/websocket/socket', () => ({
  initializeSocket: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  emitToUser: jest.fn(),
}));

// Helper to create mock Prisma model (mirrors setup.ts)
const createMockPrismaModel = () => ({
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() })
  ),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  update: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'mock-id', ...data, updatedAt: new Date() })
  ),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockImplementation(({ create }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() })
  ),
  delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  count: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 } }),
  groupBy: jest.fn().mockResolvedValue([]),
});

// Ensure models used by collectionsController exist on mockPrisma
if (!mockPrisma.savedCollection) mockPrisma.savedCollection = createMockPrismaModel();
if (!mockPrisma.savedPostCollection) mockPrisma.savedPostCollection = createMockPrismaModel();

describe('Collections API', () => {
  const app = createApp();
  let token: string;

  const mockAccount = {
    id: 'account-1',
    userId: TEST_USER_ID,
    type: 'USER',
    username: 'testuser',
  };

  beforeEach(() => {
    token = generateTestAccessToken(TEST_USER_ID);
    // Reset savedCollection and savedPostCollection mocks between tests
    jest.clearAllMocks();
    // Restore default mock implementations after clearAllMocks
    mockPrisma.savedCollection.findFirst.mockResolvedValue(null);
    mockPrisma.savedCollection.findMany.mockResolvedValue([]);
    mockPrisma.savedCollection.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `coll-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() })
    );
    mockPrisma.savedCollection.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'mock-id', ...data, updatedAt: new Date() })
    );
    mockPrisma.savedCollection.delete.mockResolvedValue({ id: 'mock-id' });
    mockPrisma.savedCollection.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.savedPostCollection.upsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: `spc-${Date.now()}`, ...create, createdAt: new Date() })
    );
    mockPrisma.savedPostCollection.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.savedPost.findFirst.mockResolvedValue(null);
    mockPrisma.savedPost.findMany.mockResolvedValue([]);
    mockPrisma.savedPost.count.mockResolvedValue(0);
    mockPrisma.savedPost.upsert.mockImplementation(({ create }: any) =>
      Promise.resolve({ id: `sp-${Date.now()}`, ...create })
    );
    mockPrisma.savedPost.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'mock-id', ...data })
    );
    mockPrisma.savedPost.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.account.findFirst.mockResolvedValue(mockAccount);
    mockPrisma.post.findUnique.mockResolvedValue(null);
  });

  // =========================================================================
  // POST /api/v1/collections
  // =========================================================================
  describe('POST /api/v1/collections', () => {
    it('should create a new collection', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(mockAccount);
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.savedCollection.create.mockResolvedValue({
        id: 'coll-1',
        userId: TEST_USER_ID,
        accountId: mockAccount.id,
        name: 'My Collection',
        description: 'Test description',
        coverImage: null,
        isPrivate: true,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/collections')
        .set('Authorization', authHeader(token))
        .send({
          name: 'My Collection',
          description: 'Test description',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', 'My Collection');
      expect(res.body).toHaveProperty('isDefault', false);
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/collections')
        .set('Authorization', authHeader(token))
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when name is empty', async () => {
      const res = await request(app)
        .post('/api/v1/collections')
        .set('Authorization', authHeader(token))
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for reserved name "All Saved"', async () => {
      const res = await request(app)
        .post('/api/v1/collections')
        .set('Authorization', authHeader(token))
        .send({ name: 'All Saved' });

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate collection name', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(mockAccount);
      // Simulate existing collection with same name
      mockPrisma.savedCollection.findFirst.mockResolvedValue({
        id: 'existing-coll',
        userId: TEST_USER_ID,
        name: 'Existing Collection',
      });

      const res = await request(app)
        .post('/api/v1/collections')
        .set('Authorization', authHeader(token))
        .send({ name: 'Existing Collection' });

      expect(res.status).toBe(409);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/collections')
        .send({ name: 'My Collection' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/collections
  // =========================================================================
  describe('GET /api/v1/collections', () => {
    it('should return all user collections', async () => {
      const mockCollections = [
        {
          id: 'coll-default',
          userId: TEST_USER_ID,
          name: 'All Saved',
          isDefault: true,
          isPrivate: true,
          posts: [],
          _count: { posts: 0, savedPostLinks: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'coll-1',
          userId: TEST_USER_ID,
          name: 'Frontend',
          isDefault: false,
          isPrivate: true,
          posts: [],
          _count: { posts: 3, savedPostLinks: 1 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // ensureDefaultCollection call
      mockPrisma.savedCollection.findFirst.mockResolvedValue({ id: 'coll-default', isDefault: true });
      mockPrisma.savedPost.count.mockResolvedValue(10);
      mockPrisma.savedCollection.findMany.mockResolvedValue(mockCollections);

      const res = await request(app)
        .get('/api/v1/collections')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/collections');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/collections/:id
  // =========================================================================
  describe('GET /api/v1/collections/:id', () => {
    it('should return a collection by id', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'My Collection',
        description: 'A test collection',
        isDefault: false,
        isPrivate: true,
        _count: { posts: 5, savedPostLinks: 2 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.savedCollection.findFirst
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/v1/collections/coll-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'My Collection');
      expect(res.body).toHaveProperty('postCount', 7); // 5 + 2
    });

    it('should return 404 for non-existent collection', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/collections/nonexistent')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/collections/coll-1');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/collections/:id/posts  (add post to collection)
  // =========================================================================
  describe('POST /api/v1/collections/:id/posts', () => {
    it('should add a post to a collection', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'Frontend',
        isDefault: false,
      };

      const mockPost = testFixtures.createPrismaPost({ id: 'post-1' });

      mockPrisma.savedCollection.findFirst
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);
      mockPrisma.post.findUnique.mockResolvedValue(mockPost);
      mockPrisma.savedPost.upsert.mockResolvedValue({
        id: 'sp-1',
        userId: TEST_USER_ID,
        postId: 'post-1',
      });
      mockPrisma.savedPostCollection.upsert.mockResolvedValue({
        id: 'spc-1',
        savedPostId: 'sp-1',
        collectionId: 'coll-1',
      });
      mockPrisma.savedCollection.update.mockResolvedValue(mockCollection);

      const res = await request(app)
        .post('/api/v1/collections/coll-1/posts')
        .set('Authorization', authHeader(token))
        .send({ postId: 'post-1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Post added to collection');
    });

    it('should return 400 when postId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/collections/coll-1/posts')
        .set('Authorization', authHeader(token))
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when collection does not exist', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/collections/nonexistent/posts')
        .set('Authorization', authHeader(token))
        .send({ postId: 'post-1' });

      expect(res.status).toBe(404);
    });

    it('should return 404 when post does not exist', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue({
        id: 'coll-1',
        userId: TEST_USER_ID,
      });
      mockPrisma.post.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/collections/coll-1/posts')
        .set('Authorization', authHeader(token))
        .send({ postId: 'nonexistent-post' });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/collections/coll-1/posts')
        .send({ postId: 'post-1' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/collections/:id/posts/:postId  (remove post from collection)
  // =========================================================================
  describe('DELETE /api/v1/collections/:id/posts/:postId', () => {
    it('should remove a post from a collection', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'Frontend',
      };

      const mockSavedPost = {
        id: 'sp-1',
        userId: TEST_USER_ID,
        postId: 'post-1',
        collectionId: 'coll-1',
      };

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockCollection);
      mockPrisma.savedPost.findFirst.mockResolvedValue(mockSavedPost);
      mockPrisma.savedPostCollection.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.savedPost.update.mockResolvedValue({ ...mockSavedPost, collectionId: null });

      const res = await request(app)
        .delete('/api/v1/collections/coll-1/posts/post-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Post removed from collection');
    });

    it('should return 404 when collection does not exist', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/collections/nonexistent/posts/post-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should return 404 when saved post is not found', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue({
        id: 'coll-1',
        userId: TEST_USER_ID,
      });
      mockPrisma.savedPost.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/collections/coll-1/posts/nonexistent')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .delete('/api/v1/collections/coll-1/posts/post-1');

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/collections/:id
  // =========================================================================
  describe('DELETE /api/v1/collections/:id', () => {
    it('should delete a collection', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'Frontend',
        isDefault: false,
      };

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockCollection);
      // $transaction mock from setup.ts handles the array case
      mockPrisma.savedPost.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.savedCollection.delete.mockResolvedValue(mockCollection);

      const res = await request(app)
        .delete('/api/v1/collections/coll-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Collection deleted successfully');
    });

    it('should return 400 when trying to delete the default collection', async () => {
      const mockDefaultCollection = {
        id: 'coll-default',
        userId: TEST_USER_ID,
        name: 'All Saved',
        isDefault: true,
      };

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockDefaultCollection);

      const res = await request(app)
        .delete('/api/v1/collections/coll-default')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
    });

    it('should return 404 when collection does not exist', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/collections/nonexistent')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/collections/coll-1');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // PUT /api/v1/collections/:id  (update collection)
  // =========================================================================
  describe('PUT /api/v1/collections/:id', () => {
    it('should update a collection', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'Frontend',
        description: 'Old description',
        isDefault: false,
      };

      mockPrisma.savedCollection.findFirst
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);
      mockPrisma.savedCollection.update.mockResolvedValue({
        ...mockCollection,
        name: 'Updated Name',
        description: 'New description',
      });

      const res = await request(app)
        .put('/api/v1/collections/coll-1')
        .set('Authorization', authHeader(token))
        .send({ name: 'Updated Name', description: 'New description' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', 'Updated Name');
    });

    it('should return 404 for non-existent collection', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/collections/nonexistent')
        .set('Authorization', authHeader(token))
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when trying to rename the default collection', async () => {
      const mockDefaultCollection = {
        id: 'coll-default',
        userId: TEST_USER_ID,
        name: 'All Saved',
        isDefault: true,
      };

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockDefaultCollection);

      const res = await request(app)
        .put('/api/v1/collections/coll-default')
        .set('Authorization', authHeader(token))
        .send({ name: 'New Name' });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/collections/coll-1')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/collections/:id/posts  (get collection posts)
  // =========================================================================
  describe('GET /api/v1/collections/:id/posts', () => {
    it('should return posts in a non-default collection', async () => {
      const mockCollection = {
        id: 'coll-1',
        userId: TEST_USER_ID,
        name: 'Frontend',
        isDefault: false,
      };

      const mockDirectPosts = [
        {
          id: 'sp-1',
          userId: TEST_USER_ID,
          postId: 'post-1',
          collectionId: 'coll-1',
          savedAt: new Date(),
          post: {
            id: 'post-1',
            content: 'A frontend post',
            user: { id: 'user-1', username: 'dev', avatar: null, verified: false },
            _count: { likes: 5, comments: 2 },
          },
        },
      ];

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockCollection);
      mockPrisma.savedPost.findMany.mockResolvedValue(mockDirectPosts);
      mockPrisma.savedPostCollection.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/collections/coll-1/posts')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('collection');
      expect(res.body).toHaveProperty('posts');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return all saved posts for default collection', async () => {
      const mockDefaultCollection = {
        id: 'coll-default',
        userId: TEST_USER_ID,
        name: 'All Saved',
        isDefault: true,
      };

      mockPrisma.savedCollection.findFirst.mockResolvedValue(mockDefaultCollection);
      mockPrisma.savedPost.findMany.mockResolvedValue([]);
      mockPrisma.savedPost.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/collections/coll-default/posts')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('collection');
      expect(res.body).toHaveProperty('posts');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return 404 for non-existent collection', async () => {
      mockPrisma.savedCollection.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/collections/nonexistent/posts')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/collections/coll-1/posts');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/collections/saved  (all saved posts)
  // =========================================================================
  describe('GET /api/v1/collections/saved', () => {
    it('should return all saved posts', async () => {
      mockPrisma.savedPost.findMany.mockResolvedValue([]);
      mockPrisma.savedPost.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/collections/saved')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('posts');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/collections/saved');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/collections/check/:postId  (check if post is saved)
  // =========================================================================
  describe('GET /api/v1/collections/check/:postId', () => {
    it('should return saved status for a post', async () => {
      mockPrisma.savedPost.findFirst.mockResolvedValue({
        id: 'sp-1',
        userId: TEST_USER_ID,
        postId: 'post-1',
        savedAt: new Date(),
        collections: [
          { collection: { id: 'coll-1', name: 'Frontend' } },
        ],
      });

      const res = await request(app)
        .get('/api/v1/collections/check/post-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isSaved', true);
      expect(res.body.savedPost).toHaveProperty('collections');
    });

    it('should return isSaved=false for unsaved post', async () => {
      mockPrisma.savedPost.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/collections/check/post-2')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isSaved', false);
      expect(res.body.savedPost).toBeNull();
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/collections/check/post-1');
      expect(res.status).toBe(401);
    });
  });
});
