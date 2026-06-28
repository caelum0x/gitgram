import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { initializeSocket } from './websocket/socket';
import { apiLimiter, authLimiter, searchLimiter, adminLimiter, dataExportLimiter } from './middleware/rateLimiter';
import { ipApiLimit, ipAuthLimit, ipUploadLimit } from './middleware/tieredRateLimiter';
import { enrichAccountAge, abuseGate } from './middleware/antiSpamMiddleware';
import { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from './services/sentryService';
import authRoutes from './routes/auth';
import healthRoutes from './routes/health';

// Load environment first
dotenv.config();

// Validate environment before anything else
import { validateEnvironment } from './config/env';
try {
  validateEnvironment();
} catch (error) {
  // Logger may not be available yet during startup; use console as fallback
  const log = (() => { try { return require('./utils/logger').default; } catch { return console; } })();
  log.error('FATAL: Environment validation failed');
  log.error(error);
  process.exit(1);
}
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import storiesRoutes from './routes/stories';
import messagesRoutes from './routes/messages';
import tagsRoutes from './routes/tags';
import searchRoutes from './routes/search';
import uploadRoutes from './routes/upload';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';
import adminPanelRoutes from './routes/adminPanel';
import notificationRoutes from './routes/notifications';
import pushNotificationRoutes from './routes/pushNotifications';
import githubRoutes from './routes/github';
import collectionsRoutes from './routes/collections';
import privacyRoutes from './routes/privacy';
import subscriptionsRoutes from './routes/subscriptions';
import scheduledPostsRoutes from './routes/scheduledPosts';
import advertisementsRoutes from './routes/advertisements';
import moderationRoutes from './routes/moderation';
import repositoryRoutes from './routes/repositories';
import organizationRoutes from './routes/organizations';
import popularRoutes from './routes/popular';
import giphyRoutes from './routes/giphy';
import twoFactorRoutes from './routes/twoFactor';
import reelsRoutes from './routes/reels';
import accountRoutes from './routes/accounts';
import claimRoutes from './routes/claim';
import switchRoutes from './routes/switch';
import interactionsRoutes from './routes/interactions';
import snippetsRoutes from './routes/snippets';
import notificationPreferencesRoutes from './routes/notificationPreferences';
import githubWebhookRoutes from './routes/githubWebhook';
import commentActionsRoutes from './routes/commentActions';
import followRequestsRoutes from './routes/followRequests';
import insightsRoutes from './routes/insights';
import dataExportRoutes from './routes/dataExport';
import webhookRoutes from './routes/webhooks';
import draftsRoutes from './routes/drafts';
import musicRoutes from './routes/music';
import reportsRoutes from './routes/reports';
import emailPreferencesRoutes from './routes/emailPreferences';
import linkPreviewRoutes from './routes/linkPreview';
import trendingRoutes from './routes/trending';
import changeStoriesRoutes from './routes/changeStories';
import userAnalyticsRoutes from './routes/userAnalytics';
import repositoryAnalyticsRoutes from './routes/repositoryAnalytics';
import socialRoutes from './routes/social';
import toolsRoutes from './routes/tools';
import aiAnalysisRoutes from './routes/aiAnalysis';
import githubActivityRoutes from './routes/githubActivity';
import eventsRoutes from './routes/events';
import contributionRoutes from './routes/contributions';
import auditLogRoutes from './routes/auditLog';
import postAnalyticsRoutes from './routes/postAnalytics';
import polarWebhookRoutes from './routes/polarWebhooks';
import repositoryInsightsRoutes from './routes/repositoryInsights';
import recommendationRoutes from './routes/recommendations';
import activityRoutes from './routes/activity';
import { trpcMiddleware } from './trpc/adapter';
import { initializeJobs } from './jobs/scheduler';
import logger from './utils/logger';
import { initializeRedis } from './config/redis';
import { errorTracker } from './utils/errorTracker';
import { connectRedis } from './services/redisService';
import { applySecurityHeaders, requestId } from './middleware/securityHeaders';

const app = express();

// Initialize Sentry first
initSentry(app);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:8081',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8081',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Sentry request handler (must be first)
if (process.env.SENTRY_DSN) {
  app.use(sentryRequestHandler());
  app.use(sentryTracingHandler());
}

// CORS configuration - support web and mobile
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:8081', // Mobile Expo
    'http://localhost:3000', // Web Next.js
    'http://localhost:3001', // Web dev
    'http://localhost:3002', // Web dev (new port)
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:8081',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// Additional security headers
app.use(applySecurityHeaders);
app.use(requestId);

// Compression middleware
app.use(compression());

// Polar webhook must receive the raw body for HMAC signature verification —
// mount BEFORE the global JSON parser so express.raw captures the unparsed buffer.
app.use('/api/v1/webhooks/polar', express.raw({ type: 'application/json' }), polarWebhookRoutes);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware (for httpOnly JWT cookies)
app.use(cookieParser());

// Request logging
import { requestLogger } from './middleware/requestLogger';
app.use(requestLogger);

// Rate limiting (layered: existing express-rate-limit + tiered sliding window)
app.use('/api', apiLimiter);
app.use('/api', ipApiLimit);
app.use('/api/auth', authLimiter);
app.use('/api/auth', ipAuthLimit);
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/auth', ipAuthLimit);
app.use('/api/v1/upload', ipUploadLimit);

// Anti-spam: enrich account age and enforce abuse restrictions
app.use('/api', enrichAccountAge);
app.use('/api', abuseGate);

// Serve static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request metrics tracking
const { trackRequestMetrics, getMetricsEndpoint } = require('./middleware/requestMetrics');
app.use(trackRequestMetrics);

// Performance monitoring
const { performanceMonitoringMiddleware } = require('./middleware/performanceMonitor');
app.use(performanceMonitoringMiddleware);

// Analytics middleware
const { analyticsMiddleware } = require('./middleware/analyticsMiddleware');
app.use(analyticsMiddleware);

// Swagger documentation
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const { swaggerSpec } = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Metrics endpoint (protected in production)
app.get('/metrics', getMetricsEndpoint());

// Health check endpoints
app.use('/health', healthRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Gitgram API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      docs: '/api-docs'
    }
  });
});

