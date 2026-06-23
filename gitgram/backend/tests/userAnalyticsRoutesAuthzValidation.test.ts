const authMock = (req: any, res: any, next: any) => {
  const mode = req.header('x-auth-mode');
  if (mode === 'ok') {
    req.userId = req.header('x-user-id') || 'user_test';
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: authMock,
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/controllers/userAnalyticsController', () => ({
  getUserEngagement: (_req: any, res: any) => res.status(200).json({ success: true, type: 'engagement' }),
  getUserFollowers: (_req: any, res: any) => res.status(200).json({ success: true, type: 'followers' }),
  getUserContent: (_req: any, res: any) => res.status(200).json({ success: true, type: 'content' }),
}));

import userAnalyticsRoutes from '../src/routes/userAnalytics';

function getHandlers(
  router: any,
  method: 'get',
  path: string
): Array<(req: any, res: any, next: any) => any> {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

function createReq(input: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers || {})) normalized[k.toLowerCase()] = v;
  return {
    headers: normalized,
    params: input.params || {},
    query: input.query || {},
    body: {},
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined as any,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      this.ended = true;
      return this;
    },
  };
}

async function runHandlers(
  handlers: Array<(req: any, res: any, next: any) => any>,
  input: { headers?: Record<string, string>; params?: Record<string, string>; query?: Record<string, string> } = {}
) {
  const req = createReq(input);
  const res = createRes();

  const invoke = async (index: number): Promise<void> => {
    if (index >= handlers.length || res.ended) return;

    await new Promise<void>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: any) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve();
      };

      try {
        const out = handlers[index](req, res, next);
        Promise.resolve(out)
          .then(() => {
            if (!nextCalled) resolve();
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });

    return invoke(index + 1);
  };

  await invoke(0);
  return res;
}

describe('User analytics routes authz + validation', () => {
  const engagementHandlers = getHandlers(userAnalyticsRoutes, 'get', '/engagement/:userId');
  const followersHandlers = getHandlers(userAnalyticsRoutes, 'get', '/followers/:userId');
  const contentHandlers = getHandlers(userAnalyticsRoutes, 'get', '/content/:userId');

  it('returns 401 for unauthenticated engagement analytics access', async () => {
    const res = await runHandlers(engagementHandlers, { params: { userId: 'u1' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated followers analytics access', async () => {
    const res = await runHandlers(followersHandlers, { params: { userId: 'u1' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated content analytics access', async () => {
    const res = await runHandlers(contentHandlers, { params: { userId: 'u1' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid days query on engagement route', async () => {
    const res = await runHandlers(engagementHandlers, {
      headers: { 'x-auth-mode': 'ok' },
      params: { userId: 'u1' },
      query: { days: '0' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid limit query on content route', async () => {
    const res = await runHandlers(contentHandlers, {
      headers: { 'x-auth-mode': 'ok' },
      params: { userId: 'u1' },
      query: { limit: '0' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 200 for valid analytics route calls', async () => {
    const [resEng, resFol, resCon] = await Promise.all([
      runHandlers(engagementHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        params: { userId: 'u1' },
        query: { days: '30' },
      }),
      runHandlers(followersHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        params: { userId: 'u1' },
        query: { days: '30' },
      }),
      runHandlers(contentHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        params: { userId: 'u1' },
        query: { days: '30', limit: '20' },
      }),
    ]);

    expect(resEng.statusCode).toBe(200);
    expect(resFol.statusCode).toBe(200);
    expect(resCon.statusCode).toBe(200);
  });
});
