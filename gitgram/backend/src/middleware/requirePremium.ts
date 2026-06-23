import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../utils/prisma';

export const requirePremium = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || subscription.plan === 'free' || subscription.status !== 'active') {
      return res.status(403).json({ error: 'Premium subscription required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
};

export const requireCreator = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || subscription.plan !== 'creator' || subscription.status !== 'active') {
      return res.status(403).json({ error: 'Creator subscription required' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify subscription' });
  }
};
