import prisma from '../utils/prisma';

export const detectFakeAccount = async (userId: string): Promise<{ isFake: boolean; score: number; reasons: string[] }> => {
  const reasons: string[] = [];
  let score = 0;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: true,
      followers: true,
      following: true,
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true
        }
      }
    }
  });

  if (!user) return { isFake: false, score: 0, reasons: [] };

  // Check profile completeness
  if (!user.avatar || user.avatar.includes('default')) {
    score += 0.2;
    reasons.push('No profile picture');
  }

  if (!user.bio || user.bio.length < 10) {
    score += 0.15;
    reasons.push('No bio or very short bio');
  }

  // Check account age
  const accountAge = Date.now() - user.createdAt.getTime();
  const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
  if (daysSinceCreation < 1) {
    score += 0.2;
    reasons.push('Account less than 1 day old');
  }

  // Check follower/following ratio
  const followerCount = user._count.followers;
  const followingCount = user._count.following;
  if (followingCount > 100 && followerCount < 10) {
    score += 0.3;
    reasons.push('Suspicious follower/following ratio');
  }

  // Check posting activity
  const postCount = user._count.posts;
  if (postCount === 0 && daysSinceCreation > 7) {
    score += 0.2;
    reasons.push('No posts after 7 days');
  }

  // Check username pattern (random characters)
  const randomPattern = /^[a-z]{10,}[0-9]{5,}$/i;
  if (user.username && randomPattern.test(user.username)) {
    score += 0.25;
    reasons.push('Random username pattern');
  }

  // Check email verification
  if (!user.emailVerified) {
    score += 0.15;
    reasons.push('Email not verified');
  }

  return {
    isFake: score >= 0.6,
    score: Math.min(score, 1),
    reasons
  };
};
