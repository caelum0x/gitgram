const authMock = (req: any, res: any, next: any) => {
  const mode = req.header('x-auth-mode');
  if (mode === 'ok') {
    req.userId = 'test-user';
    return next();
  }
  if (mode === 'forbidden') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  return res.status(401).json({ message: 'Unauthorized' });
};

jest.mock('../src/middleware/auth', () => ({
  authenticate: authMock,
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/middleware/rateLimiter', () => ({
  uploadLimiter: (_req: any, _res: any, next: any) => next(),
  interactionLimiter: (_req: any, _res: any, next: any) => next(),
}));

const buildFile = (fieldname: string, mimetype: string, content: string) => ({
  fieldname,
  originalname: `test-${fieldname}`,
  encoding: '7bit',
  mimetype,
  size: Buffer.byteLength(content),
  buffer: Buffer.from(content, 'utf8'),
});

jest.mock('../src/services/storageService', () => ({
  upload: {
    single:
      (fieldname: string) =>
      (req: any, _res: any, next: any) => {
        const mime = req.header('x-file-mimetype');
        if (!mime) return next();
        const body = req.header('x-file-body') || 'invalid-bytes';
        req.file = buildFile(fieldname, mime, body);
        return next();
      },
    array:
      (fieldname: string, _max: number) =>
      (req: any, _res: any, next: any) => {
        const count = Number(req.header('x-files-count') || '0');
        const mime = req.header('x-file-mimetype') || 'image/jpeg';
        const body = req.header('x-file-body') || 'invalid-bytes';
        req.files = Array.from({ length: count }, () => buildFile(fieldname, mime, body));
        return next();
      },
  },
}));

const ok = (_req: any, res: any) => res.status(200).json({ ok: true });

jest.mock('../src/controllers/uploadController', () => ({
  uploadImage: ok,
  uploadMultiple: ok,
  uploadAvatar: ok,
  uploadStory: ok,
  uploadReelCover: ok,
  getVideoMetadataHandler: ok,
}));

jest.mock('../src/controllers/storiesController', () => ({
  createStory: ok,
  getActiveStories: ok,
  getStoryById: ok,
  deleteStory: ok,
  cleanupExpiredStories: ok,
  updateStory: ok,
  archiveStory: ok,
  getArchivedStories: ok,
  deleteArchivedStory: ok,
  getStoryViewers: ok,
  getMyStories: ok,
  getStoryHighlightById: ok,
  getStoryHighlights: ok,
  getStorySettings: ok,
  getStoryAnalytics: ok,
  trackStoryView: ok,
  createStoryHighlight: ok,
  updateStorySettings: ok,
  updateStoryViewDuration: ok,
}));

jest.mock('../src/controllers/storyReactionsController', () => ({
  reactToStory: ok,
  removeReaction: ok,
  getStoryReactions: ok,
  replyToStory: ok,
  getStoryReplies: ok,
}));

jest.mock('../src/controllers/reelsController', () => ({
  createReel: ok,
  getReelsFeed: ok,
  getReelById: ok,
  likeReel: ok,
  unlikeReel: ok,
  addReelComment: ok,
  getReelComments: ok,
  getReelLikes: ok,
  deleteReel: ok,
  updateReel: ok,
  applyMusicToReel: ok,
  removeMusicFromReel: ok,
  shareReel: ok,
  reportReel: ok,
  getUserReels: ok,
  listReels: ok,
  getFeaturedReel: ok,
}));

jest.mock('../src/controllers/archiveController', () => ({
  archiveReel: ok,
  unarchiveReel: ok,
  getArchivedReels: ok,
}));

jest.unmock('../src/middleware/mediaValidation');

import reelsRoutes from '../src/routes/reels';
import storiesRoutes from '../src/routes/stories';
import uploadRoutes from '../src/routes/upload';

