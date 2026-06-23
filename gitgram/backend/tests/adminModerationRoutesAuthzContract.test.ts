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

const requireSuperAdminMock = (req: any, res: any, next: any) => {
  if (req.header('x-super-admin-mode') === 'deny') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  return next();
};

const passThrough = (_req: any, _res: any, next: any) => next();

const getAbuseStatsMock = jest.fn(async (_days?: number) => ({
  windowDays: 7,
  totalEvents: 0,
  uniqueUsers: 0,
  byAction: [],
  topUsers: [],
}));

const getAbuseIncidentsMock = jest.fn(async (_params?: Record<string, unknown>) => ({
  windowDays: 7,
  page: 1,
  limit: 50,
  total: 0,
  incidents: [],
}));

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

jest.mock('../src/services/abuseTelemetryService', () => ({
  getAbuseStats: (days?: number) => getAbuseStatsMock(days),
  getAbuseIncidents: (params?: Record<string, unknown>) => getAbuseIncidentsMock(params),
}));

import adminRoutes from '../src/routes/admin';

function getHandlers(
  router: any,
  method: 'get' | 'put' | 'post' | 'delete',
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
    method: 'GET',
    path: '/',
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

async function runHandlers(
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

function withGlobalAuth(handlers: Array<(req: any, res: any, next: any) => any>) {
  return [authMock, ...handlers];
}

describe('Admin moderation routes authz + contract', () => {
  const queueHandlers = withGlobalAuth(getHandlers(adminRoutes, 'get', '/moderation/queue'));
  const resolveHandlers = withGlobalAuth(getHandlers(adminRoutes, 'put', '/moderation/queue/:id/resolve'));
  const appealsHandlers = withGlobalAuth(getHandlers(adminRoutes, 'get', '/moderation/appeals'));
  const reviewHandlers = withGlobalAuth(getHandlers(adminRoutes, 'put', '/moderation/appeals/:id/review'));
  const abuseIncidentsHandlers = withGlobalAuth(getHandlers(adminRoutes, 'get', '/abuse/incidents'));
  const abuseStatsHandlers = withGlobalAuth(getHandlers(adminRoutes, 'get', '/abuse/stats'));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authz guards', () => {
    it('returns 401 for unauthenticated moderation queue access', async () => {
      const res = await runHandlers(queueHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated moderation resolve action', async () => {
      const res = await runHandlers(resolveHandlers, {
        params: { id: 'rpt_1' },
        body: { action: 'dismiss' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-moderator moderation queue access', async () => {
      const res = await runHandlers(queueHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-moderator moderation resolve action', async () => {
      const res = await runHandlers(resolveHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
        params: { id: 'rpt_1' },
        body: { action: 'dismiss' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-admin abuse incidents access', async () => {
      const res = await runHandlers(abuseIncidentsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Contract validation', () => {
    it('returns 400 for moderation resolve action with invalid action', async () => {
      const res = await runHandlers(resolveHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        params: { id: 'rpt_1' },
        body: { action: 'invalid_action' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 for moderation appeal review with invalid decision', async () => {
      const res = await runHandlers(reviewHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        params: { id: 'apl_1' },
        body: { decision: 'MAYBE' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 for abuse incidents query with invalid days', async () => {
      const res = await runHandlers(abuseIncidentsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        query: { days: '0' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('Positive path contracts', () => {
    it('returns 200 for moderation queue with moderator role', async () => {
      const res = await runHandlers(queueHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for moderation appeals queue with moderator role', async () => {
      const res = await runHandlers(appealsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for moderation appeal review with valid payload', async () => {
      const res = await runHandlers(reviewHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        params: { id: 'apl_1' },
        body: { decision: 'APPROVED', reviewNotes: 'looks good' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for abuse incidents feed and forwards parsed query', async () => {
      const res = await runHandlers(abuseIncidentsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        query: { days: '14', page: '2', limit: '25', action: 'spam_block', userId: 'usr_1' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(getAbuseIncidentsMock).toHaveBeenCalledWith({
        days: 14,
        page: 2,
        limit: 25,
        action: 'spam_block',
        userId: 'usr_1',
      });
    });

    it('returns 200 for abuse stats endpoint and forwards days', async () => {
      const res = await runHandlers(abuseStatsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        query: { days: '30' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(getAbuseStatsMock).toHaveBeenCalledWith(30);
    });
  });
});
