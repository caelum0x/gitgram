import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Default email preferences for new users
const DEFAULT_EMAIL_PREFERENCES = {
  marketingEmails: true,
  newFollowerEmails: true,
  commentEmails: true,
  likeEmails: false, // Off by default to reduce email volume
  mentionEmails: true,
  weeklyDigest: true,
  securityAlerts: true, // Always true
};

/**
 * Get current email preferences for the authenticated user
 * GET /api/v1/users/email-preferences
 */
export const getEmailPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  let prefs = await prisma.emailPreferences.findUnique({
    where: { userId },
  });

  // If no preferences exist, create with defaults
  if (!prefs) {
    prefs = await prisma.emailPreferences.create({
      data: {
        userId,
        ...DEFAULT_EMAIL_PREFERENCES,
      },
    });
    logger.info(`Created default email preferences for user ${userId}`);
  }

  // Return preferences (excluding internal fields)
  res.json({
    marketingEmails: prefs.marketingEmails,
    newFollowerEmails: prefs.newFollowerEmails,
    commentEmails: prefs.commentEmails,
    likeEmails: prefs.likeEmails,
    mentionEmails: prefs.mentionEmails,
    weeklyDigest: prefs.weeklyDigest,
    securityAlerts: true, // Always true in response
  });
});

/**
 * Update email preferences for the authenticated user
 * PUT /api/v1/users/email-preferences
 */
export const updateEmailPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const {
    marketingEmails,
    newFollowerEmails,
    commentEmails,
    likeEmails,
    mentionEmails,
    weeklyDigest,
  } = req.body;

  // Build update data, only including fields that were provided
  const updateData: Record<string, boolean> = {};

  if (typeof marketingEmails === 'boolean') {
    updateData.marketingEmails = marketingEmails;
  }
  if (typeof newFollowerEmails === 'boolean') {
    updateData.newFollowerEmails = newFollowerEmails;
  }
  if (typeof commentEmails === 'boolean') {
    updateData.commentEmails = commentEmails;
  }
  if (typeof likeEmails === 'boolean') {
    updateData.likeEmails = likeEmails;
  }
  if (typeof mentionEmails === 'boolean') {
    updateData.mentionEmails = mentionEmails;
  }
  if (typeof weeklyDigest === 'boolean') {
    updateData.weeklyDigest = weeklyDigest;
  }

  // Security alerts cannot be disabled - always ensure it's true
  // This is intentionally not included in updateData to prevent disabling

  const prefs = await prisma.emailPreferences.upsert({
    where: { userId },
    create: {
      userId,
      ...DEFAULT_EMAIL_PREFERENCES,
      ...updateData,
      securityAlerts: true, // Always true
    },
    update: {
      ...updateData,
      securityAlerts: true, // Always true
    },
  });

  logger.info(`Updated email preferences for user ${userId}`);

  res.json({
    marketingEmails: prefs.marketingEmails,
    newFollowerEmails: prefs.newFollowerEmails,
    commentEmails: prefs.commentEmails,
    likeEmails: prefs.likeEmails,
    mentionEmails: prefs.mentionEmails,
    weeklyDigest: prefs.weeklyDigest,
    securityAlerts: true, // Always true in response
  });
});

/**
 * Check if a user has a specific email preference enabled
 * This is used internally by the email service
 */
export const checkEmailPreference = async (
  userId: string,
  preferenceType: keyof typeof DEFAULT_EMAIL_PREFERENCES
): Promise<boolean> => {
  try {
    // Security alerts are always enabled
    if (preferenceType === 'securityAlerts') {
      return true;
    }

    const prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    // If no preferences exist, use defaults
    if (!prefs) {
      return DEFAULT_EMAIL_PREFERENCES[preferenceType];
    }

    return prefs[preferenceType];
  } catch (error) {
    logger.error(`Failed to check email preference ${preferenceType} for user ${userId}:`, error);
    // On error, default to true for important notifications, false for marketing
    return preferenceType !== 'marketingEmails' && preferenceType !== 'likeEmails';
  }
};

/**
 * Get all email preferences for a user (internal use)
 */
export const getUserEmailPreferences = async (userId: string) => {
  try {
    const prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      return {
        ...DEFAULT_EMAIL_PREFERENCES,
        securityAlerts: true,
      };
    }

    return {
      marketingEmails: prefs.marketingEmails,
      newFollowerEmails: prefs.newFollowerEmails,
      commentEmails: prefs.commentEmails,
      likeEmails: prefs.likeEmails,
      mentionEmails: prefs.mentionEmails,
      weeklyDigest: prefs.weeklyDigest,
      securityAlerts: true, // Always true
    };
  } catch (error) {
    logger.error(`Failed to get email preferences for user ${userId}:`, error);
    return {
      ...DEFAULT_EMAIL_PREFERENCES,
      securityAlerts: true,
    };
  }
};