function getPostHandlers(router: any, path: string): Array<(req: any, res: any, next: any) => any> {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.post);
  if (!layer) throw new Error(`Route POST ${path} not found`);
  return layer.route.stack.map((s: any) => s.handle);
}

function createReq(headers: Record<string, string> = {}) {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) normalized[k.toLowerCase()] = v;
  return {
    headers: normalized,
    method: 'POST',
    path: '/',
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
  headers: Record<string, string> = {}
) {
  const req = createReq(headers);
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

describe('Upload route authz + validation hardening', () => {
  const uploadImageHandlers = getPostHandlers(uploadRoutes, '/image');
  const uploadImagesHandlers = getPostHandlers(uploadRoutes, '/images');
  const uploadAvatarHandlers = getPostHandlers(uploadRoutes, '/avatar');
  const uploadStoryHandlers = getPostHandlers(uploadRoutes, '/story');
  const uploadReelCoverHandlers = getPostHandlers(uploadRoutes, '/reel-cover');
  const storyCreateHandlers = getPostHandlers(storiesRoutes, '/');
  const reelCreateHandlers = getPostHandlers(reelsRoutes, '/');

  describe('401 protection', () => {
    it('rejects unauthenticated upload image', async () => {
      const res = await runRoute(uploadImageHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated story create', async () => {
      const res = await runRoute(storyCreateHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated upload story', async () => {
      const res = await runRoute(uploadStoryHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated upload reel cover', async () => {
      const res = await runRoute(uploadReelCoverHandlers);
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated reel create', async () => {
      const res = await runRoute(reelCreateHandlers);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('403 protection', () => {
    it('rejects forbidden upload image', async () => {
      const res = await runRoute(uploadImageHandlers, { 'x-auth-mode': 'forbidden' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects forbidden story create', async () => {
      const res = await runRoute(storyCreateHandlers, { 'x-auth-mode': 'forbidden' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects forbidden upload story', async () => {
      const res = await runRoute(uploadStoryHandlers, { 'x-auth-mode': 'forbidden' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects forbidden upload reel cover', async () => {
      const res = await runRoute(uploadReelCoverHandlers, { 'x-auth-mode': 'forbidden' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects forbidden reel create', async () => {
      const res = await runRoute(reelCreateHandlers, { 'x-auth-mode': 'forbidden' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('400 validation', () => {
    it('rejects disallowed upload image mime', async () => {
      const res = await runRoute(uploadImageHandlers, {
        'x-auth-mode': 'ok',
        'x-file-mimetype': 'text/plain',
        'x-file-body': 'not-an-image',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('not allowed');
    });

    it('rejects too many images on batch upload', async () => {
      const res = await runRoute(uploadImagesHandlers, {
        'x-auth-mode': 'ok',
        'x-files-count': '11',
        'x-file-mimetype': 'image/jpeg',
        'x-file-body': 'x',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Too many files');
    });

    it('rejects avatar upload when file is missing', async () => {
      const res = await runRoute(uploadAvatarHandlers, { 'x-auth-mode': 'ok' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('rejects upload story with disallowed mime', async () => {
      const res = await runRoute(uploadStoryHandlers, {
        'x-auth-mode': 'ok',
        'x-file-mimetype': 'text/plain',
        'x-file-body': 'bad-story-upload',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('not allowed');
    });

    it('rejects upload reel cover when file is missing', async () => {
      const res = await runRoute(uploadReelCoverHandlers, { 'x-auth-mode': 'ok' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('rejects disallowed story media mime', async () => {
      const res = await runRoute(storyCreateHandlers, {
        'x-auth-mode': 'ok',
        'x-file-mimetype': 'text/plain',
        'x-file-body': 'bad-story-media',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('not allowed');
    });

    it('rejects disallowed reel media mime', async () => {
      const res = await runRoute(reelCreateHandlers, {
        'x-auth-mode': 'ok',
        'x-file-mimetype': 'image/png',
        'x-file-body': 'bad-reel-media',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('not allowed');
    });
  });
});
