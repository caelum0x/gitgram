/**
 * E2E: Authentication flow.
 *
 * Walks the real register -> me -> login -> refresh -> logout flow against a
 * running Express app backed by a real PostgreSQL database.
 */
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, registerUser, bearer, resetDatabase } from './helpers';

describe('E2E: Authentication', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildApp();
    await resetDatabase();
  });

  it('registers a new user and returns tokens + account', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'authflowuser',
      email: 'authflow@example.com',
      password: 'Str0ngPass!',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'authflow@example.com', emailVerified: false });
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.account).toMatchObject({ username: 'authflowuser', type: 'USER' });
  });

  it('rejects a duplicate email registration', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'authflowuser2',
      email: 'authflow@example.com',
      password: 'Str0ngPass!',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a weak password at the validation boundary', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'weakpwuser',
      email: 'weakpw@example.com',
      password: 'weak',
    });
    expect(res.status).toBe(400);
  });

  it('returns the current user from /me with a valid token', async () => {
    const user = await registerUser(app);
    const res = await request(app).get('/api/v1/auth/me').set(...bearer(user.token));

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.account.username).toBe(user.username);
  });

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('logs in with valid credentials and rejects bad ones', async () => {
    const user = await registerUser(app, { password: 'Str0ngPass!' });

    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Str0ngPass!' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPass1!' });
    expect(bad.status).toBe(401);
  });

  it('refreshes an access token with a valid refresh token', async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('logs out an authenticated user', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/v1/auth/logout').set(...bearer(user.token));
    expect(res.status).toBe(200);
  });
});
