import { buildPostCandidateWhere } from '../src/services/trendingRankingService';

describe('trendingRankingService post candidates', () => {
  it('includes published change stories in post trending candidates', () => {
    const windowStart = new Date('2026-05-14T00:00:00.000Z');

    const where = buildPostCandidateWhere(windowStart);

    expect(where).toMatchObject({
      createdAt: { gte: windowStart },
      isArchived: false,
      status: 'PUBLISHED',
      type: { in: ['POST', 'CHANGE_STORY'] },
    });
  });
});
