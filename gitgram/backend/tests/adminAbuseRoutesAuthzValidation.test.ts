const authMock = (req: any, res: any, next: any) => {
  const mode = req.header('x-auth-mode');
  if (mode === 'ok') {
    req.userId = req.header('x-user-id') || 'admin_test';
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

const requireSuperAdminMock = (_req: any, _res: any, next: any) => next();
const passThrough = (_req: any, _res: any, next: any) => next();

jest.mock('../src/middleware/auth', () => ({
  authenticate: authMock,
  optionalAuth: passThrough,
}));

jest.mock('../src/middleware/authorization', () => ({
  requireRole: requireRoleMock,
  requireSuperAdmin: requireSuperAdminMock,
}));

jest.mock('../src/middleware/tieredRateLimiter', () => ({
  userModerationActionLimit: passThrough,
}));

jest.mock('../src/controllers/adminController', () => ({
  getDashboardStats: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getAnalytics: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getUsers: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getUserDetails: (_req: any, res: any) => res.status(200).json({ ok: true }),
  updateUser: (_req: any, res: any) => res.status(200).json({ ok: true }),
  banUser: (_req: any, res: any) => res.status(200).json({ ok: true }),
  unbanUser: (_req: any, res: any) => res.status(200).json({ ok: true }),
  deleteUser: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getReports: (_req: any, res: any) => res.status(200).json({ ok: true }),
  resolveReport: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getFlaggedContent: (_req: any, res: any) => res.status(200).json({ ok: true }),
  moderatePost: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getAuditLogs: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getSystemConfig: (_req: any, res: any) => res.status(200).json({ ok: true }),
  updateSystemConfig: (_req: any, res: any) => res.status(200).json({ ok: true }),
  sendAnnouncement: (_req: any, res: any) => res.status(200).json({ ok: true }),
  bulkBanUsers: (_req: any, res: any) => res.status(200).json({ ok: true }),
  exportData: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

jest.mock('../src/controllers/adminModerationController', () => ({
  getModerationQueue: (_req: any, res: any) => res.status(200).json({ success: true, data: { reports: [] } }),
  getReportDetails: (_req: any, res: any) => res.status(200).json({ success: true, data: { report: { id: 'rpt_1' } } }),
  resolveReport: (_req: any, res: any) => res.status(200).json({ success: true, data: { id: 'rpt_1' } }),
  getModerationStats: (_req: any, res: any) => res.status(200).json({ success: true, data: {} }),
  getAppeals: (_req: any, res: any) => res.status(200).json({ success: true, data: { appeals: [] } }),
  reviewAppealAction: (_req: any, res: any) => res.status(200).json({ success: true, data: { id: 'apl_1' } }),
}));

const getRuntimeConfigMock = jest.fn(() => ({ softRestrictThreshold: 120 }));
const updateRuntimeConfigMock = jest.fn((payload: any) => ({ ...payload }));
const resetRuntimeConfigMock = jest.fn(() => ({ reset: true }));
const getStatusMock = jest.fn((_userId: string) => ({ restrictionLevel: 'none' }));
const getFullRecordMock = jest.fn((_userId: string) => ({ events: [] }));
const adminResetMock = jest.fn((_userId: string) => ({ restrictionLevel: 'none' }));
const adminOverrideMock = jest.fn((_userId: string, _level: string, _durationMinutes?: number) => ({ restrictionLevel: 'soft' }));

jest.mock('../src/services/abuseDetectionService', () => ({
  getRuntimeConfig: () => getRuntimeConfigMock(),
  updateRuntimeConfig: (payload: Record<string, unknown>) => updateRuntimeConfigMock(payload),
  resetRuntimeConfig: () => resetRuntimeConfigMock(),
  getStatus: (userId: string) => getStatusMock(userId),
  getFullRecord: (userId: string) => getFullRecordMock(userId),
  adminReset: (userId: string) => adminResetMock(userId),
  adminOverride: (userId: string, level: string, durationMinutes?: number) => adminOverrideMock(userId, level, durationMinutes),
}));

jest.mock('../src/services/abuseTelemetryService', () => ({
  getAbuseStats: async () => ({ windowDays: 7, totalEvents: 0, uniqueUsers: 0, byAction: [], topUsers: [] }),
  getAbuseIncidents: async () => ({ windowDays: 7, page: 1, limit: 50, total: 0, incidents: [] }),
}));

import adminRoutes from '../src/routes/admin';

function getHandlers(
  router: any,
  method: 'get' | 'put' | 'post',
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
      } catch (err) {
        reject(err);
      }
    });

    return invoke(index + 1);
  };

  await invoke(0);
  return res;
}

describe('Admin abuse routes authz + validation', () => {
  const abuseConfigGetHandlers = [authMock, ...getHandlers(adminRoutes, 'get', '/abuse/config')];
  const abuseConfigPutHandlers = [authMock, ...getHandlers(adminRoutes, 'put', '/abuse/config')];
  const abuseConfigResetHandlers = [authMock, ...getHandlers(adminRoutes, 'post', '/abuse/config/reset')];
  const abuseUserGetHandlers = [authMock, ...getHandlers(adminRoutes, 'get', '/abuse/:userId')];
  const abuseUserResetHandlers = [authMock, ...getHandlers(adminRoutes, 'post', '/abuse/:userId/reset')];
  const abuseUserRestrictHandlers = [authMock, ...getHandlers(adminRoutes, 'post', '/abuse/:userId/restrict')];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated abuse config access', async () => {
    const res = await runRoute(abuseConfigGetHandlers);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-admin abuse config access', async () => {
    const res = await runRoute(abuseConfigGetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid abuse config update payload', async () => {
    const res = await runRoute(abuseConfigPutHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      body: { softRestrictThreshold: -1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 200 for valid abuse config update payload', async () => {
    const res = await runRoute(abuseConfigPutHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      body: { softRestrictThreshold: 120, hardRestrictThreshold: 300 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateRuntimeConfigMock).toHaveBeenCalled();
  });

  it('returns 200 for abuse config reset', async () => {
    const res = await runRoute(abuseConfigResetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(resetRuntimeConfigMock).toHaveBeenCalled();
  });

  it('returns 200 for abuse user status', async () => {
    const res = await runRoute(abuseUserGetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      params: { userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    expect(getStatusMock).toHaveBeenCalledWith('u1');
  });

  it('returns 200 for abuse user reset', async () => {
    const res = await runRoute(abuseUserResetHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      params: { userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    expect(adminResetMock).toHaveBeenCalledWith('u1');
  });

  it('returns 400 for invalid restrict payload level', async () => {
    const res = await runRoute(abuseUserRestrictHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      params: { userId: 'u1' },
      body: { level: 'invalid-level' },
    });
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error || '')).toMatch(/Invalid restriction level/);
  });

  it('returns 200 for valid restrict payload', async () => {
    const res = await runRoute(abuseUserRestrictHandlers, {
      headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      params: { userId: 'u1' },
      body: { level: 'soft', durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(200);
    expect(adminOverrideMock).toHaveBeenCalledWith('u1', 'soft', 30);
  });
});
