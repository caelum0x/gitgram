import prisma from '../utils/prisma';
import logger from '../utils/logger';

interface PerformanceMetrics {
  avgResponseTime: number;
  requestCount: number;
  errorRate: number;
  activeUsers: number;
  dbConnections: number;
}

export const getPerformanceMetrics = async (): Promise<PerformanceMetrics> => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [activeUsers, recentPosts] = await Promise.all([
    prisma.user.count({
      where: {
        OR: [
          { posts: { some: { createdAt: { gte: oneHourAgo } } } },
          { likes: { some: { createdAt: { gte: oneHourAgo } } } },
          { comments: { some: { createdAt: { gte: oneHourAgo } } } },
        ]
      }
    }),
    prisma.post.count({
      where: { createdAt: { gte: oneHourAgo } }
    })
  ]);

  return {
    avgResponseTime: 0, // Populated by middleware
    requestCount: 0, // Populated by middleware
    errorRate: 0, // Populated by middleware
    activeUsers,
    dbConnections: 0, // Populated by connection pool
  };
};

export const logSlowQuery = async (query: string, duration: number) => {
  if (duration > 1000) { // Log queries > 1 second
    logger.warn(`Slow query detected (${duration}ms):`, query);
  }
};
