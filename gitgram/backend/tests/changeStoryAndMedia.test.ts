import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/services/repositoryService', () => {
  const prismaClient = require('../src/utils/prisma').default;
  return {
    repositoryService: {
      getRepository: async (owner: string, name: string) => {
        const repo = await prismaClient.repository.findUnique({
          where: { fullName: `${owner}/${name}` },
        });
        if (!repo) throw new Error('Repository not found');
        return repo;
      },
    },
  };
});

describe('Change Story + Multipart Media Integration', () => {
  let app: Express;
  let userId: string;
  let authToken: string;
  let repositoryId: string;
  const owner = 'aitmowner';
  const repoName = 'checkpoint-repo';

  beforeAll(async () => {
    app = createApp();

    const user = await prisma.user.create({
      data: {
        username: 'aitm_creator',
        email: 'aitm_creator@example.com',
        password: 'hashedpassword',
        githubUsername: owner,
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;

    await prisma.account.create({
      data: {
        type: 'USER',
        username: user.username || `u_${user.id}`,
        userId: user.id,
      },
    });

    const repository = await prisma.repository.create({
      data: {
        owner,
        name: repoName,
        fullName: `${owner}/${repoName}`,
        htmlUrl: `https://github.com/${owner}/${repoName}`,
        topics: [],
        description: 'test repo',
        claimedBy: user.id,
      },
    });
    repositoryId = repository.id;
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { userId } });
    await prisma.reel.deleteMany({ where: { userId } });
    await prisma.story.deleteMany({ where: { userId } });
    await prisma.repository.deleteMany({ where: { id: repositoryId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates repository change-story post with strict payload', async () => {
    const response = await request(app)
      .post(`/api/v1/repositories/${owner}/${repoName}/change-story`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Fix rollback after bad AI patch',
        summary: 'Restored to stable checkpoint before regression.',
        checkpointId: 'cp_2026_02_15_001',
        fromCheckpointId: 'cp_2026_02_15_000',
        aitmProjectId: 'proj_aitm_abc',
        diffSummary: { added: 12, removed: 4, modified: 7 },
        changedFiles: ['src/app/page.tsx', 'src/lib/api.ts'],
      });

    expect(response.status).toBe(201);
    expect(response.body.post).toBeTruthy();
    expect(response.body.post.content).toContain('[AITM_CHANGE_STORY]');
    expect(response.body.post.repositoryId).toBe(repositoryId);
  });

  it('rejects invalid change-story payload (missing checkpointId)', async () => {
    const response = await request(app)
      .post(`/api/v1/repositories/${owner}/${repoName}/change-story`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Invalid payload',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('creates a checkpoint-linked post without requiring a separate caption', async () => {
    const response = await request(app)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .field('checkpointId', 'cp_checkpoint_only_001')
      .field('aitmProjectId', 'proj_checkpoint_only')
      .field('fromCheckpointId', 'cp_checkpoint_only_000')
      .field('changeStoryTitle', 'Checkpoint-only rollback')
      .field('diffSummary', JSON.stringify({ added: 5, removed: 2, modified: 3 }))
      .field('changedFiles', JSON.stringify(['src/index.ts', 'README.md']));

    expect(response.status).toBe(201);
    expect(response.body.post.type).toBe('CHANGE_STORY');
    expect(response.body.post.content).toContain('[AITM_CHANGE_STORY]');
    expect(response.body.post.content).toContain('title=Checkpoint-only rollback');
    expect(response.body.post.aitmCheckpointId).toBe('cp_checkpoint_only_001');
  });

  it('creates reel via multipart video upload', async () => {
    const response = await request(app)
      .post('/api/v1/reels')
      .set('Authorization', `Bearer ${authToken}`)
      .field('caption', 'Reel from repository changes')
      .field('repoOwner', owner)
      .field('repoName', repoName)
      .attach('video', Buffer.from('FAKE_VIDEO_BYTES'), {
        filename: 'demo.mp4',
        contentType: 'video/mp4',
      });

    expect(response.status).toBe(201);
    expect(response.body.videoUrl).toBeTruthy();
    expect(response.body.repository?.fullName).toBe(`${owner}/${repoName}`);
  });

  it('rejects reel multipart with non-video media', async () => {
    const response = await request(app)
      .post('/api/v1/reels')
      .set('Authorization', `Bearer ${authToken}`)
      .field('caption', 'Invalid reel')
      .attach('video', Buffer.from('NOT_A_VIDEO'), {
        filename: 'bad.code',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('video');
  });

  it('creates story via multipart media upload', async () => {
    const response = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${authToken}`)
      .field('caption', 'Story update from AITM checkpoint')
      .field('repoOwner', owner)
      .field('repoName', repoName)
      .attach('media', Buffer.from('FAKE_IMAGE_BYTES'), {
        filename: 'story.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(201);
    expect(response.body.mediaUrl).toBeTruthy();
    expect(response.body.repository?.fullName).toBe(`${owner}/${repoName}`);
  });

  it('rejects story multipart with invalid media type', async () => {
    const response = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${authToken}`)
      .field('caption', 'Invalid story media')
      .attach('media', Buffer.from('BINARY'), {
        filename: 'file.code',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Story media');
  });
});
