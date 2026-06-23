import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from './auth';
import logger from '../utils/logger';

// Match the Prisma enum
export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

// Role hierarchy - higher index = more permissions
const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/**
 * Check if a role has sufficient permissions
 */
const hasPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

/**
 * Middleware to require specific roles
 * Supports role hierarchy - ADMIN can access MODERATOR routes
 */
export const requireRole = (...roles: UserRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          role: true,
          isBanned: true,
          bannedReason: true,
          isSuspended: true,
          suspendedUntil: true,
          suspendedReason: true,
        },
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if user is banned
      if (user.isBanned) {
        logger.warn(`Banned user attempted access: ${user.id}`);
        return res.status(403).json({
          error: 'Account banned',
          reason: user.bannedReason || 'Your account has been permanently banned'
        });
      }

      // Check if user is suspended (temporary)
      if (user.isSuspended) {
        // Auto-lift if suspension has expired
        if (user.suspendedUntil && user.suspendedUntil <= new Date()) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isSuspended: false,
              suspendedUntil: null,
              suspendedReason: null,
            },
          });
        } else {
          logger.warn(`Suspended user attempted access: ${user.id}`);
          return res.status(403).json({
            error: 'Account suspended',
            reason: user.suspendedReason || 'Your account has been temporarily suspended',
            suspendedUntil: user.suspendedUntil?.toISOString(),
          });
        }
      }

      const userRole = user.role as UserRole;

      // Check if user has any of the required roles (using hierarchy)
      const hasRequiredRole = roles.some(requiredRole =>
        hasPermission(userRole, requiredRole)
      );

      if (!hasRequiredRole) {
        logger.warn(`Unauthorized role access attempt: user ${user.id} with role ${userRole} tried to access ${req.method} ${req.path}`);
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Add role to request for downstream use
      (req as any).userRole = userRole;
      next();
    } catch (error) {
      logger.error('Authorization check failed:', error);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Middleware to require ownership or specific role
 * User can access their own resources, or admins/moderators can access any
 */
export const requireOwnershipOrRole = (
  resourceModel: 'Post' | 'Reel' | 'Story' | 'Message' | 'Comment',
  resourceIdParam: string = 'id',
  ...roles: UserRole[]
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({ error: 'Resource ID is required' });
      }

      // Get user with role
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          role: true,
          isBanned: true
        },
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.isBanned) {
        return res.status(403).json({ error: 'Account suspended' });
      }

      const userRole = user.role as UserRole;

      // Check if user has elevated role that bypasses ownership
      const hasElevatedRole = roles.length > 0 && roles.some(role =>
        hasPermission(userRole, role)
      );

      if (hasElevatedRole) {
        (req as any).userRole = userRole;
        return next();
      }

      // Check ownership
      let resource: any;
      let ownerId: string | null = null;

      switch (resourceModel) {
        case 'Post':
          resource = await prisma.post.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          ownerId = resource?.userId;
          break;
        case 'Story':
          resource = await prisma.story.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          ownerId = resource?.userId;
          break;
        case 'Reel':
          resource = await prisma.reel.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          ownerId = resource?.userId;
          break;
        case 'Comment':
          resource = await prisma.comment.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          ownerId = resource?.userId;
          break;
        case 'Message':
          resource = await prisma.message.findUnique({
            where: { id: resourceId },
            select: { senderId: true },
          });
          // For messages, we need to check account ownership differently
          if (resource) {
            const account = await prisma.account.findFirst({
              where: { userId: req.userId },
              select: { id: true },
            });
            if (account && resource.senderId === account.id) {
              return next();
            }
          }
          return res.status(403).json({ error: 'Not authorized' });
        default:
          return res.status(400).json({ error: 'Invalid resource type' });
      }

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (ownerId !== req.userId) {
        logger.warn(`Unauthorized resource access: user ${req.userId} tried to access ${resourceModel} ${resourceId}`);
        return res.status(403).json({ error: 'Not authorized' });
      }

      (req as any).userRole = userRole;
      next();
    } catch (error) {
      logger.error('Authorization check failed:', error);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Check if user is banned middleware
 * Use this for routes that don't need role checks but should block banned users
 */
export const checkNotBanned = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return next(); // Let auth middleware handle this
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        isBanned: true,
        bannedReason: true,
        isSuspended: true,
        suspendedUntil: true,
        suspendedReason: true,
      },
    });

    if (user?.isBanned) {
      return res.status(403).json({
        error: 'Account banned',
        reason: user.bannedReason || 'Your account has been permanently banned'
      });
    }

    if (user?.isSuspended) {
      if (user.suspendedUntil && user.suspendedUntil <= new Date()) {
        // Auto-lift expired suspension
        await prisma.user.update({
          where: { id: req.userId },
          data: {
            isSuspended: false,
            suspendedUntil: null,
            suspendedReason: null,
          },
        });
      } else {
        return res.status(403).json({
          error: 'Account suspended',
          reason: user.suspendedReason || 'Your account has been temporarily suspended',
          suspendedUntil: user.suspendedUntil?.toISOString(),
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Ban check failed:', error);
    next(); // Don't block on errors
  }
};

// Convenience exports for common role checks
export const requireAdmin = requireRole('ADMIN');
export const requireModerator = requireRole('MODERATOR');
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

// For routes that moderators OR admins can access
export const requireModeratorOrAdmin = requireRole('MODERATOR', 'ADMIN');
