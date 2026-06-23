#!/bin/bash

# Database Optimization Script
# This script creates indexes and optimizes the database for production

set -e

echo "🔧 Starting database optimization..."

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "📊 Creating performance indexes..."

# Create indexes for frequently queried fields
psql $DATABASE_URL << EOF

-- User indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username ON "User"(username);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON "User"(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON "User"("createdAt");

-- Post indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_id ON "Post"("authorId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_created_at ON "Post"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_created ON "Post"("authorId", "createdAt");

-- Like indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_likes_post_id ON "Like"("postId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_likes_user_id ON "Like"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_likes_post_user ON "Like"("postId", "userId");

-- Comment indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_id ON "Comment"("postId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_author_id ON "Comment"("authorId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_created_at ON "Comment"("createdAt");

-- Follow indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_follower_id ON "Follow"("followerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_following_id ON "Follow"("followingId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_follower_following ON "Follow"("followerId", "followingId");

-- Story indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_user_id ON "Story"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_created_at ON "Story"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_expires_at ON "Story"("expiresAt");

-- Message indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id ON "Message"("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_id ON "Message"("senderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at ON "Message"("createdAt");

-- Notification indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id ON "Notification"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_read ON "Notification"("read");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_created_at ON "Notification"("createdAt");

-- Hashtag indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hashtags_name ON "Hashtag"(name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_hashtags_post_id ON "PostHashtag"("postId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_hashtags_hashtag_id ON "PostHashtag"("hashtagId");

-- Collection indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_collections_user_id ON "Collection"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_posts_user_id ON "SavedPost"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_posts_post_id ON "SavedPost"("postId");

-- Subscription indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_id ON "Subscription"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_status ON "Subscription"(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_current_period_end ON "Subscription"("currentPeriodEnd");

-- Advertisement indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_advertiser_id ON "Advertisement"("advertiserId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_status ON "Advertisement"(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_start_date ON "Advertisement"("startDate");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_advertisements_end_date ON "Advertisement"("endDate");

-- Moderation indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_logs_content_type ON "ModerationLog"("contentType");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_logs_action ON "ModerationLog"(action);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moderation_logs_created_at ON "ModerationLog"("createdAt");

EOF

echo "✅ Indexes created successfully"

echo "🔍 Analyzing tables..."

# Analyze tables to update statistics
psql $DATABASE_URL << EOF

ANALYZE "User";
ANALYZE "Post";
ANALYZE "Like";
ANALYZE "Comment";
ANALYZE "Follow";
ANALYZE "Story";
ANALYZE "Message";
ANALYZE "Notification";
ANALYZE "Hashtag";
ANALYZE "PostHashtag";
ANALYZE "Collection";
ANALYZE "SavedPost";
ANALYZE "Subscription";
ANALYZE "Advertisement";
ANALYZE "ModerationLog";

EOF

echo "✅ Table analysis complete"

echo "🧹 Running VACUUM..."

# Vacuum to reclaim storage and update statistics
psql $DATABASE_URL << EOF

VACUUM ANALYZE;

EOF

echo "✅ VACUUM complete"

echo "📈 Database optimization complete!"

# Show database size
echo ""
echo "📊 Database Statistics:"
psql $DATABASE_URL << EOF

SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

EOF

echo ""
echo "✅ Database optimization script completed successfully!"
