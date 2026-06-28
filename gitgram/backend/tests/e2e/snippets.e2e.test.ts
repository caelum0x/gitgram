/**
 * E2E: Code snippets social parity.
 *
 * Verifies the snippet CRUD plus the newly-added comments and likers endpoints
 * (social parity with posts) end-to-end against a live database.
 */
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, registerUser, bearer, resetDatabase, RegisteredUser } from './helpers';

describe('E2E: Snippets social parity', () => {
  let app: Express;
  let owner: RegisteredUser;
  let other: RegisteredUser;
  let snippetId: string;

  beforeAll(async () => {
    app = buildApp();
    await resetDatabase();
    owner = await registerUser(app);
    other = await registerUser(app);
  });

  it('creates a snippet', async () => {
    const res = await request(app)
      .post('/api/v1/snippets')
      .set(...bearer(owner.token))
      .send({
        title: 'Hello',
        code: 'console.log("hi")',
        language: 'javascript',
        description: 'a greeting',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    snippetId = res.body.id;
  });

  it('toggles like / unlike and lists likers', async () => {
    const like = await request(app)
      .post(`/api/v1/snippets/${snippetId}/like`)
      .set(...bearer(other.token));
    expect(like.status).toBe(200);
    expect(like.body.liked).toBe(true);

    const likers = await request(app)
      .get(`/api/v1/snippets/${snippetId}/likers`)
      .set(...bearer(owner.token));
    expect(likers.status).toBe(200);
    expect(Array.isArray(likers.body.likers)).toBe(true);
    expect(likers.body.likers.some((u: { id: string }) => u.id === other.id)).toBe(true);
    expect(likers.body.total).toBeGreaterThanOrEqual(1);

    const unlike = await request(app)
      .post(`/api/v1/snippets/${snippetId}/like`)
      .set(...bearer(other.token));
    expect(unlike.body.liked).toBe(false);
  });

  it('adds and lists comments (with replies)', async () => {
    const comment = await request(app)
      .post(`/api/v1/snippets/${snippetId}/comments`)
      .set(...bearer(other.token))
      .send({ content: 'Nice snippet!' });
    expect(comment.status).toBe(201);
    expect(comment.body.content).toBe('Nice snippet!');
    const parentId = comment.body.id;

    const reply = await request(app)
      .post(`/api/v1/snippets/${snippetId}/comments`)
      .set(...bearer(owner.token))
      .send({ content: 'Thanks!', parentId });
    expect(reply.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/snippets/${snippetId}/comments`)
      .set(...bearer(owner.token));
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.comments[0]._count.replies).toBeGreaterThanOrEqual(1);
  });

  it('rejects an empty comment at the validation boundary', async () => {
    const res = await request(app)
      .post(`/api/v1/snippets/${snippetId}/comments`)
      .set(...bearer(other.token))
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when commenting on a missing snippet', async () => {
    const res = await request(app)
      .post('/api/v1/snippets/missing-snippet/comments')
      .set(...bearer(other.token))
      .send({ content: 'hi' });
    expect(res.status).toBe(404);
  });
});
