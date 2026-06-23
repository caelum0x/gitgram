import prisma from '../utils/prisma';

const spamKeywords = [
  'click here', 'buy now', 'limited time', 'act now', 'free money', 'make money fast',
  'work from home', 'earn $', 'prize', 'winner', 'congratulations', 'claim now',
  'bitcoin', 'crypto', 'investment opportunity', 'double your money'
];

export const detectSpam = async (text: string, userId: string): Promise<{ isSpam: boolean; score: number; reasons: string[] }> => {
  const reasons: string[] = [];
  let score = 0;

  // Check spam keywords
  const lowerText = text.toLowerCase();
  const keywordMatches = spamKeywords.filter(keyword => lowerText.includes(keyword));
  if (keywordMatches.length > 0) {
    score += keywordMatches.length * 0.2;
    reasons.push(`Contains ${keywordMatches.length} spam keyword(s)`);
  }

  // Check excessive links
  const urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urlCount > 2) {
    score += 0.3;
    reasons.push(`Contains ${urlCount} links`);
  }

  // Check excessive emojis
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
  if (emojiCount > 10) {
    score += 0.2;
    reasons.push('Excessive emojis');
  }

  // Check repetitive content
  const words = text.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 10 && uniqueWords.size / words.length < 0.3) {
    score += 0.3;
    reasons.push('Repetitive content');
  }

  // Check user posting frequency (last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentPosts = await prisma.post.count({
    where: {
      userId,
      createdAt: { gte: fiveMinutesAgo }
    }
  });

  if (recentPosts > 5) {
    score += 0.4;
    reasons.push(`${recentPosts} posts in 5 minutes`);
  }

  return {
    isSpam: score >= 0.5,
    score: Math.min(score, 1),
    reasons
  };
};
