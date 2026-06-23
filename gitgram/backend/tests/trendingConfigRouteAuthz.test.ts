const authMock = (req: any, res: any, next: any) => {
  if (req.header('x-auth-mode') === 'ok') {
    req.userId = 'user_test';
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

const requireRoleMock = (..._roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (req.header('x-role-mode') === 'allow') return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: authMock,
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/authorization', () => ({
  requireRole: requireRoleMock,
}));

jest.mock('../src/controllers/trendingController', () => ({
  trendingController: {
    getTrending: (_req: any, res: any) => res.status(200).json({ ok: true }),
    getTrendingPosts: (_req: any, res: any) => res.status(200).json({ ok: true }),
    getTrendingRepos: (_req: any, res: any) => res.status(200).json({ ok: true }),
    getTrendingCreators: (_req: any, res: any) => res.status(200).json({ ok: true }),
    getSignalConfig: (_req: any, res: any) => res.status(200).json({ success: true, data: [] }),
    updateSignalConfig: (_req: any, res: any) => res.status(200).json({ success: true }),
  },
}));

import trendingRoutes from '../src/routes/trending';

function getHandlers(
  router: any,
  method: 'get' | 'put',
  path: string
): Array<(req: any, res: any, next: any) => any> {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

function createReq(input: {
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers || {})) normalized[k.toLowerCase()] = v;
  return {
    headers: normalized,
    body: input.body || {},
    params: input.params || {},
    query: input.query || {},
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

async function runRoute(
  handlers: Array<(req: any, res: any, next: any) => any>,
  input: { headers?: Record<string, string>; body?: any; params?: Record<string, string>; query?: Record<string, string> } = {}
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
      } catch (error) {
        reject(error);
      }
    });

    return invoke(index + 1);
  };

  await invoke(0);
  return res;
}

describe('Trending config route authz', () => {
  const configGetHandlers = getHandlers(trendingRoutes, 'get', '/config');
  const configPutHandlers = getHandlers(trendingRoutes, 'put', '/config/:signalName');

  it('returns 401 for unauthenticated signal config read', async () => {
    const res = await runRoute(configGetHandlers);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated signal config update', async () => {
    const res = await runRoute(configPutHandlers, {
      params: { signalName: 'post_likes' },
      body: { weight: 2.1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for authenticated non-admin signal config read', async () => {
    const res = await runRoute(configGetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for authenticated non-admin signal config update', async () => {
    const res = await runRoute(configPutHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
      params: { signalName: 'post_likes' },
      body: { weight: 2.1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for admin signal config read', async () => {
    const res = await runRoute(configGetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 for admin signal config update', async () => {
    const res = await runRoute(configPutHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      params: { signalName: 'post_likes' },
      body: { weight: 2.1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
