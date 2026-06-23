const authMock = (req: any, res: any, next: any) => {
  const mode = req.header('x-auth-mode');
  if (mode === 'ok') {
    req.userId = req.header('x-user-id') || 'user_test';
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
};

const requireRoleMock = (..._roles: string[]) => {
  return (req: any, res: any, next: any) => {
    const roleMode = req.header('x-role-mode');
    if (roleMode === 'allow') return next();
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

jest.mock('../src/controllers/reportController', () => {
  const VALID_REASONS = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER'];
  const VALID_TARGET_TYPES = ['POST', 'COMMENT', 'USER', 'REEL', 'STORY'];

  return {
    createReport: (req: any, res: any) => {
      const { targetType, targetId, reason } = req.body || {};
      if (!targetType || !targetId || !reason) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'targetType, targetId, and reason are required',
        });
      }
      if (!VALID_TARGET_TYPES.includes(String(targetType).toUpperCase())) {
        return res.status(400).json({ error: 'Invalid target type' });
      }
      if (!VALID_REASONS.includes(String(reason).toUpperCase())) {
        return res.status(400).json({ error: 'Invalid reason' });
      }
      return res.status(201).json({ message: 'Report submitted successfully', reportId: 'rpt_mock' });
    },
    getMyReports: (_req: any, res: any) => res.status(200).json({ reports: [] }),
    getReport: (_req: any, res: any) => res.status(200).json({ id: 'rpt_mock' }),
    submitAppeal: (req: any, res: any) => {
      const { moderationLogId, appealText } = req.body || {};
      if (!moderationLogId || !appealText) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'moderationLogId and appealText are required',
        });
      }
      if (String(appealText).length > 2000) {
        return res.status(400).json({
          error: 'Appeal text too long',
          details: 'Appeal text must be 2000 characters or less',
        });
      }
      return res.status(201).json({ appealId: 'apl_mock' });
    },
    getMyModerationHistory: (_req: any, res: any) => res.status(200).json({ history: [] }),
    getAllReports: (_req: any, res: any) => res.status(200).json({ reports: [] }),
    getReportStats: (_req: any, res: any) => res.status(200).json({ total: 0 }),
    updateReportStatus: (req: any, res: any) => {
      const status = String(req.body?.status || '').toUpperCase();
      if (!['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      return res.status(200).json({ message: 'Report updated successfully' });
    },
  };
});

import reportsRoutes from '../src/routes/reports';

function getHandlers(
  router: any,
  method: 'post' | 'get' | 'patch',
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
    method: 'POST',
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
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    setHeader(name: string, value: any) {
      this.headers[name.toLowerCase()] = String(value);
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

describe('Moderation report routes authz + contract', () => {
  const submitReportHandlers = getHandlers(reportsRoutes, 'post', '/');
  const submitAppealHandlers = getHandlers(reportsRoutes, 'post', '/appeals');
  const moderationHistoryHandlers = getHandlers(reportsRoutes, 'get', '/moderation-history');
  const adminReviewHandlers = getHandlers(reportsRoutes, 'get', '/admin');
  const adminStatsHandlers = getHandlers(reportsRoutes, 'get', '/admin/stats');
  const adminEnforcementHandlers = getHandlers(reportsRoutes, 'patch', '/admin/:id');

  describe('Authz guards', () => {
    it('returns 401 for unauthenticated report submission', async () => {
      const res = await runRoute(submitReportHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated review queue access', async () => {
      const res = await runRoute(adminReviewHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated appeal submission', async () => {
      const res = await runRoute(submitAppealHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated moderation history access', async () => {
      const res = await runRoute(moderationHistoryHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated enforcement action', async () => {
      const res = await runRoute(adminEnforcementHandlers, { params: { id: 'rpt_1' } });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 for unauthenticated review stats access', async () => {
      const res = await runRoute(adminStatsHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-moderator review queue access', async () => {
      const res = await runRoute(adminReviewHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-moderator enforcement action', async () => {
      const res = await runRoute(adminEnforcementHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
        params: { id: 'rpt_1' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-moderator review stats access', async () => {
      const res = await runRoute(adminStatsHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'deny' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Contract validation (400)', () => {
    it('rejects report submission with missing required fields', async () => {
      const res = await runRoute(submitReportHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        body: { targetType: 'POST' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('rejects report submission with invalid target type', async () => {
      const res = await runRoute(submitReportHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        body: { targetType: 'INVALID', targetId: 'x1', reason: 'SPAM' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('rejects report submission with invalid reason', async () => {
      const res = await runRoute(submitReportHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        body: { targetType: 'POST', targetId: 'x1', reason: 'INVALID_REASON' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('rejects enforcement action with invalid status', async () => {
      const res = await runRoute(adminEnforcementHandlers, {
        headers: { 'x-auth-mode': 'ok', 'x-role-mode': 'allow' },
        params: { id: 'rpt_1' },
        body: { status: 'INVALID_STATUS' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid status');
    });

    it('rejects appeal submission with missing required fields', async () => {
      const res = await runRoute(submitAppealHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        body: { moderationLogId: 'log_1' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('rejects appeal submission with too long text', async () => {
      const res = await runRoute(submitAppealHandlers, {
        headers: { 'x-auth-mode': 'ok' },
        body: {
          moderationLogId: 'log_1',
          appealText: 'a'.repeat(2001),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});
