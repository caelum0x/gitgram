import { calculateTotalPenalty, type AntiGamingAnomaly } from '../src/services/trendingScoring';
import type { AntiGamingConfig } from '../src/config/trending';

const antiGamingConfig: AntiGamingConfig = {
  enabled: true,
  velocityCaps: {
    postLikes: { maxEventsPerWindow: 10, windowMinutes: 10, penaltyWeight: 0.4 },
    postComments: { maxEventsPerWindow: 8, windowMinutes: 15, penaltyWeight: 0.3 },
    repoFollows: { maxEventsPerWindow: 20, windowMinutes: 30, penaltyWeight: 0.5 },
    userFollows: { maxEventsPerWindow: 15, windowMinutes: 20, penaltyWeight: 0.6 },
  },
  suspiciousPatterns: {
    newAccountThreshold: 0.5,
    newAccountAgeDays: 1,
    lowActivityThreshold: 0.4,
    minEngagementsForCheck: 5,
    maxCommentsPerUserPerPost: 5,
    ipClusterMinSharedUsers: 3,
    newAccountPenaltyWeight: 0.5,
    lowActivityPenaltyWeight: 0.3,
    commentSpamPenaltyWeight: 0.2,
    ipClusterPenaltyWeight: 0.4,
  },
  flaggedEntityDampening: {
    dampeningMultiplier: 0.5,
    anomalyCountThreshold: 2,
    anomalyWindowHours: 48,
  },
  maxTotalPenalty: 0.95,
};

describe('trendingScoring.calculateTotalPenalty', () => {
  it('uses postComments penalty weight for burst_comments anomalies', () => {
    const anomalies: AntiGamingAnomaly[] = [
      { type: 'burst_comments', severity: 1, details: 'comment burst', actorIds: [] },
    ];

    const penalty = calculateTotalPenalty(anomalies, antiGamingConfig);

    expect(penalty).toBeCloseTo(0.3, 6);
  });

  it('applies different weights per anomaly type and sums penalties', () => {
    const anomalies: AntiGamingAnomaly[] = [
      { type: 'burst_likes', severity: 0.5, details: 'like burst', actorIds: [] },
      { type: 'new_account_engagement', severity: 0.6, details: 'new accounts', actorIds: [] },
      { type: 'ip_cluster', severity: 0.5, details: 'shared ip', actorIds: [] },
    ];

    const penalty = calculateTotalPenalty(anomalies, antiGamingConfig);

    // 0.5*0.4 + 0.6*0.5 + 0.5*0.4 = 0.7
    expect(penalty).toBeCloseTo(0.7, 6);
  });

  it('caps total penalty at maxTotalPenalty', () => {
    const anomalies: AntiGamingAnomaly[] = [
      { type: 'new_account_engagement', severity: 1, details: 'a', actorIds: [] },
      { type: 'low_activity_engagers', severity: 1, details: 'b', actorIds: [] },
      { type: 'ip_cluster', severity: 1, details: 'c', actorIds: [] },
      { type: 'fake_followers', severity: 1, details: 'd', actorIds: [] },
    ];

    const penalty = calculateTotalPenalty(anomalies, antiGamingConfig);

    expect(penalty).toBe(antiGamingConfig.maxTotalPenalty);
  });
});
