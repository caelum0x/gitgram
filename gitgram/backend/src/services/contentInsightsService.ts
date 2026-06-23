import prisma from '../utils/prisma';

export const getTopPerformingPosts = async (userId: string, limit = 10) => {
  const posts = await prisma.post.findMany({
    where: { userId },
    include: {
      _count: { select: { likes: true, comments: true } }
    },
    orderBy: { likes: { _count: 'desc' } },
    take: limit,
  });

  return posts.map(post => ({
    ...post,
    engagementScore: (post._count?.likes || 0) + (post._count?.comments || 0) * 2,
  }));
};

export const getAudienceDemographics = async (userId: string) => {
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: {
        select: {
          createdAt: true,
          _count: { select: { posts: true, followers: true } }
        }
      }
    }
  });

  const now = Date.now();
  const demographics = {
    newFollowers: 0,
    activeFollowers: 0,
    influencers: 0,
    avgFollowerCount: 0,
  };

  let totalFollowerCount = 0;

  followers.forEach(({ follower }) => {
    const accountAge = now - follower.createdAt.getTime();
    const daysOld = accountAge / (1000 * 60 * 60 * 24);

    if (daysOld < 30) demographics.newFollowers++;
    if (follower._count.posts > 10) demographics.activeFollowers++;
    if (follower._count.followers > 1000) demographics.influencers++;
    
    totalFollowerCount += follower._count.followers;
  });

  demographics.avgFollowerCount = followers.length > 0 
    ? Math.round(totalFollowerCount / followers.length) 
    : 0;

  return demographics;
};

export const getContentPerformance = async (userId: string, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const posts = await prisma.post.findMany({
    where: { userId, createdAt: { gte: startDate } },
    include: {
      _count: { select: { likes: true, comments: true } },
      hashtags: true,
    }
  });

  const withMedia = posts.filter(p => p.mediaUrls.length > 0);
  const withoutMedia = posts.filter(p => p.mediaUrls.length === 0);

  const avgEngagement = (posts: any[]) => {
    if (posts.length === 0) return 0;
    const total = posts.reduce((sum, p) => sum + p._count.likes + p._count.comments, 0);
    return Math.round(total / posts.length);
  };

  return {
    totalPosts: posts.length,
    withMedia: {
      count: withMedia.length,
      avgEngagement: avgEngagement(withMedia),
    },
    withoutMedia: {
      count: withoutMedia.length,
      avgEngagement: avgEngagement(withoutMedia),
    },
    topHashtags: getTopHashtags(posts),
  };
};

function getTopHashtags(posts: any[]) {
  const hashtagCount: Record<string, number> = {};
  
  posts.forEach(post => {
    post.hashtags.forEach((tag: any) => {
      hashtagCount[tag.name] = (hashtagCount[tag.name] || 0) + 1;
    });
  });

  return Object.entries(hashtagCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}
