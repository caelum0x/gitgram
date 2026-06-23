import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';
import * as webhookService from '../src/services/webhookService';
import crypto from 'crypto';

// Mock axios for webhook delivery tests
jest.mock('axios', () => ({
  post: jest.fn(),
}));

import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;
const getResponseMessage = (body: any) =>
  body.error?.message ?? body.details?.[0]?.msg ?? body.error ?? body.message;

describe('Webhook API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();

    // Create a test user
    const user = await prisma.user.create({
      data: {
        username: `webhook_test_${Date.now()}`,
        email: `webhook-test-${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.webhookDelivery.deleteMany({
      where: { webhook: { userId } },
    });
    await prisma.userWebhook.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up webhooks after each test
    await prisma.webhookDelivery.deleteMany({
      where: { webhook: { userId } },
    });
    await prisma.userWebhook.deleteMany({ where: { userId } });
    jest.clearAllMocks();
  });

  describe('GET /api/v1/webhooks/events', () => {
    it('should return list of available webhook events', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('descriptions');
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events).toContain('post.created');
      expect(response.body.events).toContain('post.liked');
      expect(response.body.events).toContain('user.followed');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks/events');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/webhooks', () => {
    it('should create a new webhook', async () => {
      const webhookData = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['post.created', 'post.liked'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', webhookData.name);
      expect(response.body).toHaveProperty('url', webhookData.url);
      expect(response.body).toHaveProperty('events');
      expect(response.body.events).toEqual(webhookData.events);
      expect(response.body).toHaveProperty('active', true);
    });

    it('should create a webhook with secret', async () => {
      const webhookData = {
        name: 'Secure Webhook',
        url: 'https://example.com/secure-webhook',
        secret: 'my-webhook-secret',
        events: ['*'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('secret', webhookData.secret);
    });

    it('should accept wildcard event for all events', async () => {
      const webhookData = {
        name: 'All Events Webhook',
        url: 'https://example.com/all',
        events: ['*'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(201);
      expect(response.body.events).toContain('*');
    });

    it('should reject invalid URL', async () => {
      const webhookData = {
        name: 'Invalid URL Webhook',
        url: 'not-a-valid-url',
        events: ['post.created'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(getResponseMessage(response.body)).toMatch(/Invalid URL|valid HTTP or HTTPS URL/);
    });

    it('should reject invalid event types', async () => {
      const webhookData = {
        name: 'Invalid Events Webhook',
        url: 'https://example.com/webhook',
        events: ['invalid.event', 'another.invalid'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(getResponseMessage(response.body)).toContain('Invalid events');
    });

    it('should require name', async () => {
      const webhookData = {
        url: 'https://example.com/webhook',
        events: ['post.created'],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(400);
    });

    it('should require at least one event', async () => {
      const webhookData = {
        name: 'No Events Webhook',
        url: 'https://example.com/webhook',
        events: [],
      };

      const response = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData);

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          name: 'Test',
          url: 'https://example.com/webhook',
          events: ['post.created'],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/webhooks', () => {
    beforeEach(async () => {
      // Create test webhooks
      await webhookService.createWebhook(userId, {
        name: 'Webhook 1',
        url: 'https://example.com/webhook1',
        events: ['post.created'],
      });
      await webhookService.createWebhook(userId, {
        name: 'Webhook 2',
        url: 'https://example.com/webhook2',
        events: ['user.followed'],
      });
    });

    it('should list all webhooks for user', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should include recent deliveries', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.forEach((webhook: any) => {
        expect(webhook).toHaveProperty('deliveries');
        expect(Array.isArray(webhook.deliveries)).toBe(true);
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    let webhookId: string;

    beforeEach(async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Detail Webhook',
        url: 'https://example.com/detail',
        events: ['post.created', 'post.liked'],
      });
      webhookId = webhook.id;
    });

    it('should get webhook details', async () => {
      const response = await request(app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', webhookId);
      expect(response.body).toHaveProperty('name', 'Detail Webhook');
      expect(response.body).toHaveProperty('deliveries');
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/webhooks/:id', () => {
    let webhookId: string;

    beforeEach(async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Update Test Webhook',
        url: 'https://example.com/update',
        events: ['post.created'],
      });
      webhookId = webhook.id;
    });

    it('should update webhook name', async () => {
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Webhook Name' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify the update
      const getResponse = await request(app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.body.name).toBe('Updated Webhook Name');
    });

    it('should update webhook URL', async () => {
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ url: 'https://newdomain.com/webhook' });

      expect(response.status).toBe(200);
    });

    it('should update webhook events', async () => {
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ events: ['post.liked', 'user.followed'] });

      expect(response.status).toBe(200);
    });

    it('should deactivate webhook', async () => {
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ active: false });

      expect(response.status).toBe(200);

      const getResponse = await request(app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.body.active).toBe(false);
    });

    it('should reject invalid URL on update', async () => {
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ url: 'not-a-url' });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app)
        .patch('/api/v1/webhooks/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    let webhookId: string;

    beforeEach(async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Delete Test Webhook',
        url: 'https://example.com/delete',
        events: ['post.created'],
      });
      webhookId = webhook.id;
    });

    it('should delete webhook', async () => {
      const response = await request(app)
        .delete(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/v1/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app)
        .delete('/api/v1/webhooks/nonexistent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/webhooks/:id/regenerate-secret', () => {
    let webhookId: string;
    let originalSecret: string;

    beforeEach(async () => {
      originalSecret = 'original-secret';
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Secret Test Webhook',
        url: 'https://example.com/secret',
        secret: originalSecret,
        events: ['post.created'],
      });
      webhookId = webhook.id;
    });

    it('should regenerate webhook secret', async () => {
      const response = await request(app)
        .post(`/api/v1/webhooks/${webhookId}/regenerate-secret`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('secret');
      expect(response.body.secret).not.toBe(originalSecret);
      expect(response.body.secret.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/webhooks/:id/test', () => {
    let webhookId: string;

    beforeEach(async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Test Delivery Webhook',
        url: 'https://example.com/test-delivery',
        secret: 'test-secret',
        events: ['post.created'],
      });
      webhookId = webhook.id;

      // Mock successful axios response
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { received: true },
      });
    });

    it('should send test webhook and return result', async () => {
      const response = await request(app)
        .post(`/api/v1/webhooks/${webhookId}/test`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('statusCode', 200);
      expect(response.body).toHaveProperty('duration');
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/nonexistent-id/test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });
});

describe('Webhook Service', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        username: `webhook_service_test_${Date.now()}`,
        email: `webhook-service-test-${Date.now()}@example.com`,
        password: 'hashedpassword',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany({
      where: { webhook: { userId } },
    });
    await prisma.userWebhook.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.webhookDelivery.deleteMany({
      where: { webhook: { userId } },
    });
    await prisma.userWebhook.deleteMany({ where: { userId } });
    jest.clearAllMocks();
  });

  describe('sendWebhook', () => {
    it('should send webhook with correct headers', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Header Test',
        url: 'https://example.com/headers',
        secret: 'test-secret',
        events: ['post.created'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      const payload = {
        event: 'post.created',
        data: { postId: '123' },
        timestamp: Date.now(),
      };

      await webhookService.sendWebhook(
        webhook.id,
        webhook.url,
        payload,
        webhook.secret
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/headers',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'Gitgram-Webhook/1.0',
            'X-Gitgram-Event': 'post.created',
          }),
          timeout: 10000,
        })
      );
    });

    it('should include HMAC signature when secret is provided', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Signature Test',
        url: 'https://example.com/signature',
        secret: 'my-secret-key',
        events: ['post.created'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      const payload = {
        event: 'post.created',
        data: { postId: '456' },
        timestamp: Date.now(),
      };

      await webhookService.sendWebhook(
        webhook.id,
        webhook.url,
        payload,
        webhook.secret
      );

      const expectedSignature = crypto
        .createHmac('sha256', 'my-secret-key')
        .update(JSON.stringify(payload))
        .digest('hex');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Gitgram-Signature': `sha256=${expectedSignature}`,
          }),
        })
      );
    });

    it('should record delivery in database', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Record Test',
        url: 'https://example.com/record',
        events: ['post.created'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { received: true },
      });

      const payload = {
        event: 'post.created',
        data: { postId: '789' },
        timestamp: Date.now(),
      };

      await webhookService.sendWebhook(webhook.id, webhook.url, payload);

      const deliveries = await prisma.webhookDelivery.findMany({
        where: { webhookId: webhook.id },
      });

      expect(deliveries.length).toBe(1);
      expect(deliveries[0].event).toBe('post.created');
      expect(deliveries[0].success).toBe(true);
      expect(deliveries[0].statusCode).toBe(200);
    });

    it('should handle failed delivery', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Failure Test',
        url: 'https://example.com/fail',
        events: ['post.created'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: 'Internal Server Error',
      });

      const payload = {
        event: 'post.created',
        data: { postId: 'fail' },
        timestamp: Date.now(),
      };

      const result = await webhookService.sendWebhook(
        webhook.id,
        webhook.url,
        payload
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);

      const delivery = await prisma.webhookDelivery.findFirst({
        where: { webhookId: webhook.id },
      });

      expect(delivery?.success).toBe(false);
    });

    it('should handle network errors', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Network Error Test',
        url: 'https://example.com/network-error',
        events: ['post.created'],
      });

      mockedAxios.post.mockRejectedValue(new Error('Network timeout'));

      const payload = {
        event: 'post.created',
        data: { postId: 'error' },
        timestamp: Date.now(),
      };

      const result = await webhookService.sendWebhook(
        webhook.id,
        webhook.url,
        payload
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('triggerWebhook', () => {
    it('should only trigger webhooks subscribed to the event', async () => {
      // Create webhook subscribed to post.created
      await webhookService.createWebhook(userId, {
        name: 'Post Webhook',
        url: 'https://example.com/posts',
        events: ['post.created'],
      });

      // Create webhook subscribed to user.followed
      await webhookService.createWebhook(userId, {
        name: 'User Webhook',
        url: 'https://example.com/users',
        events: ['user.followed'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      await webhookService.triggerWebhook(userId, 'post.created', {
        postId: '123',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/posts',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should trigger wildcard webhooks for any event', async () => {
      await webhookService.createWebhook(userId, {
        name: 'All Events Webhook',
        url: 'https://example.com/all',
        events: ['*'],
      });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      await webhookService.triggerWebhook(userId, 'some.random.event', {
        data: 'test',
      });

      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('should not trigger inactive webhooks', async () => {
      const webhook = await webhookService.createWebhook(userId, {
        name: 'Inactive Webhook',
        url: 'https://example.com/inactive',
        events: ['post.created'],
      });

      // Deactivate the webhook
      await webhookService.updateWebhook(webhook.id, userId, { active: false });

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { ok: true },
      });

      await webhookService.triggerWebhook(userId, 'post.created', {
        postId: '123',
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('getAllWebhookEvents', () => {
    it('should return all defined webhook events', () => {
      const events = webhookService.getAllWebhookEvents();

      expect(events).toContain('post.created');
      expect(events).toContain('post.liked');
      expect(events).toContain('post.commented');
      expect(events).toContain('user.followed');
      expect(events).toContain('message.received');
      expect(events).toContain('story.viewed');
      expect(events).toContain('repository.starred');
      expect(events).toContain('repository.forked');
    });
  });
});