// API Routes (versioned)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/posts', postRoutes);
// Mount BEFORE userRoutes so /:username/contributions isn't swallowed by users /:id patterns
app.use('/api/v1/users', contributionRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/stories', storiesRoutes);
app.use('/api/v1/messages', messagesRoutes);
app.use('/api/v1/tags', tagsRoutes);
app.use('/api/v1/hashtags', tagsRoutes);
app.use('/api/v1/search', searchLimiter, searchRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/analytics', userAnalyticsRoutes);
app.use('/api/v1/github', githubRoutes);
app.use('/api/v1/collections', collectionsRoutes);
app.use('/api/v1/privacy', privacyRoutes);
app.use('/api/v1/subscriptions', subscriptionsRoutes);
app.use('/api/v1/scheduled-posts', scheduledPostsRoutes);
app.use('/api/v1/advertisements', advertisementsRoutes);
app.use('/api/v1/moderation', moderationRoutes);
app.use('/api/v1/repositories', repositoryRoutes);
app.use('/api/v1/orgs', organizationRoutes);
app.use('/api/v1/repositories/:owner/:name/analytics', repositoryAnalyticsRoutes);
app.use('/api/v1/repositories/:owner/:name/insights', repositoryInsightsRoutes);
app.use('/api/v1/popular', popularRoutes);
app.use('/api/v1/giphy', giphyRoutes);
app.use('/api/v1/auth/2fa', twoFactorRoutes);
app.use('/api/v1/reels', reelsRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/claim', claimRoutes);
app.use('/api/v1/switch', switchRoutes);
app.use('/api/v1/interactions', interactionsRoutes);
app.use('/api/v1/snippets', snippetsRoutes);

// Admin routes (protected with admin-specific rate limiting)
app.use('/api/v1/admin', adminLimiter, adminRoutes);

// Admin panel routes (dashboard, user management, suspend/unsuspend, reports, audit log)
app.use('/api/v1/admin/panel', adminLimiter, adminPanelRoutes);

// Notifications routes
app.use('/api/v1/notifications', notificationRoutes);

// Notification preferences routes
app.use('/api/v1/notifications/preferences', notificationPreferencesRoutes);

// Push notifications routes
app.use('/api/v1/push-notifications', pushNotificationRoutes);

// GitHub webhooks routes
app.use('/api/v1/github/webhooks', githubWebhookRoutes);

// Comment actions routes (like, edit, delete)
app.use('/api/v1/posts', commentActionsRoutes);

// Follow requests routes
app.use('/api/v1/follow-requests', followRequestsRoutes);

// Content insights routes
app.use('/api/v1/insights', insightsRoutes);

// Data export routes (GDPR compliance) with strict rate limiting
app.use('/api/v1/data-export', dataExportLimiter, dataExportRoutes);

// User webhooks routes
app.use('/api/v1/webhooks', webhookRoutes);

// Post drafts routes
app.use('/api/v1/drafts', draftsRoutes);

// Music routes (Jamendo API integration)
app.use('/api/v1/music', musicRoutes);

// Content reports routes
app.use('/api/v1/reports', reportsRoutes);

// Email preferences routes
app.use('/api/v1/users/email-preferences', emailPreferencesRoutes);

// Link preview routes
app.use('/api/v1/link-preview', linkPreviewRoutes);

// Trending ranking routes
app.use('/api/v1/trending', trendingRoutes);

// Change stories routes (AITM integration)
app.use('/api/v1/change-stories', changeStoriesRoutes);

// Social graph routes (gh-social: suggested users, mutual followers, activity feed)
app.use('/api/v1/social', socialRoutes);

// Developer tools (repo-to-text, code conversion)
app.use('/api/v1/tools', toolsRoutes);

// AI analysis tools (GitNexus-powered code analysis)
app.use('/api/v1/tools/ai-analysis', aiAnalysisRoutes);

// GitHub activity feed routes
app.use('/api/v1/github-activity', githubActivityRoutes);

// Server-Sent Events — real-time notification stream
app.use('/api/v1/events', eventsRoutes);

app.use('/api/v1/audit-logs', auditLogRoutes);

app.use('/api/v1/post-analytics', postAnalyticsRoutes);

app.use('/api/v1/recommendations', recommendationRoutes);

app.use('/api/v1/activity', activityRoutes);

// tRPC API layer (additive — REST routes unchanged, ported from t3-base patterns)
app.use('/trpc', trpcMiddleware);

// GraphQL API layer (additive — REST + tRPC routes unchanged)
import { applyGraphQL } from './graphql';
applyGraphQL(app).catch((err: unknown) => {
  logger.error('Failed to mount GraphQL endpoint', err);
});

// Sentry error handler (must be before custom error handler)
if (process.env.SENTRY_DSN) {
  app.use(sentryErrorHandler());
}

// Error handling middleware (must be last)
import { errorHandler } from './middleware/errorHandler';
app.use(errorHandler);

// Initialize Socket.io
initializeSocket(io);

// Make io available globally
declare global {
  var io: Server;
}
global.io = io;

// Initialize error tracking
if (process.env.SENTRY_DSN) {
  errorTracker.initialize();
  logger.info('Error tracking initialized (Sentry)');
}

// Initialize feature flags
const { featureFlags } = require('./utils/featureFlags');
if (process.env.LAUNCHDARKLY_SDK_KEY) {
  featureFlags.initialize(process.env.LAUNCHDARKLY_SDK_KEY).then(() => {
    logger.info('Feature flags initialized (LaunchDarkly)');
  }).catch((error: any) => {
    logger.error('Feature flags initialization failed:', error);
  });
} else {
  featureFlags.initialize();
  logger.info('Feature flags initialized (local)');
}

// Initialize Redis (optional)
initializeRedis().then((client) => {
  if (client) {
    logger.info('✅ Redis initialized');

    // Initialize background jobs
    initializeJobs();
    logger.info('✅ Background jobs initialized');
  } else {
    logger.info('Using in-memory cache (Redis not configured)');
  }
});

// Connect to Redis for caching
connectRedis().then(() => {
  logger.info('✅ Redis cache connected');
}).catch((error) => {
  logger.warn('Redis cache not available, continuing without cache:', error.message);
});

// Schedule data retention cleanup
if (process.env.NODE_ENV === 'production') {
  const { scheduleDataRetentionCleanup } = require('./utils/dataRetention');
  scheduleDataRetentionCleanup();
  logger.info('Data retention cleanup scheduled');
}

// Start scheduled posts job
import { startScheduledPostsJob } from './jobs/scheduledPosts';
startScheduledPostsJob();
logger.info('Scheduled posts job started');

// Build the in-memory search suggestion index and refresh it every 5 minutes
import { startAutoRefresh as startSearchSuggestRefresh } from './services/searchSuggestService';
startSearchSuggestRefresh();
logger.info('Search suggestion index auto-refresh started');

const PORT = process.env.PORT || 3000;

// Export app for testing
export const createApp = () => app;

if (require.main === module) {
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
  });
}

export { io, app };

