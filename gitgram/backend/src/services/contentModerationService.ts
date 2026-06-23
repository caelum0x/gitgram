import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { ReportStatus, ReportTargetType } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface BannedContentResult {
  flagged: boolean;
  matches: string[];
}

export interface SpamCheckResult {
  spam: boolean;
  confidence: number;
  reasons: string[];
}

export type ModerationAction = 'auto_remove' | 'escalate' | 'dismiss';

export interface ModerationDecision {
  action: ModerationAction;
  reason: string;
  confidence: number;
}

export interface ContentScore {
  qualityScore: number;
  spamScore: number;
  toxicityScore: number;
}

export interface ModerationStats {
  totalReports: number;
  autoResolved: number;
  escalated: number;
  dismissed: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AUTO_REMOVE_THRESHOLD = 0.9;
const ESCALATE_THRESHOLD = 0.5;
const MAX_POSTS_PER_HOUR = 10;

const DEFAULT_BANNED_WORDS: readonly string[] = [
  'spam',
  'scam',
  'phishing',
  'malware',
  'ransomware',
  'exploit',
  'hack',
  'crack',
  'warez',
  'pirate',
  'torrrent',
  'xxxxx',
  'porn',
  'nude',
  'nsfw',
  'onlyfans',
  'deepfake',
];

const SPAM_PATTERNS: readonly RegExp[] = [
  /\b(click here|click now)\b/i,
  /\b(buy now|order now|shop now)\b/i,
  /\b(limited time offer|act now|hurry)\b/i,
  /\b(free money|make money fast|earn \$)\b/i,
  /\b(work from home|work from anywhere)\b/i,
  /\b(bitcoin|crypto|nft)\s+(investment|opportunity|profit)\b/i,
  /\b(double your money|100x returns)\b/i,
  /\b(congratulations you (won|have won))\b/i,
  /\b(claim your prize|claim now)\b/i,
  /\b(diet pills?|weight loss guaranteed)\b/i,
];

const TOXICITY_PATTERNS: readonly RegExp[] = [
  /\b(kill yourself|kys)\b/i,
  /\b(go die|i hope you die)\b/i,
  /\b(you('re| are) (worthless|garbage|trash|pathetic))\b/i,
  /\b(hate (all )?(women|men|blacks|whites|jews|muslims|gays|lgbtq))\b/i,
  /\b(f[a4]gg[o0]t|n[i1]gg[e3]r|ch[i1]nk|sp[i1]c)\b/i,
];

// ============================================================================
// KEYWORD FILTERING
// ============================================================================

function loadBannedWords(): string[] {
  const envWords = process.env.BANNED_WORDS;
  if (envWords && envWords.trim().length > 0) {
    return envWords
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);
  }
  return [...DEFAULT_BANNED_WORDS];
}

export function containsBannedContent(text: string): BannedContentResult {
  const bannedWords = loadBannedWords();
  const lower = text.toLowerCase();

  const matches = bannedWords.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`);
    return pattern.test(lower);
  });

  return {
    flagged: matches.length > 0,
    matches,
  };
}

// ============================================================================
// SPAM DETECTION
// ============================================================================

export async function isLikelySpam(
  content: string,
  userId: string
): Promise<SpamCheckResult> {
  const reasons: string[] = [];
  let score = 0;

  // Check excessive URLs
  const urlMatches = content.match(/https?:\/\/[^\s]+/g) ?? [];
  if (urlMatches.length > 3) {
    const urlScore = Math.min((urlMatches.length - 3) * 0.1, 0.4);
    score += urlScore;
    reasons.push(`Excessive URLs: ${urlMatches.length}`);
  }

  // Check repeated characters (e.g. "aaaaaa", "!!!!!!")
  const repeatedCharMatch = content.match(/(.)\1{4,}/g) ?? [];
  if (repeatedCharMatch.length > 0) {
    score += 0.2;
    reasons.push(`Repeated character sequences: ${repeatedCharMatch.length}`);
  }

  // Check known spam patterns
  const matchedPatterns = SPAM_PATTERNS.filter((p) => p.test(content));
  if (matchedPatterns.length > 0) {
    score += matchedPatterns.length * 0.25;
    reasons.push(`Matched ${matchedPatterns.length} spam pattern(s)`);
  }

  // Check all-caps ratio (shouting)
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 20) {
    const capsRatio = (content.replace(/[^A-Z]/g, '').length) / letters.length;
    if (capsRatio > 0.7) {
      score += 0.15;
      reasons.push(`High caps ratio: ${Math.round(capsRatio * 100)}%`);
    }
  }

  // Check repetitive word usage
  const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 8) {
    const uniqueWords = new Set(words);
    const uniqueRatio = uniqueWords.size / words.length;
    if (uniqueRatio < 0.35) {
      score += 0.2;
      reasons.push(`Low unique word ratio: ${Math.round(uniqueRatio * 100)}%`);
    }
  }

  // Check user's recent post frequency (> 10 posts/hour = spam)
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentPostCount = await prisma.post.count({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentPostCount > MAX_POSTS_PER_HOUR) {
      const excess = recentPostCount - MAX_POSTS_PER_HOUR;
      const freqScore = Math.min(excess * 0.05, 0.4);
      score += freqScore;
      reasons.push(`High posting frequency: ${recentPostCount} posts/hour`);
    }
  } catch (err: unknown) {
    logger.warn('contentModerationService: failed to query post frequency', { err });
  }

  const confidence = Math.min(score, 1);

  return {
    spam: confidence >= 0.5,
    confidence,
    reasons,
  };
}

// ============================================================================
// CONTENT SCORING
// ============================================================================

export function scoreContent(content: string): ContentScore {
  // Quality score: penalise very short content, low word variety, lack of punctuation
  let qualityScore = 1.0;

  const wordCount = content.trim().split(/\s+/).length;
  if (wordCount < 3) {
    qualityScore -= 0.4;
  } else if (wordCount < 8) {
    qualityScore -= 0.2;
  }

  const hasPunctuation = /[.!?,;:]/.test(content);
  if (!hasPunctuation && wordCount > 5) {
    qualityScore -= 0.1;
  }

  const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 5) {
    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.5) {
      qualityScore -= 0.3;
    }
  }

  qualityScore = Math.max(0, Math.min(1, qualityScore));

  // Spam score: URL density + pattern matching
  let spamScore = 0;
  const urlCount = (content.match(/https?:\/\/[^\s]+/g) ?? []).length;
  if (urlCount > 0) {
    spamScore += Math.min(urlCount * 0.1, 0.4);
  }
  const matchedSpam = SPAM_PATTERNS.filter((p) => p.test(content)).length;
  spamScore += Math.min(matchedSpam * 0.2, 0.6);
  spamScore = Math.min(1, spamScore);

  // Toxicity score: regex-based
  let toxicityScore = 0;
  const matchedToxic = TOXICITY_PATTERNS.filter((p) => p.test(content)).length;
  toxicityScore = Math.min(matchedToxic * 0.35, 1);

  // Also factor in banned-word matches
  const { matches: bannedMatches } = containsBannedContent(content);
  if (bannedMatches.length > 0) {
    toxicityScore = Math.min(toxicityScore + bannedMatches.length * 0.15, 1);
  }

  return {
    qualityScore,
    spamScore,
    toxicityScore,
  };
}

// ============================================================================
// REPORT PROCESSING
// ============================================================================

export async function processReport(reportId: string): Promise<ModerationDecision> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    logger.warn('contentModerationService: report not found', { reportId });
    return {
      action: 'dismiss',
      reason: 'Report not found',
      confidence: 0,
    };
  }

  // Resolve the text content from the polymorphic target
  let postContent = '';
  let postUserId = '';

  if (report.targetType === ReportTargetType.POST) {
    const post = await prisma.post.findUnique({
      where: { id: report.targetId },
      select: { content: true, userId: true },
    });
    postContent = post?.content ?? '';
    postUserId = post?.userId ?? '';
  }

  if (!postContent) {
    return {
      action: 'escalate',
      reason: 'No text content available for automated analysis; requires human review',
      confidence: 0.5,
    };
  }

  // Run automated checks in parallel for performance
  const [spamResult, bannedResult] = await Promise.all([
    isLikelySpam(postContent, postUserId),
    Promise.resolve(containsBannedContent(postContent)),
  ]);

  const scores = scoreContent(postContent);

  // Compute an aggregate confidence score
  const maxSignal = Math.max(
    spamResult.confidence,
    scores.toxicityScore,
    bannedResult.flagged ? 0.8 : 0,
  );

  const reasons: string[] = [
    ...spamResult.reasons,
    ...(bannedResult.matches.length > 0
      ? [`Banned words detected: ${bannedResult.matches.join(', ')}`]
      : []),
    ...(scores.toxicityScore > 0.3 ? [`Toxicity score: ${scores.toxicityScore.toFixed(2)}`] : []),
  ];

  const reasonSummary = reasons.length > 0
    ? reasons.join('; ')
    : 'No specific violations detected';

  if (maxSignal >= AUTO_REMOVE_THRESHOLD) {
    logger.info('contentModerationService: auto-removing content', { reportId, confidence: maxSignal });
    return {
      action: 'auto_remove',
      reason: reasonSummary,
      confidence: maxSignal,
    };
  }

  if (maxSignal >= ESCALATE_THRESHOLD) {
    logger.info('contentModerationService: escalating to human review', { reportId, confidence: maxSignal });
    return {
      action: 'escalate',
      reason: reasonSummary,
      confidence: maxSignal,
    };
  }

  return {
    action: 'dismiss',
    reason: reasons.length > 0 ? reasonSummary : 'Content passed automated checks',
    confidence: maxSignal,
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

export async function getModerationStats(days: number): Promise<ModerationStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalReports, autoResolved, escalated, dismissed] = await Promise.all([
    prisma.report.count({
      where: { createdAt: { gte: since } },
    }),
    prisma.report.count({
      where: {
        createdAt: { gte: since },
        status: ReportStatus.RESOLVED,
        resolvedBy: null, // null resolvedBy indicates automated resolution
      },
    }),
    prisma.report.count({
      where: {
        createdAt: { gte: since },
        status: ReportStatus.PENDING,
        escalated: true,
      },
    }),
    prisma.report.count({
      where: {
        createdAt: { gte: since },
        status: ReportStatus.DISMISSED,
      },
    }),
  ]);

  return {
    totalReports,
    autoResolved,
    escalated,
    dismissed,
  };
}
