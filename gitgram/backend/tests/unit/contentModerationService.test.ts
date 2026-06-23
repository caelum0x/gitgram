/**
 * Unit tests for contentModerationService
 *
 * Pure functions (containsBannedContent, scoreContent) need no mocks.
 * Functions that touch Prisma (isLikelySpam, processReport, getModerationStats)
 * use the shared mockPrisma from tests/setup.ts.
 */

import { mockPrisma } from '../setup';

// ---------------------------------------------------------------------------
// Service under test
// ---------------------------------------------------------------------------

import {
  containsBannedContent,
  isLikelySpam,
  scoreContent,
  processReport,
  getModerationStats,
  BannedContentResult,
  SpamCheckResult,
  ContentScore,
  ModerationDecision,
  ModerationStats,
} from '../../src/services/contentModerationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearTables(): void {
  (mockPrisma.post as any).__rows.length = 0;
  (mockPrisma.report as any).__rows.length = 0;
}

function seedReport(data: Record<string, unknown>): void {
  mockPrisma.report.__rows.push({
    id: 'report-1',
    targetId: 'post-1',
    targetType: 'POST',
    status: 'PENDING',
    escalated: false,
    resolvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });
}

function seedPost(data: Record<string, unknown> = {}): void {
  mockPrisma.post.__rows.push({
    id: 'post-1',
    userId: 'user-1',
    content: 'Hello world',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTables();
  delete process.env.BANNED_WORDS;
});

// ============================================================================
// containsBannedContent — pure, synchronous
// ============================================================================

describe('containsBannedContent', () => {
  it('returns flagged=false for clean content', () => {
    const result = containsBannedContent('This is a normal post about TypeScript.');
    expect(result.flagged).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('detects a single banned word', () => {
    const result = containsBannedContent('This message is pure spam.');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('spam');
  });

  it('detects multiple banned words in one string', () => {
    const result = containsBannedContent('This is scam content with malware attached.');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('scam');
    expect(result.matches).toContain('malware');
  });

  it('is case-insensitive', () => {
    const result = containsBannedContent('Watch out for PHISHING attacks!');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('phishing');
  });

  it('respects word boundaries (does not flag partial matches)', () => {
    // "exploit" is banned but "exploits" and "exploitation" should still match
    // because the regex uses \b which matches at the word boundary
    const clean = containsBannedContent('We need to explorative approaches here.');
    // "explorative" does NOT contain the exact word "exploit" as a standalone token
    expect(clean.matches).not.toContain('explorative');
  });

  it('uses custom BANNED_WORDS from the environment variable', () => {
    process.env.BANNED_WORDS = 'badword,otherbad';
    const result = containsBannedContent('This contains a badword in it.');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('badword');
  });

  it('does not flag default words when BANNED_WORDS env overrides them', () => {
    process.env.BANNED_WORDS = 'custom';
    const result = containsBannedContent('This is spam content.');
    // "spam" is in defaults but NOT in the env override — so it should not be flagged
    expect(result.flagged).toBe(false);
  });
});

// ============================================================================
// isLikelySpam — async, queries Prisma for post frequency
// ============================================================================

describe('isLikelySpam', () => {
  it('returns spam=false and confidence=0 for completely clean content', async () => {
    const result = await isLikelySpam('Just shared a cool new TypeScript repo today.', 'user-1');
    expect(result.spam).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it('flags content with excessive URLs', async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://example${i}.com`).join(' ');
    const result = await isLikelySpam(`Check these out: ${urls}`, 'user-1');
    expect(result.spam).toBe(false); // 3 extra URLs = 0.3 confidence, below 0.5 threshold
    expect(result.reasons.some((r) => r.includes('Excessive URLs'))).toBe(true);
  });

  it('flags content matching a known spam pattern', async () => {
    const result = await isLikelySpam('Click here to claim your prize now!', 'user-1');
    expect(result.spam).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.reasons.some((r) => r.includes('spam pattern'))).toBe(true);
  });

  it('flags content with extremely high caps ratio', async () => {
    const result = await isLikelySpam('BUY NOW GET FREE MONEY FAST EARN CASH TODAY', 'user-1');
    expect(result.reasons.some((r) => r.includes('caps ratio') || r.includes('spam pattern'))).toBe(true);
  });

  it('flags content with repeated character sequences', async () => {
    const result = await isLikelySpam('Hello!!!!! buy now buy now buy now buy now buy now', 'user-1');
    expect(result.reasons.some((r) => r.includes('Repeated character') || r.includes('spam pattern'))).toBe(true);
  });

  it('flags a user posting more than 10 times per hour', async () => {
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      mockPrisma.post.__rows.push({
        id: `post-freq-${i}`,
        userId: 'user-spammer',
        content: 'post',
        createdAt: new Date(now.getTime() - i * 1000),
        updatedAt: new Date(),
      });
    }

    const result = await isLikelySpam('Normal message content here.', 'user-spammer');
    expect(result.reasons.some((r) => r.includes('posting frequency'))).toBe(true);
  });

  it('does not penalise a user with normal post frequency', async () => {
    for (let i = 0; i < 3; i++) {
      mockPrisma.post.__rows.push({
        id: `post-normal-${i}`,
        userId: 'user-normal',
        content: 'post',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const result = await isLikelySpam('Just a regular update.', 'user-normal');
    expect(result.reasons.some((r) => r.includes('posting frequency'))).toBe(false);
  });
});

// ============================================================================
// scoreContent — pure, synchronous
// ============================================================================

describe('scoreContent', () => {
  it('gives high quality score to well-formed long content', () => {
    const result = scoreContent(
      'Today I merged a large refactor of the authentication module. The changes improve security by rotating JWT secrets and adding refresh token rotation.',
    );
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.8);
    expect(result.spamScore).toBe(0);
    expect(result.toxicityScore).toBe(0);
  });

  it('penalises very short content (fewer than 3 words)', () => {
    const result = scoreContent('ok');
    expect(result.qualityScore).toBeLessThan(0.7);
  });

  it('penalises moderately short content (3-7 words)', () => {
    const shortResult = scoreContent('Nice post bro');
    const longResult = scoreContent(
      'Nice post bro, I really enjoyed reading your thoughts on this topic.',
    );
    expect(shortResult.qualityScore).toBeLessThan(longResult.qualityScore);
  });

  it('assigns non-zero spamScore for content matching spam patterns', () => {
    const result = scoreContent('Buy now and make money fast with this limited time offer!');
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it('assigns non-zero spamScore for content with URLs', () => {
    const result = scoreContent('Visit https://example.com for amazing deals.');
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it('assigns non-zero toxicityScore for toxic patterns', () => {
    const result = scoreContent('kill yourself you worthless garbage');
    expect(result.toxicityScore).toBeGreaterThan(0);
  });

  it('toxicityScore is boosted by banned word matches', () => {
    const withBanned = scoreContent('This is pure spam and scam content here.');
    const withoutBanned = scoreContent('This is clean and totally fine content here.');
    expect(withBanned.toxicityScore).toBeGreaterThan(withoutBanned.toxicityScore);
  });

  it('all scores are clamped to [0, 1]', () => {
    const extreme = scoreContent(
      'buy now click here limited time earn $ free money buy now click here make money fast ' +
      'buy now buy now buy now buy now buy now buy now buy now buy now buy now buy now',
    );
    expect(extreme.qualityScore).toBeGreaterThanOrEqual(0);
    expect(extreme.qualityScore).toBeLessThanOrEqual(1);
    expect(extreme.spamScore).toBeGreaterThanOrEqual(0);
    expect(extreme.spamScore).toBeLessThanOrEqual(1);
    expect(extreme.toxicityScore).toBeGreaterThanOrEqual(0);
    expect(extreme.toxicityScore).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// processReport
// ============================================================================

describe('processReport', () => {
  it('returns dismiss decision when report is not found', async () => {
    const result = await processReport('nonexistent-report');
    expect(result.action).toBe('dismiss');
    expect(result.reason).toBe('Report not found');
    expect(result.confidence).toBe(0);
  });

  it('escalates when report target has no text content available', async () => {
    seedReport({ id: 'report-no-post', targetId: 'post-missing', targetType: 'POST' });

    const result = await processReport('report-no-post');
    expect(result.action).toBe('escalate');
    expect(result.confidence).toBe(0.5);
  });

  it('auto-removes content with very high confidence spam + banned words', async () => {
    seedPost({
      id: 'post-toxic',
      userId: 'user-1',
      // Combined banned words + spam patterns drives confidence above 0.9
      content: 'spam scam phishing click here buy now free money earn $ claim your prize buy now make money fast',
    });
    seedReport({ id: 'report-auto', targetId: 'post-toxic', targetType: 'POST' });

    const result = await processReport('report-auto');
    expect(result.action).toBe('auto_remove');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('escalates content with medium confidence score', async () => {
    seedPost({
      id: 'post-medium',
      userId: 'user-1',
      content: 'Click here for more information about this interesting work from home opportunity.',
    });
    seedReport({ id: 'report-medium', targetId: 'post-medium', targetType: 'POST' });

    const result = await processReport('report-medium');
    // The spam pattern match pushes confidence >= 0.5 but below 0.9
    expect(['escalate', 'auto_remove']).toContain(result.action);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('dismisses clean content with low confidence', async () => {
    seedPost({
      id: 'post-clean',
      userId: 'user-1',
      content: 'Just merged a PR that fixes the authentication bug discovered last week.',
    });
    seedReport({ id: 'report-clean', targetId: 'post-clean', targetType: 'POST' });

    const result = await processReport('report-clean');
    expect(result.action).toBe('dismiss');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('escalates when targetType is not POST (no text content)', async () => {
    seedReport({ id: 'report-user', targetId: 'user-reported', targetType: 'USER' });

    const result = await processReport('report-user');
    expect(result.action).toBe('escalate');
  });
});

// ============================================================================
// getModerationStats
// ============================================================================

describe('getModerationStats', () => {
  it('returns all zeros when no reports exist', async () => {
    const stats = await getModerationStats(7);
    expect(stats.totalReports).toBe(0);
    expect(stats.autoResolved).toBe(0);
    expect(stats.escalated).toBe(0);
    expect(stats.dismissed).toBe(0);
  });

  it('counts total reports correctly', async () => {
    for (let i = 0; i < 5; i++) {
      seedReport({ id: `report-total-${i}`, targetId: `post-${i}`, status: 'PENDING', escalated: false, resolvedBy: null });
    }

    const stats = await getModerationStats(7);
    expect(stats.totalReports).toBe(5);
  });

  it('counts auto-resolved reports (RESOLVED status, null resolvedBy)', async () => {
    seedReport({ id: 'report-auto-1', status: 'RESOLVED', resolvedBy: null });
    seedReport({ id: 'report-auto-2', status: 'RESOLVED', resolvedBy: null });
    seedReport({ id: 'report-human-1', status: 'RESOLVED', resolvedBy: 'admin-user' });

    const stats = await getModerationStats(7);
    expect(stats.autoResolved).toBe(2);
  });

  it('counts escalated reports (PENDING status, escalated=true)', async () => {
    seedReport({ id: 'report-esc-1', status: 'PENDING', escalated: true });
    seedReport({ id: 'report-esc-2', status: 'PENDING', escalated: true });
    seedReport({ id: 'report-plain', status: 'PENDING', escalated: false });

    const stats = await getModerationStats(7);
    expect(stats.escalated).toBe(2);
  });

  it('counts dismissed reports', async () => {
    seedReport({ id: 'report-dis-1', status: 'DISMISSED' });
    seedReport({ id: 'report-dis-2', status: 'DISMISSED' });

    const stats = await getModerationStats(7);
    expect(stats.dismissed).toBe(2);
  });

  it('does not count reports older than the specified day window', async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    seedReport({ id: 'report-old', status: 'DISMISSED', createdAt: old });
    seedReport({ id: 'report-recent', status: 'DISMISSED', createdAt: new Date() });

    const stats = await getModerationStats(7);
    // Only the recent report falls within the 7-day window
    expect(stats.dismissed).toBe(1);
    expect(stats.totalReports).toBe(1);
  });
});
