import prisma from '../utils/prisma';

interface SearchFilters {
  query: string;
  type?: 'users' | 'posts' | 'hashtags' | 'all';
  dateFrom?: Date;
  dateTo?: Date;
  hasMedia?: boolean;
  verified?: boolean;
  minLikes?: number;
  category?: string;
}

export const advancedSearch = async (filters: SearchFilters, limit = 20) => {
  const { query, type = 'all', dateFrom, dateTo, hasMedia, verified, minLikes, category } = filters;

  const results: any = { users: [], posts: [], hashtags: [] };

  if (type === 'users' || type === 'all') {
    results.users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
          { bio: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        _count: { select: { followers: true, posts: true } }
      }
    });
  }

  if (type === 'posts' || type === 'all') {
    results.posts = await prisma.post.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        isArchived: false,
        ...(dateFrom && { createdAt: { gte: dateFrom } }),
        ...(dateTo && { createdAt: { lte: dateTo } }),
        ...(hasMedia && { mediaUrls: { isEmpty: false } }),
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        _count: { select: { likes: true, comments: true } }
      },
      take: limit,
      orderBy: { createdAt: 'desc' }
    });

    if (minLikes) {
      results.posts = results.posts.filter((p: any) => p._count.likes >= minLikes);
    }
  }

  if (type === 'hashtags' || type === 'all') {
    results.hashtags = await prisma.hashtag.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      include: { _count: { select: { posts: true } } },
      take: limit,
      orderBy: { posts: { _count: 'desc' } }
    });
  }

  return results;
};
