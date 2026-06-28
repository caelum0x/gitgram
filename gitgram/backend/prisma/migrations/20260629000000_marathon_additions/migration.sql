-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('USER', 'REPOSITORY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('POST', 'TEXT', 'IMAGE', 'VIDEO', 'REEL', 'STORY', 'REPOSITORY', 'CHANGE_STORY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'MENTION', 'MESSAGE', 'REPO_UPDATE', 'STORY_REPLY');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'REPOSITORY', 'REEL', 'STORY', 'SNIPPET', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "GitHubEventType" AS ENUM ('PUSH', 'PULL_REQUEST', 'ISSUES', 'RELEASE', 'STAR', 'FORK', 'WATCH', 'CREATE', 'DELETE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('POST', 'COMMENT', 'USER', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProfileVisitSource" AS ENUM ('SEARCH', 'POST', 'COMMENT', 'MENTION', 'SUGGESTION', 'DIRECT', 'FOLLOWERS', 'FOLLOWING', 'REPOSITORY');

-- CreateEnum
CREATE TYPE "TrendingTier" AS ENUM ('HOT_NOW', 'TRENDING_TODAY', 'THIS_WEEK', 'RISING_STARS');

-- CreateEnum
CREATE TYPE "TrendingEntityType" AS ENUM ('POST', 'REPOSITORY', 'USER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'SOFT_DELETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TranscodeJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "repositoryId" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "avatar" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "githubId" TEXT,
    "githubUsername" TEXT,
    "githubAccessToken" TEXT,
    "googleId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "adultContentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedUntil" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "scheduledDeletion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSwitchGrant" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AccountSwitchGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "watchers" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "topics" TEXT[],
    "htmlUrl" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "ownerAvatar" TEXT,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "lastFetched" TIMESTAMP(3),
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reactionsCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "repositoryId" TEXT,
    "organizationId" TEXT,
    "lastSynced" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryManager" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ManagerRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "repositoryId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "repoUrl" TEXT,
    "checkpointRef" TEXT,
    "aitm_checkpoint_id" TEXT,
    "aitm_project_id" TEXT,
    "aitm_checkpoint_ref" JSONB,
    "type" "PostType" NOT NULL DEFAULT 'POST',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "selfLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentWarning" TEXT,
    "contentLanguage" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "repositoryId" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "repositoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "musicTrackId" TEXT,
    "musicTitle" TEXT,
    "musicArtist" TEXT,
    "musicPreviewUrl" TEXT,
    "musicArtworkUrl" TEXT,
    "musicStartTime" INTEGER,
    "effectId" TEXT,
    "trimStart" DOUBLE PRECISION,
    "trimEnd" DOUBLE PRECISION,
    "thumbnailTime" DOUBLE PRECISION,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "followerUserId" TEXT,
    "followingUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "chatId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedForSender" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "postId" TEXT,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "plan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "polarCustomerId" TEXT,
    "polarSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSnippet" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "repositoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hashtag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHashtag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCollection" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "postId" TEXT NOT NULL,
    "collectionId" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPostCollection" (
    "id" TEXT NOT NULL,
    "savedPostId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPostCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'NONE',
    "recurrenceEndDate" TIMESTAMP(3),
    "parentPostId" TEXT,
    "publishedPostId" TEXT,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "targetUrl" TEXT NOT NULL,
    "callToAction" TEXT,
    "placement" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targetAudience" TEXT,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "type" TEXT NOT NULL DEFAULT 'banner',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" TEXT,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "appealable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryFollow" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubWebhook" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "webhookId" INTEGER,
    "secret" TEXT NOT NULL,
    "events" "GitHubEventType"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryActivity" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "eventType" "GitHubEventType" NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" TEXT,
    "actorLogin" TEXT NOT NULL,
    "actorAvatar" TEXT,
    "actorUrl" TEXT,
    "title" TEXT,
    "body" TEXT,
    "url" TEXT,
    "ref" TEXT,
    "sha" TEXT,
    "metadata" JSONB,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedComment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnifiedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "githubId" TEXT,
    "owner" TEXT,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "url" TEXT,
    "description" TEXT,
    "repoUrl" TEXT,
    "demoUrl" TEXT,
    "imageUrl" TEXT,
    "language" TEXT,
    "tags" TEXT[],
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analytics" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "likes" BOOLEAN NOT NULL DEFAULT true,
    "comments" BOOLEAN NOT NULL DEFAULT true,
    "follows" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "messages" BOOLEAN NOT NULL DEFAULT true,
    "posts" BOOLEAN NOT NULL DEFAULT true,
    "emailDigest" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "deviceName" TEXT,
    "webPushSubscription" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT,
    "userId" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostShare" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelComment" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelLike" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelView" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryBookmark" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryReaction" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryReply" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLanguagePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "UserLanguagePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopicInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "UserTopicInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryArchive" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allowReplies" BOOLEAN NOT NULL DEFAULT true,
    "hideFrom" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryHighlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverImage" TEXT,
    "archiveIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT,
    "mediaUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWebhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABTestConversion" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTestConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "autoFlagged" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderationLogId" TEXT NOT NULL,
    "appealText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT true,
    "newFollowerEmails" BOOLEAN NOT NULL DEFAULT true,
    "commentEmails" BOOLEAN NOT NULL DEFAULT true,
    "likeEmails" BOOLEAN NOT NULL DEFAULT false,
    "mentionEmails" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPreview" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "image" TEXT,
    "siteName" TEXT,
    "favicon" TEXT,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "visitedUserId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ProfileVisitSource" NOT NULL DEFAULT 'DIRECT',

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfilePrivacySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileVisitsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "showProfileVisitors" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProfilePrivacySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "viewerId" TEXT,
    "sessionId" TEXT,
    "ipHash" TEXT,
    "country" TEXT,
    "city" TEXT,
    "deviceType" TEXT,
    "source" TEXT,
    "referrer" TEXT,
    "isFollower" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER,
    "profileVisit" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingEntry" (
    "id" TEXT NOT NULL,
    "entityType" "TrendingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "tier" "TrendingTier" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rawScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamingPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "language" TEXT,
    "topic" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingHistory" (
    "id" TEXT NOT NULL,
    "entityType" "TrendingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "tier" "TrendingTier" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementAnomaly" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "severity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "details" JSONB,
    "actorIds" TEXT[],
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingSignalWeight" (
    "id" TEXT NOT NULL,
    "signalName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingSignalWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "originalUrl" TEXT NOT NULL,
    "processedUrl" TEXT,
    "thumbnailUrl" TEXT,
    "webpUrl" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "postId" TEXT,
    "reelId" TEXT,
    "storyId" TEXT,
    "contentType" TEXT,
    "nsfwScore" DOUBLE PRECISION,
    "nsfwChecked" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "softDeletedAt" TIMESTAMP(3),
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "expiresAt" TIMESTAMP(3),
    "resolutions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscodeJob" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "status" "TranscodeJobStatus" NOT NULL DEFAULT 'QUEUED',
    "resolution" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "inputUrl" TEXT NOT NULL,
    "outputUrl" TEXT,
    "outputSize" INTEGER,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscodeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUploadQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaUploadQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFingerprint" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashType" TEXT NOT NULL DEFAULT 'sha256',
    "reason" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnfollowLog" (
    "id" TEXT NOT NULL,
    "unfollowerId" TEXT NOT NULL,
    "unfollowedId" TEXT NOT NULL,
    "followedAt" TIMESTAMP(3),
    "unfollowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followDuration" INTEGER,

    CONSTRAINT "UnfollowLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryAitmSettings" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "aitmProjectId" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "autoGenerateStories" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryAitmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_referrers" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_referrers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_path_views" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_path_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_clones" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_clones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'other',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "polarProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePurchase" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'internal',
    "checkoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "screenshotUrl" TEXT NOT NULL,
    "selfieUrl" TEXT NOT NULL,
    "caption" TEXT,
    "location" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentLike" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'post',
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyBudget" DOUBLE PRECISION,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingType" TEXT NOT NULL DEFAULT 'cpc',
    "status" TEXT NOT NULL DEFAULT 'active',
    "targetAudience" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalizedAds" BOOLEAN NOT NULL DEFAULT true,
    "interestCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutedWord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "targets" TEXT[] DEFAULT ARRAY['content']::TEXT[],
    "actorTarget" TEXT NOT NULL DEFAULT 'all',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MutedWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_repositoryId_key" ON "Account"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organizationId_key" ON "Account"("organizationId");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_username_idx" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_githubId_idx" ON "User"("githubId");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AccountSwitchGrant_ownerUserId_idx" ON "AccountSwitchGrant"("ownerUserId");

-- CreateIndex
CREATE INDEX "AccountSwitchGrant_targetUserId_idx" ON "AccountSwitchGrant"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSwitchGrant_ownerUserId_targetUserId_key" ON "AccountSwitchGrant"("ownerUserId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE INDEX "Repository_owner_idx" ON "Repository"("owner");

-- CreateIndex
CREATE INDEX "Repository_claimedBy_idx" ON "Repository"("claimedBy");

-- CreateIndex
CREATE INDEX "Repository_organizationId_idx" ON "Repository"("organizationId");

-- CreateIndex
CREATE INDEX "Repository_trending_idx" ON "Repository"("trending");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "RepositoryManager_userId_idx" ON "RepositoryManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryManager_repositoryId_userId_key" ON "RepositoryManager"("repositoryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Post_accountId_idx" ON "Post"("accountId");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_repositoryId_idx" ON "Post"("repositoryId");

-- CreateIndex
CREATE INDEX "Post_checkpointRef_idx" ON "Post"("checkpointRef");

-- CreateIndex
CREATE INDEX "Post_aitm_checkpoint_id_idx" ON "Post"("aitm_checkpoint_id");

-- CreateIndex
CREATE INDEX "Post_aitm_project_id_idx" ON "Post"("aitm_project_id");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_isArchived_idx" ON "Post"("isArchived");

-- CreateIndex
CREATE INDEX "Post_contentLanguage_idx" ON "Post"("contentLanguage");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_accountId_idx" ON "Comment"("accountId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Like_postId_idx" ON "Like"("postId");

-- CreateIndex
CREATE INDEX "Like_accountId_idx" ON "Like"("accountId");

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_accountId_key" ON "Like"("postId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_userId_key" ON "Like"("postId", "userId");

-- CreateIndex
CREATE INDEX "Story_accountId_idx" ON "Story"("accountId");

-- CreateIndex
CREATE INDEX "Story_userId_idx" ON "Story"("userId");

-- CreateIndex
CREATE INDEX "Story_repositoryId_idx" ON "Story"("repositoryId");

-- CreateIndex
CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");

-- CreateIndex
CREATE INDEX "Reel_accountId_idx" ON "Reel"("accountId");

-- CreateIndex
CREATE INDEX "Reel_userId_idx" ON "Reel"("userId");

-- CreateIndex
CREATE INDEX "Reel_repositoryId_idx" ON "Reel"("repositoryId");

-- CreateIndex
CREATE INDEX "Reel_createdAt_idx" ON "Reel"("createdAt");

-- CreateIndex
CREATE INDEX "Reel_isArchived_idx" ON "Reel"("isArchived");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE INDEX "Follow_followerUserId_idx" ON "Follow"("followerUserId");

-- CreateIndex
CREATE INDEX "Follow_followingUserId_idx" ON "Follow"("followingUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerUserId_followingUserId_key" ON "Follow"("followerUserId", "followingUserId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Message_read_idx" ON "Message"("read");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "Notification_accountId_idx" ON "Notification"("accountId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_id_key" ON "Notification"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_polarCustomerId_key" ON "Subscription"("polarCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_polarSubscriptionId_key" ON "Subscription"("polarSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_polarCustomerId_idx" ON "Subscription"("polarCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorAuth_userId_key" ON "TwoFactorAuth"("userId");

-- CreateIndex
CREATE INDEX "CodeSnippet_accountId_idx" ON "CodeSnippet"("accountId");

-- CreateIndex
CREATE INDEX "CodeSnippet_userId_idx" ON "CodeSnippet"("userId");

-- CreateIndex
CREATE INDEX "CodeSnippet_repositoryId_idx" ON "CodeSnippet"("repositoryId");

-- CreateIndex
CREATE INDEX "CodeSnippet_language_idx" ON "CodeSnippet"("language");

-- CreateIndex
CREATE UNIQUE INDEX "Hashtag_name_key" ON "Hashtag"("name");

-- CreateIndex
CREATE INDEX "Hashtag_count_idx" ON "Hashtag"("count");

-- CreateIndex
CREATE INDEX "PostHashtag_postId_idx" ON "PostHashtag"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostHashtag_postId_hashtagId_key" ON "PostHashtag"("postId", "hashtagId");

-- CreateIndex
CREATE INDEX "SavedCollection_accountId_idx" ON "SavedCollection"("accountId");

-- CreateIndex
CREATE INDEX "SavedCollection_userId_idx" ON "SavedCollection"("userId");

-- CreateIndex
CREATE INDEX "SavedCollection_isDefault_idx" ON "SavedCollection"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCollection_userId_name_key" ON "SavedCollection"("userId", "name");

-- CreateIndex
CREATE INDEX "SavedPost_accountId_idx" ON "SavedPost"("accountId");

-- CreateIndex
CREATE INDEX "SavedPost_userId_idx" ON "SavedPost"("userId");

-- CreateIndex
CREATE INDEX "SavedPost_postId_idx" ON "SavedPost"("postId");

-- CreateIndex
CREATE INDEX "SavedPost_savedAt_idx" ON "SavedPost"("savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPost_accountId_postId_key" ON "SavedPost"("accountId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPost_userId_postId_key" ON "SavedPost"("userId", "postId");

-- CreateIndex
CREATE INDEX "SavedPostCollection_savedPostId_idx" ON "SavedPostCollection"("savedPostId");

-- CreateIndex
CREATE INDEX "SavedPostCollection_collectionId_idx" ON "SavedPostCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPostCollection_savedPostId_collectionId_key" ON "SavedPostCollection"("savedPostId", "collectionId");

-- CreateIndex
CREATE INDEX "ScheduledPost_accountId_idx" ON "ScheduledPost"("accountId");

-- CreateIndex
CREATE INDEX "ScheduledPost_userId_idx" ON "ScheduledPost"("userId");

-- CreateIndex
CREATE INDEX "ScheduledPost_scheduledFor_idx" ON "ScheduledPost"("scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_idx" ON "ScheduledPost"("status");

-- CreateIndex
CREATE INDEX "ScheduledPost_parentPostId_idx" ON "ScheduledPost"("parentPostId");

-- CreateIndex
CREATE INDEX "Advertisement_advertiserId_idx" ON "Advertisement"("advertiserId");

-- CreateIndex
CREATE INDEX "Advertisement_campaignId_idx" ON "Advertisement"("campaignId");

-- CreateIndex
CREATE INDEX "Advertisement_status_idx" ON "Advertisement"("status");

-- CreateIndex
CREATE INDEX "ModerationLog_moderatorId_idx" ON "ModerationLog"("moderatorId");

-- CreateIndex
CREATE INDEX "ModerationLog_targetType_targetId_idx" ON "ModerationLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModerationLog_action_idx" ON "ModerationLog"("action");

-- CreateIndex
CREATE INDEX "ModerationLog_createdAt_idx" ON "ModerationLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "RepositoryFollow_accountId_idx" ON "RepositoryFollow"("accountId");

-- CreateIndex
CREATE INDEX "RepositoryFollow_userId_idx" ON "RepositoryFollow"("userId");

-- CreateIndex
CREATE INDEX "RepositoryFollow_repositoryId_idx" ON "RepositoryFollow"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryFollow_accountId_repositoryId_key" ON "RepositoryFollow"("accountId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryFollow_userId_repositoryId_key" ON "RepositoryFollow"("userId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubWebhook_repositoryId_key" ON "GitHubWebhook"("repositoryId");

-- CreateIndex
CREATE INDEX "GitHubWebhook_repositoryId_idx" ON "GitHubWebhook"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryActivity_eventId_key" ON "RepositoryActivity"("eventId");

-- CreateIndex
CREATE INDEX "RepositoryActivity_repositoryId_idx" ON "RepositoryActivity"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryActivity_eventType_idx" ON "RepositoryActivity"("eventType");

-- CreateIndex
CREATE INDEX "RepositoryActivity_createdAt_idx" ON "RepositoryActivity"("createdAt");

-- CreateIndex
CREATE INDEX "RepositoryActivity_occurredAt_idx" ON "RepositoryActivity"("occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_contentType_contentId_idx" ON "Interaction"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Interaction_userId_idx" ON "Interaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_accountId_contentType_contentId_type_key" ON "Interaction"("accountId", "contentType", "contentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_userId_contentType_contentId_type_key" ON "Interaction"("userId", "contentType", "contentId", "type");

-- CreateIndex
CREATE INDEX "UnifiedComment_contentType_contentId_idx" ON "UnifiedComment"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "UnifiedComment_parentId_idx" ON "UnifiedComment"("parentId");

-- CreateIndex
CREATE INDEX "UnifiedComment_userId_idx" ON "UnifiedComment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_githubId_key" ON "Project"("githubId");

-- CreateIndex
CREATE INDEX "Project_accountId_idx" ON "Project"("accountId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_owner_idx" ON "Project"("owner");

-- CreateIndex
CREATE INDEX "Analytics_accountId_idx" ON "Analytics"("accountId");

-- CreateIndex
CREATE INDEX "Analytics_userId_idx" ON "Analytics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Analytics_accountId_date_key" ON "Analytics"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Analytics_userId_date_key" ON "Analytics"("userId", "date");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE INDEX "ChatMember_chatId_idx" ON "ChatMember"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_chatId_accountId_key" ON "ChatMember"("chatId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_chatId_userId_key" ON "ChatMember"("chatId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_accountId_key" ON "NotificationPreferences"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_pushToken_key" ON "PushDevice"("pushToken");

-- CreateIndex
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

-- CreateIndex
CREATE INDEX "PushDevice_active_idx" ON "PushDevice"("active");

-- CreateIndex
CREATE INDEX "PostReport_postId_idx" ON "PostReport"("postId");

-- CreateIndex
CREATE INDEX "PostReport_userId_idx" ON "PostReport"("userId");

-- CreateIndex
CREATE INDEX "PostReport_status_idx" ON "PostReport"("status");

-- CreateIndex
CREATE INDEX "PostShare_postId_idx" ON "PostShare"("postId");

-- CreateIndex
CREATE INDEX "PostShare_userId_idx" ON "PostShare"("userId");

-- CreateIndex
CREATE INDEX "ReelComment_reelId_idx" ON "ReelComment"("reelId");

-- CreateIndex
CREATE INDEX "ReelComment_userId_idx" ON "ReelComment"("userId");

-- CreateIndex
CREATE INDEX "ReelLike_reelId_idx" ON "ReelLike"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelLike_reelId_accountId_key" ON "ReelLike"("reelId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelLike_reelId_userId_key" ON "ReelLike"("reelId", "userId");

-- CreateIndex
CREATE INDEX "ReelView_reelId_idx" ON "ReelView"("reelId");

-- CreateIndex
CREATE INDEX "RepositoryBookmark_userId_idx" ON "RepositoryBookmark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryBookmark_accountId_repositoryId_key" ON "RepositoryBookmark"("accountId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryBookmark_userId_repositoryId_key" ON "RepositoryBookmark"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "StoryView_storyId_idx" ON "StoryView"("storyId");

-- CreateIndex
CREATE INDEX "StoryView_viewedAt_idx" ON "StoryView"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_accountId_key" ON "StoryView"("storyId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryReaction_storyId_idx" ON "StoryReaction"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_storyId_userId_key" ON "StoryReaction"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryReply_storyId_idx" ON "StoryReply"("storyId");

-- CreateIndex
CREATE INDEX "StoryReply_userId_idx" ON "StoryReply"("userId");

-- CreateIndex
CREATE INDEX "UserLanguagePreference_userId_idx" ON "UserLanguagePreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserLanguagePreference_userId_language_key" ON "UserLanguagePreference"("userId", "language");

-- CreateIndex
CREATE INDEX "UserTopicInterest_userId_idx" ON "UserTopicInterest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicInterest_userId_topic_key" ON "UserTopicInterest"("userId", "topic");

-- CreateIndex
CREATE INDEX "LinkedAccount_userId_idx" ON "LinkedAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedAccount_provider_providerId_key" ON "LinkedAccount"("provider", "providerId");

-- CreateIndex
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");

-- CreateIndex
CREATE INDEX "CommentLike_userId_idx" ON "CommentLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "FollowRequest_requesterId_idx" ON "FollowRequest"("requesterId");

-- CreateIndex
CREATE INDEX "FollowRequest_targetId_idx" ON "FollowRequest"("targetId");

-- CreateIndex
CREATE INDEX "FollowRequest_status_idx" ON "FollowRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FollowRequest_requesterId_targetId_key" ON "FollowRequest"("requesterId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "StoryArchive_storyId_key" ON "StoryArchive"("storyId");

-- CreateIndex
CREATE INDEX "StoryArchive_userId_idx" ON "StoryArchive"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySettings_userId_key" ON "StorySettings"("userId");

-- CreateIndex
CREATE INDEX "StorySettings_userId_idx" ON "StorySettings"("userId");

-- CreateIndex
CREATE INDEX "StoryHighlight_userId_idx" ON "StoryHighlight"("userId");

-- CreateIndex
CREATE INDEX "PostDraft_userId_idx" ON "PostDraft"("userId");

-- CreateIndex
CREATE INDEX "UserWebhook_userId_idx" ON "UserWebhook"("userId");

-- CreateIndex
CREATE INDEX "UserWebhook_active_idx" ON "UserWebhook"("active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "ABTestConversion_experimentId_idx" ON "ABTestConversion"("experimentId");

-- CreateIndex
CREATE INDEX "ABTestConversion_userId_idx" ON "ABTestConversion"("userId");

-- CreateIndex
CREATE INDEX "ABTestConversion_variant_idx" ON "ABTestConversion"("variant");

-- CreateIndex
CREATE INDEX "ABTestConversion_createdAt_idx" ON "ABTestConversion"("createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "Report_priority_idx" ON "Report"("priority");

-- CreateIndex
CREATE INDEX "Report_escalated_idx" ON "Report"("escalated");

-- CreateIndex
CREATE INDEX "ModerationAppeal_userId_idx" ON "ModerationAppeal"("userId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_moderationLogId_idx" ON "ModerationAppeal"("moderationLogId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_status_idx" ON "ModerationAppeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailPreferences_userId_key" ON "EmailPreferences"("userId");

-- CreateIndex
CREATE INDEX "EmailPreferences_userId_idx" ON "EmailPreferences"("userId");

-- CreateIndex
CREATE INDEX "LinkPreview_postId_idx" ON "LinkPreview"("postId");

-- CreateIndex
CREATE INDEX "LinkPreview_domain_idx" ON "LinkPreview"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPreview_postId_url_key" ON "LinkPreview"("postId", "url");

-- CreateIndex
CREATE INDEX "ProfileVisit_visitedUserId_idx" ON "ProfileVisit"("visitedUserId");

-- CreateIndex
CREATE INDEX "ProfileVisit_visitorId_idx" ON "ProfileVisit"("visitorId");

-- CreateIndex
CREATE INDEX "ProfileVisit_visitedAt_idx" ON "ProfileVisit"("visitedAt");

-- CreateIndex
CREATE INDEX "ProfileVisit_visitedUserId_visitedAt_idx" ON "ProfileVisit"("visitedUserId", "visitedAt");

-- CreateIndex
CREATE INDEX "ProfileVisit_visitedUserId_visitorId_idx" ON "ProfileVisit"("visitedUserId", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePrivacySettings_userId_key" ON "ProfilePrivacySettings"("userId");

-- CreateIndex
CREATE INDEX "ProfilePrivacySettings_userId_idx" ON "ProfilePrivacySettings"("userId");

-- CreateIndex
CREATE INDEX "PostView_postId_idx" ON "PostView"("postId");

-- CreateIndex
CREATE INDEX "PostView_viewerId_idx" ON "PostView"("viewerId");

-- CreateIndex
CREATE INDEX "PostView_viewedAt_idx" ON "PostView"("viewedAt");

-- CreateIndex
CREATE INDEX "PostView_postId_viewedAt_idx" ON "PostView"("postId", "viewedAt");

-- CreateIndex
CREATE INDEX "PostView_postId_isFollower_idx" ON "PostView"("postId", "isFollower");

-- CreateIndex
CREATE INDEX "PostView_postId_country_idx" ON "PostView"("postId", "country");

-- CreateIndex
CREATE INDEX "TrendingEntry_tier_score_idx" ON "TrendingEntry"("tier", "score");

-- CreateIndex
CREATE INDEX "TrendingEntry_tier_language_idx" ON "TrendingEntry"("tier", "language");

-- CreateIndex
CREATE INDEX "TrendingEntry_tier_topic_idx" ON "TrendingEntry"("tier", "topic");

-- CreateIndex
CREATE INDEX "TrendingEntry_entityType_tier_idx" ON "TrendingEntry"("entityType", "tier");

-- CreateIndex
CREATE INDEX "TrendingEntry_createdAt_idx" ON "TrendingEntry"("createdAt");

-- CreateIndex
CREATE INDEX "TrendingEntry_rank_idx" ON "TrendingEntry"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingEntry_entityType_entityId_tier_periodStart_key" ON "TrendingEntry"("entityType", "entityId", "tier", "periodStart");

-- CreateIndex
CREATE INDEX "TrendingHistory_entityType_entityId_idx" ON "TrendingHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TrendingHistory_tier_snapshotAt_idx" ON "TrendingHistory"("tier", "snapshotAt");

-- CreateIndex
CREATE INDEX "TrendingHistory_snapshotAt_idx" ON "TrendingHistory"("snapshotAt");

-- CreateIndex
CREATE INDEX "EngagementAnomaly_entityType_entityId_idx" ON "EngagementAnomaly"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EngagementAnomaly_anomalyType_idx" ON "EngagementAnomaly"("anomalyType");

-- CreateIndex
CREATE INDEX "EngagementAnomaly_resolved_idx" ON "EngagementAnomaly"("resolved");

-- CreateIndex
CREATE INDEX "EngagementAnomaly_detectedAt_idx" ON "EngagementAnomaly"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingSignalWeight_signalName_key" ON "TrendingSignalWeight"("signalName");

-- CreateIndex
CREATE INDEX "TrendingSignalWeight_category_idx" ON "TrendingSignalWeight"("category");

-- CreateIndex
CREATE INDEX "TrendingSignalWeight_active_idx" ON "TrendingSignalWeight"("active");

-- CreateIndex
CREATE INDEX "Media_userId_idx" ON "Media"("userId");

-- CreateIndex
CREATE INDEX "Media_fileHash_idx" ON "Media"("fileHash");

-- CreateIndex
CREATE INDEX "Media_status_idx" ON "Media"("status");

-- CreateIndex
CREATE INDEX "Media_postId_idx" ON "Media"("postId");

-- CreateIndex
CREATE INDEX "Media_reelId_idx" ON "Media"("reelId");

-- CreateIndex
CREATE INDEX "Media_storyId_idx" ON "Media"("storyId");

-- CreateIndex
CREATE INDEX "Media_softDeletedAt_idx" ON "Media"("softDeletedAt");

-- CreateIndex
CREATE INDEX "Media_expiresAt_idx" ON "Media"("expiresAt");

-- CreateIndex
CREATE INDEX "Media_createdAt_idx" ON "Media"("createdAt");

-- CreateIndex
CREATE INDEX "Media_userId_type_createdAt_idx" ON "Media"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "TranscodeJob_mediaId_idx" ON "TranscodeJob"("mediaId");

-- CreateIndex
CREATE INDEX "TranscodeJob_status_idx" ON "TranscodeJob"("status");

-- CreateIndex
CREATE INDEX "TranscodeJob_createdAt_idx" ON "TranscodeJob"("createdAt");

-- CreateIndex
CREATE INDEX "MediaUploadQuota_userId_idx" ON "MediaUploadQuota"("userId");

-- CreateIndex
CREATE INDEX "MediaUploadQuota_date_idx" ON "MediaUploadQuota"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUploadQuota_userId_date_key" ON "MediaUploadQuota"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFingerprint_hash_key" ON "MediaFingerprint"("hash");

-- CreateIndex
CREATE INDEX "MediaFingerprint_hash_idx" ON "MediaFingerprint"("hash");

-- CreateIndex
CREATE INDEX "MediaFingerprint_isBlocked_idx" ON "MediaFingerprint"("isBlocked");

-- CreateIndex
CREATE INDEX "UnfollowLog_unfollowedId_idx" ON "UnfollowLog"("unfollowedId");

-- CreateIndex
CREATE INDEX "UnfollowLog_unfollowerId_idx" ON "UnfollowLog"("unfollowerId");

-- CreateIndex
CREATE INDEX "UnfollowLog_unfollowedAt_idx" ON "UnfollowLog"("unfollowedAt");

-- CreateIndex
CREATE INDEX "UnfollowLog_unfollowedId_unfollowedAt_idx" ON "UnfollowLog"("unfollowedId", "unfollowedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAitmSettings_repositoryId_key" ON "RepositoryAitmSettings"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryAitmSettings_aitmProjectId_idx" ON "RepositoryAitmSettings"("aitmProjectId");

-- CreateIndex
CREATE INDEX "stars_repositoryId_idx" ON "stars"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "stars_userId_repositoryId_key" ON "stars"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "repository_referrers_repositoryId_date_idx" ON "repository_referrers"("repositoryId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "repository_referrers_repositoryId_source_key" ON "repository_referrers"("repositoryId", "source");

-- CreateIndex
CREATE INDEX "repository_path_views_repositoryId_idx" ON "repository_path_views"("repositoryId");

-- CreateIndex
CREATE INDEX "repository_path_views_repositoryId_date_idx" ON "repository_path_views"("repositoryId", "date");

-- CreateIndex
CREATE INDEX "repository_clones_repositoryId_date_idx" ON "repository_clones"("repositoryId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "repository_clones_repositoryId_date_key" ON "repository_clones"("repositoryId", "date");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "StoreItem_sellerId_idx" ON "StoreItem"("sellerId");

-- CreateIndex
CREATE INDEX "StoreItem_status_idx" ON "StoreItem"("status");

-- CreateIndex
CREATE INDEX "StoreItem_category_idx" ON "StoreItem"("category");

-- CreateIndex
CREATE INDEX "StoreItem_createdAt_idx" ON "StoreItem"("createdAt");

-- CreateIndex
CREATE INDEX "StorePurchase_itemId_idx" ON "StorePurchase"("itemId");

-- CreateIndex
CREATE INDEX "StorePurchase_buyerId_idx" ON "StorePurchase"("buyerId");

-- CreateIndex
CREATE INDEX "StorePurchase_sellerId_idx" ON "StorePurchase"("sellerId");

-- CreateIndex
CREATE INDEX "StorePurchase_status_idx" ON "StorePurchase"("status");

-- CreateIndex
CREATE INDEX "Moment_userId_idx" ON "Moment"("userId");

-- CreateIndex
CREATE INDEX "Moment_createdAt_idx" ON "Moment"("createdAt");

-- CreateIndex
CREATE INDEX "MomentLike_momentId_idx" ON "MomentLike"("momentId");

-- CreateIndex
CREATE INDEX "MomentLike_userId_idx" ON "MomentLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MomentLike_momentId_userId_key" ON "MomentLike"("momentId", "userId");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_type_idx" ON "Feedback"("type");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_advertiserId_idx" ON "AdCampaign"("advertiserId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AdPreferences_userId_key" ON "AdPreferences"("userId");

-- CreateIndex
CREATE INDEX "AdPreferences_userId_idx" ON "AdPreferences"("userId");

-- CreateIndex
CREATE INDEX "MutedWord_userId_idx" ON "MutedWord"("userId");

-- CreateIndex
CREATE INDEX "MutedWord_expiresAt_idx" ON "MutedWord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutedWord_userId_value_key" ON "MutedWord"("userId", "value");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSwitchGrant" ADD CONSTRAINT "AccountSwitchGrant_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSwitchGrant" ADD CONSTRAINT "AccountSwitchGrant_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryManager" ADD CONSTRAINT "RepositoryManager_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryManager" ADD CONSTRAINT "RepositoryManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerUserId_fkey" FOREIGN KEY ("followerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingUserId_fkey" FOREIGN KEY ("followingUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorAuth" ADD CONSTRAINT "TwoFactorAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSnippet" ADD CONSTRAINT "CodeSnippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSnippet" ADD CONSTRAINT "CodeSnippet_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_savedCollection_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostCollection" ADD CONSTRAINT "SavedPostCollection_savedPostId_fkey" FOREIGN KEY ("savedPostId") REFERENCES "SavedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostCollection" ADD CONSTRAINT "SavedPostCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryFollow" ADD CONSTRAINT "RepositoryFollow_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubWebhook" ADD CONSTRAINT "GitHubWebhook_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryActivity" ADD CONSTRAINT "RepositoryActivity_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComment" ADD CONSTRAINT "UnifiedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComment" ADD CONSTRAINT "UnifiedComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "UnifiedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelLike" ADD CONSTRAINT "ReelLike_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelView" ADD CONSTRAINT "ReelView_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReply" ADD CONSTRAINT "StoryReply_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReply" ADD CONSTRAINT "StoryReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedAccount" ADD CONSTRAINT "LinkedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySettings" ADD CONSTRAINT "StorySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryHighlight" ADD CONSTRAINT "StoryHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "UserWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPreview" ADD CONSTRAINT "LinkPreview_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeJob" ADD CONSTRAINT "TranscodeJob_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryAitmSettings" ADD CONSTRAINT "RepositoryAitmSettings_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stars" ADD CONSTRAINT "stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stars" ADD CONSTRAINT "stars_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_referrers" ADD CONSTRAINT "repository_referrers_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_path_views" ADD CONSTRAINT "repository_path_views_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_clones" ADD CONSTRAINT "repository_clones_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentLike" ADD CONSTRAINT "MomentLike_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

