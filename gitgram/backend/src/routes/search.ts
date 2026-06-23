import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as searchController from '../controllers/searchController';
import { validate } from '../middleware/validation';
import {
  unifiedSearchValidator,
  suggestValidator,
  trackSearchValidator,
  advancedSearchValidator,
  searchReposValidator,
  searchSnippetsValidator,
  searchActivitiesValidator,
  paginationOnlyValidator,
} from '../validators/searchValidator';

const router = Router();

/**
 * @swagger
 * /api/v1/search:
 *   get:
 *     summary: Search all content types (users, posts, repositories)
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, users, posts, repositories]
 *           default: all
 *         description: Content type to search
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results across all content types
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Opaque pagination cursor returned as nextCursor
 *     responses:
 *       200:
 *         description: >-
 *           Unified results with shape { users, repositories, posts, snippets,
 *           hashtags, total, took_ms, nextCursor }
 *       400:
 *         description: Missing or invalid search query
 */
router.get('/', optionalAuth, validate(unifiedSearchValidator), searchController.unifiedSearch);

/**
 * @swagger
 * /api/v1/search/suggest:
 *   get:
 *     summary: Fast prefix autocomplete suggestions (cached 5 minutes)
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Prefix to autocomplete (2+ characters)
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: >-
 *           Comma-separated list of suggestion types
 *           (user, repository, hashtag, snippet)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: >-
 *           { suggestions: [{ value, type, label, display, weight }], took_ms }
 *       400:
 *         description: Query too short or invalid types
 */
router.get('/suggest', optionalAuth, validate(suggestValidator), searchController.suggestSearch);

/**
 * @swagger
 * /api/v1/search/trending-queries:
 *   get:
 *     summary: Most popular search queries over the recent window
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: '{ queries: [{ query, count }] }'
 */
router.get('/trending-queries', optionalAuth, searchController.getTrendingQueries);

/**
 * @swagger
 * /api/v1/search/track:
 *   post:
 *     summary: Record a search query for trending analytics
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       202:
 *         description: '{ tracked: true }'
 *       400:
 *         description: Missing query
 */
router.post('/track', optionalAuth, validate(trackSearchValidator), searchController.trackSearch);

/**
 * @swagger
 * /api/v1/search/advanced:
 *   get:
 *     summary: Advanced search with filters
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [users, posts, repositories, snippets]
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [relevance, recent, popular]
 *           default: relevance
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Filtered search results
 *       400:
 *         description: Missing or invalid search parameters
 */
router.get('/advanced', optionalAuth, validate(advancedSearchValidator), searchController.advancedSearchHandler);

/**
 * @swagger
 * /api/v1/search/repositories:
 *   get:
 *     summary: Search repositories specifically
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Repository search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repositories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Repository'
 *       400:
 *         description: Missing or invalid search query
 */
router.get('/repositories', optionalAuth, validate(searchReposValidator), searchController.searchRepositories);

/**
 * @swagger
 * /api/v1/search/snippets:
 *   get:
 *     summary: Search code snippets
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Code snippet search results
 *       400:
 *         description: Missing or invalid search query
 */
router.get('/snippets', optionalAuth, validate(searchSnippetsValidator), searchController.searchSnippets);

/**
 * @swagger
 * /api/v1/search/recommended:
 *   get:
 *     summary: Get recommended posts based on user interests and activity
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Recommended posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *       401:
 *         description: Not authenticated
 */
router.get('/recommended', authenticate, validate(paginationOnlyValidator), searchController.getRecommendedPosts);

/**
 * @swagger
 * /api/v1/search/trending:
 *   get:
 *     summary: Get personalized trending content
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Personalized trending content
 */
router.get('/trending', optionalAuth, validate(paginationOnlyValidator), searchController.getPersonalizedTrending);

/**
 * @swagger
 * /api/v1/search/activities:
 *   get:
 *     summary: Search GitHub activities (commits, PRs, issues, etc.)
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [commit, pull_request, issue, release]
 *         description: Filter by activity type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: GitHub activity search results
 *       400:
 *         description: Missing or invalid search query
 */
router.get('/activities', optionalAuth, validate(searchActivitiesValidator), searchController.searchActivities);

export default router;
