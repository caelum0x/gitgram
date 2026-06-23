import crypto from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

interface Experiment {
  id: string;
  name: string;
  variants: string[];
  weights?: number[];
  active?: boolean;
}

const experiments: Record<string, Experiment> = {
  'feed-algorithm': {
    id: 'feed-algorithm',
    name: 'Feed Algorithm Test',
    variants: ['chronological', 'engagement', 'personalized'],
    weights: [0.33, 0.33, 0.34],
    active: true,
  },
  'post-layout': {
    id: 'post-layout',
    name: 'Post Layout Test',
    variants: ['grid', 'list', 'masonry'],
    weights: [0.4, 0.4, 0.2],
    active: true,
  },
  'notification-style': {
    id: 'notification-style',
    name: 'Notification Style Test',
    variants: ['minimal', 'detailed', 'rich'],
    weights: [0.33, 0.33, 0.34],
    active: true,
  },
};

export const getVariant = (experimentId: string, userId: string): string => {
  const experiment = experiments[experimentId];
  if (!experiment || !experiment.active) {
    return experiment?.variants[0] || 'control';
  }

  // Consistent hashing for user assignment
  const hash = crypto
    .createHash('md5')
    .update(`${experimentId}-${userId}`)
    .digest('hex');

  const hashValue = parseInt(hash.substring(0, 8), 16);
  const normalized = hashValue / 0xffffffff;

  let cumulative = 0;
  const weights = experiment.weights || experiment.variants.map(() => 1 / experiment.variants.length);

  for (let i = 0; i < experiment.variants.length; i++) {
    cumulative += weights[i];
    if (normalized < cumulative) {
      return experiment.variants[i];
    }
  }

  return experiment.variants[experiment.variants.length - 1];
};

export const trackConversion = async (
  experimentId: string,
  userId: string,
  metric: string,
  value: number = 1
) => {
  const variant = getVariant(experimentId, userId);

  try {
    await prisma.aBTestConversion.create({
      data: {
        experimentId,
        userId,
        variant,
        metric,
        value,
      },
    });

    logger.debug(`Conversion tracked: ${experimentId} - ${variant} - ${metric}`);
  } catch (error) {
    logger.error('Failed to track A/B test conversion:', error);
  }
};

export const getExperimentResults = async (experimentId: string) => {
  const experiment = experiments[experimentId];
  if (!experiment) {
    return null;
  }

  try {
    // Get conversion counts grouped by variant and metric
    const conversions = await prisma.aBTestConversion.groupBy({
      by: ['variant', 'metric'],
      where: { experimentId },
      _count: { id: true },
      _sum: { value: true },
    });

    // Get unique users per variant
    const uniqueUsers = await prisma.aBTestConversion.groupBy({
      by: ['variant'],
      where: { experimentId },
      _count: { userId: true },
    });

    // Build metrics object
    const metrics: Record<string, Record<string, { count: number; total: number }>> = {};

    for (const variant of experiment.variants) {
      metrics[variant] = {};
    }

    for (const conv of conversions) {
      if (!metrics[conv.variant]) {
        metrics[conv.variant] = {};
      }
      metrics[conv.variant][conv.metric] = {
        count: conv._count.id,
        total: conv._sum.value || 0,
      };
    }

    // Build user counts
    const userCounts: Record<string, number> = {};
    for (const user of uniqueUsers) {
      userCounts[user.variant] = user._count.userId;
    }

    return {
      experimentId,
      name: experiment.name,
      variants: experiment.variants,
      weights: experiment.weights,
      active: experiment.active,
      metrics,
      userCounts,
    };
  } catch (error) {
    logger.error('Failed to get experiment results:', error);
    return {
      experimentId,
      variants: experiment.variants,
      metrics: {},
      error: 'Failed to fetch results',
    };
  }
};

export const getAllExperiments = () => {
  return Object.values(experiments).map(exp => ({
    id: exp.id,
    name: exp.name,
    variants: exp.variants,
    weights: exp.weights,
    active: exp.active,
  }));
};

export const getActiveExperiments = () => {
  return Object.values(experiments)
    .filter(exp => exp.active)
    .map(exp => ({
      id: exp.id,
      name: exp.name,
      variants: exp.variants,
    }));
};

// Get all variants for a user across all active experiments
export const getUserVariants = (userId: string): Record<string, string> => {
  const variants: Record<string, string> = {};

  for (const experiment of Object.values(experiments)) {
    if (experiment.active) {
      variants[experiment.id] = getVariant(experiment.id, userId);
    }
  }

  return variants;
};

// Track multiple conversions at once
export const trackConversions = async (
  conversions: Array<{
    experimentId: string;
    userId: string;
    metric: string;
    value?: number;
  }>
) => {
  const data = conversions.map(conv => ({
    experimentId: conv.experimentId,
    userId: conv.userId,
    variant: getVariant(conv.experimentId, conv.userId),
    metric: conv.metric,
    value: conv.value ?? 1,
  }));

  try {
    await prisma.aBTestConversion.createMany({ data });
    logger.debug(`Tracked ${data.length} conversions`);
  } catch (error) {
    logger.error('Failed to track batch conversions:', error);
  }
};
