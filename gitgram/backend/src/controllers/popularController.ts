import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const popularController = {
    /**
     * Get popular posts based on engagement
     * Algorithm: (likes + comments * 2 + shares * 3) / age_in_hours^0.8
     */
    getPopularPosts: asyncHandler(async (req: Request, res: Response) => {
        const { limit = 20, offset = 0 } = req.query;

        // Get posts from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const posts = await prisma.post.findMany({
            where: {
                createdAt: {
                    gte: sevenDaysAgo,
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        avatar: true,
                        verified: true,
                    },
                },
            },
            take: Number(limit) * 3, // Get more to sort and filter
        });

        // Calculate popularity score for each post
        const postsWithScore = posts.map((post) => {
            const ageInHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
            const ageFactor = Math.pow(ageInHours + 2, 0.8);

            // Use pre-calculated counts from Post model
            const engagementScore =
                post.likesCount * 1.0 +
                post.commentsCount * 2.0 +
                post.viewsCount * 0.1;

            const popularityScore = engagementScore / ageFactor;

            return {
                ...post,
                popularityScore,
            };
        });

        // Sort by popularity score
        postsWithScore.sort((a, b) => b.popularityScore - a.popularityScore);

        // Apply pagination
        const paginatedPosts = postsWithScore.slice(
            Number(offset),
            Number(offset) + Number(limit)
        );

        // Remove the score from response
        const finalPosts = paginatedPosts.map(({ popularityScore, ...post }) => post);

        res.json({
            posts: finalPosts,
            hasMore: postsWithScore.length > Number(offset) + Number(limit),
        });
    }),

    /**
     * Get trending hashtags based on recent usage
     */
    getTrendingHashtags: asyncHandler(async (req: Request, res: Response) => {
        const { limit = 10 } = req.query;

        // Get hashtags from last 24 hours
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const hashtags = await prisma.hashtag.findMany({
            where: {
                posts: {
                    some: {
                        createdAt: {
                            gte: oneDayAgo,
                        },
                    },
                },
            },
            include: {
                _count: {
                    select: {
                        posts: true,
                    },
                },
            },
            orderBy: {
                posts: {
                    _count: 'desc',
                },
            },
            take: Number(limit),
        });

        res.json({ hashtags });
    }),

    /**
     * Get popular users based on recent follower growth
     */
    getPopularUsers: asyncHandler(async (req: Request, res: Response) => {
        const { limit = 10 } = req.query;

        // Get users with most followers
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
                bio: true,
                _count: {
                    select: {
                        followers: true,
                        posts: true,
                    },
                },
            },
            orderBy: {
                followers: {
                    _count: 'desc',
                },
            },
            take: Number(limit),
        });

        res.json({ users });
    }),
};
