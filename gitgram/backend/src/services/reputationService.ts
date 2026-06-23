import prisma from '../utils/prisma';

export const calculateReputation = async (userId: string): Promise<number> => {
  const [posts, followers, likes, comments] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.like.count({ where: { post: { userId } } }),
    prisma.comment.count({ where: { post: { userId } } }),
  ]);

  // Reputation formula
  const reputation = 
    (posts * 10) +           // 10 points per post
    (followers * 5) +        // 5 points per follower
    (likes * 2) +            // 2 points per like received
    (comments * 3);          // 3 points per comment received

  return Math.min(reputation, 10000); // Cap at 10k
};

export const getUserLevel = (reputation: number): string => {
  if (reputation < 100) return 'Newbie';
  if (reputation < 500) return 'Regular';
  if (reputation < 1000) return 'Active';
  if (reputation < 2500) return 'Influencer';
  if (reputation < 5000) return 'Star';
  return 'Legend';
};
