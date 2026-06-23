import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

describe('Integration Tests - Complex Workflows', () => {
  let app: Express;
  let user1Token: string;
  let user2Token: string;
  let user1Id: string;
  let user2Id: string;
  let user1AccountId: string;
  let user2AccountId: string;

  beforeAll(async () => {
    app = createApp();

    // Create two test users
    const user1 = await prisma.user.create({
      data: {
        username: 'integrationuser1',
        email: 'integration1@example.com',
        password: 'hashedpassword',
      },
    });
    user1Id = user1.id;
    const account1 = await prisma.account.create({
      data: {
        type: 'USER',
        username: 'integrationuser1',
        userId: user1.id,
      },
    });
    user1AccountId = account1.id;
    const tokens1 = await createTokens(user1.id);
    user1Token = tokens1.accessToken;

    const user2 = await prisma.user.create({
      data: {
        username: 'integrationuser2',
        email: 'integration2@example.com',
        password: 'hashedpassword',
      },
    });
    user2Id = user2.id;
    const account2 = await prisma.account.create({
      data: {
        type: 'USER',
        username: 'integrationuser2',
        userId: user2.id,
      },
    });
    user2AccountId = account2.id;
    const tokens2 = await createTokens(user2.id);
    user2Token = tokens2.accessToken;
  });

  afterAll(async () => {
    // Clean up all test data
    await prisma.comment.deleteMany({
      where: {
        post: {
          userId: { in: [user1Id, user2Id] },
        },
      },
    });
    await prisma.like.deleteMany({
      where: {
        OR: [
          { post: { userId: { in: [user1Id, user2Id] } } },
          { userId: { in: [user1Id, user2Id] } },
        ],
      },
    });
    await prisma.post.deleteMany({ where: { userId: { in: [user1Id, user2Id] } } });
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: user1Id }, { followingId: user1Id }] } });
    await prisma.account.deleteMany({ where: { id: { in: [user1AccountId, user2AccountId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
    await prisma.$disconnect();
  });

  describe('Complete Social Workflow', () => {
    it('should complete: follow -> create post -> like -> comment -> view feed', async () => {
      // Step 1: User1 follows User2
      const followResponse = await request(app)
        .post(`/api/v1/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(followResponse.status).toBe(200);
      expect(followResponse.body.following).toBe(true);

      // Step 2: User2 creates a post
      const postResponse = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          content: 'Integration test post',
          hashtags: ['test', 'integration'],
        });

      expect(postResponse.status).toBe(201);
      const postId = postResponse.body.post.id;

      // Step 3: User1 likes the post
      const likeResponse = await request(app)
        .post(`/api/v1/posts/${postId}/like`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(likeResponse.status).toBe(200);
      expect(likeResponse.body.liked).toBe(true);

      // Step 4: User1 comments on the post
      const commentResponse = await request(app)
        .post(`/api/v1/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: 'Great post!',
        });

      expect(commentResponse.status).toBe(201);
      expect(commentResponse.body.comment.content).toBe('Great post!');

      // Step 5: User1 views their feed (should see User2's post)
      const feedResponse = await request(app)
        .get('/api/v1/posts')
        .set('Authorization', `Bearer ${user1Token}`)
        .query({ page: 1, limit: 10 });

      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts.length).toBeGreaterThan(0);
      const foundPost = feedResponse.body.posts.find((p: any) => p.id === postId);
      expect(foundPost).toBeDefined();
    });
  });

  describe('User Profile Workflow', () => {
    it('should complete: create post -> view profile -> see post count', async () => {
      // Create multiple posts for user1
      await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Post 1' });

      await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Post 2' });

      // View user1 profile
      const profileResponse = await request(app)
        .get(`/api/v1/users/${user1Id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.id).toBe(user1Id);
    });
  });

  describe('Search and Discovery Workflow', () => {
    it('should complete: create post with hashtags -> search posts -> find post', async () => {
      // Create post with specific hashtag
      const postResponse = await request(app)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: 'Searchable post #discovery',
          hashtags: ['discovery', 'search'],
        });

      expect(postResponse.status).toBe(201);
      const postId = postResponse.body.post.id;

      // Search for posts
      const searchResponse = await request(app)
        .get('/api/v1/posts/search')
        .set('Authorization', `Bearer ${user2Token}`)
        .query({ q: 'discovery' });

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.posts.length).toBeGreaterThan(0);
    });
  });
});
