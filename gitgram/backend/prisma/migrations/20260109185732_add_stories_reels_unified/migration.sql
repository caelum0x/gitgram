/*
  Warnings:

  - The values [MESSAGE,REPO_UPDATE] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - The values [POST,STORY] on the enum `PostType` will be removed. If these variants are still used in the database, this will fail.
  - The values [PREMIUM,CREATOR] on the enum `SubscriptionTier` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `accountId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Like` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `claimedAt` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `claimedBy` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `accountId` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `cancelAtPeriodEnd` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `currentPeriodEnd` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TwoFactorAuth` table. All the data in the column will be lost.
  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Advertisement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Analytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BlockedAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Chat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ModerationLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NotificationPreference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrganizationMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PrivacySettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PushToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Report` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RepositoryManager` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedCollection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScheduledPost` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[postId,userId]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Like` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Reel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Reel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Story` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('STAR', 'FIRE', 'ROCKET', 'EYES', 'HEART', 'CLAP', 'MINDBLOWN');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'REPOSITORY', 'REEL', 'STORY', 'SNIPPET');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'MENTION', 'REPO_COMMENT', 'REPO_REACTION', 'NEW_POST', 'STORY_REPLY', 'STORY_REACTION', 'REEL_LIKE', 'REEL_COMMENT');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PostType_new" AS ENUM ('IMAGE', 'VIDEO', 'REEL', 'CAROUSEL');
ALTER TABLE "Post" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Post" ALTER COLUMN "type" TYPE "PostType_new" USING ("type"::text::"PostType_new");
ALTER TYPE "PostType" RENAME TO "PostType_old";
ALTER TYPE "PostType_new" RENAME TO "PostType";
DROP TYPE "PostType_old";
ALTER TABLE "Post" ALTER COLUMN "type" SET DEFAULT 'IMAGE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionTier_new" AS ENUM ('FREE', 'PRO', 'TEAM');
ALTER TABLE "Subscription" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "tier" TYPE "SubscriptionTier_new" USING ("tier"::text::"SubscriptionTier_new");
ALTER TYPE "SubscriptionTier" RENAME TO "SubscriptionTier_old";
ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier";
DROP TYPE "SubscriptionTier_old";
ALTER TABLE "Subscription" ALTER COLUMN "tier" SET DEFAULT 'FREE';
COMMIT;

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMember" DROP CONSTRAINT "ChatMember_chatId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_chatId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followerId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followingId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Reel" DROP CONSTRAINT "Reel_accountId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryManager" DROP CONSTRAINT "RepositoryManager_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryManager" DROP CONSTRAINT "RepositoryManager_userId_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_accountId_fkey";

-- DropIndex
DROP INDEX "Comment_accountId_idx";

-- DropIndex
DROP INDEX "Like_accountId_idx";

-- DropIndex
DROP INDEX "Like_postId_accountId_key";

-- DropIndex
DROP INDEX "Message_createdAt_idx";

-- DropIndex
DROP INDEX "Notification_accountId_idx";

-- DropIndex
DROP INDEX "Notification_createdAt_idx";

-- DropIndex
DROP INDEX "Post_accountId_idx";

-- DropIndex
DROP INDEX "PostHashtag_hashtagId_idx";

-- DropIndex
DROP INDEX "Reel_accountId_idx";

-- DropIndex
DROP INDEX "Repository_claimedBy_idx";

-- DropIndex
DROP INDEX "Repository_owner_idx";

-- DropIndex
DROP INDEX "Story_accountId_idx";

-- DropIndex
DROP INDEX "Subscription_accountId_key";

-- DropIndex
DROP INDEX "Subscription_status_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "accountId",
ADD COLUMN     "likesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Like" DROP COLUMN "accountId",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "accountId",
ADD COLUMN     "repoId" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "accountId",
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "repositoryId" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "viewsCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "type" SET DEFAULT 'IMAGE';

-- AlterTable
ALTER TABLE "Reel" DROP COLUMN "accountId",
ADD COLUMN     "commentsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "sharesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "title" DROP NOT NULL,
ALTER COLUMN "thumbnailUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Repository" DROP COLUMN "claimedAt",
DROP COLUMN "claimedBy",
ADD COLUMN     "commentsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "homepage" TEXT,
ADD COLUMN     "postsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reactionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "savesCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "accountId",
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "mediaType" SET DEFAULT 'image';

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "accountId",
DROP COLUMN "cancelAtPeriodEnd",
DROP COLUMN "currentPeriodEnd",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TwoFactorAuth" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "username" TEXT NOT NULL,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Advertisement";

-- DropTable
DROP TABLE "Analytics";

-- DropTable
DROP TABLE "BlockedAccount";

-- DropTable
DROP TABLE "Chat";

-- DropTable
DROP TABLE "ChatMember";

-- DropTable
DROP TABLE "ChatMessage";

-- DropTable
DROP TABLE "ModerationLog";

-- DropTable
DROP TABLE "NotificationPreference";

-- DropTable
DROP TABLE "Organization";

-- DropTable
DROP TABLE "OrganizationMember";

-- DropTable
DROP TABLE "PrivacySettings";

-- DropTable
DROP TABLE "PushToken";

-- DropTable
DROP TABLE "Report";

-- DropTable
DROP TABLE "RepositoryManager";

-- DropTable
DROP TABLE "SavedCollection";

-- DropTable
DROP TABLE "SavedPost";

-- DropTable
DROP TABLE "ScheduledPost";

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "AdStatus";

-- DropEnum
DROP TYPE "ManagerRole";

-- DropEnum
DROP TYPE "ModerationAction";

-- DropEnum
DROP TYPE "OrgRole";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "RepoComment" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepoComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoReaction" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSnippet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "filePath" TEXT,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedRepo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "collectionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingRepo" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedComment_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelLike" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelComment" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoComment_repositoryId_idx" ON "RepoComment"("repositoryId");

-- CreateIndex
CREATE INDEX "RepoComment_userId_idx" ON "RepoComment"("userId");

-- CreateIndex
CREATE INDEX "RepoReaction_repositoryId_idx" ON "RepoReaction"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoReaction_repositoryId_userId_type_key" ON "RepoReaction"("repositoryId", "userId", "type");

-- CreateIndex
CREATE INDEX "CodeSnippet_userId_idx" ON "CodeSnippet"("userId");

-- CreateIndex
CREATE INDEX "CodeSnippet_language_idx" ON "CodeSnippet"("language");

-- CreateIndex
CREATE INDEX "RepoFollow_repositoryId_idx" ON "RepoFollow"("repositoryId");

-- CreateIndex
CREATE INDEX "RepoFollow_userId_idx" ON "RepoFollow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoFollow_userId_repositoryId_key" ON "RepoFollow"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "SavedRepo_userId_idx" ON "SavedRepo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRepo_userId_repositoryId_key" ON "SavedRepo"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingRepo_repositoryId_key" ON "TrendingRepo"("repositoryId");

-- CreateIndex
CREATE INDEX "TrendingRepo_period_rank_idx" ON "TrendingRepo"("period", "rank");

-- CreateIndex
CREATE INDEX "Interaction_contentType_contentId_idx" ON "Interaction"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Interaction_userId_idx" ON "Interaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_userId_contentType_contentId_type_key" ON "Interaction"("userId", "contentType", "contentId", "type");

-- CreateIndex
CREATE INDEX "UnifiedComment_contentType_contentId_idx" ON "UnifiedComment"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "UnifiedComment_userId_idx" ON "UnifiedComment"("userId");

-- CreateIndex
CREATE INDEX "UnifiedComment_parentId_idx" ON "UnifiedComment"("parentId");

-- CreateIndex
CREATE INDEX "StoryReaction_storyId_idx" ON "StoryReaction"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_storyId_userId_type_key" ON "StoryReaction"("storyId", "userId", "type");

-- CreateIndex
CREATE INDEX "StoryReply_storyId_idx" ON "StoryReply"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_userId_key" ON "StoryView"("storyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelLike_reelId_userId_key" ON "ReelLike"("reelId", "userId");

-- CreateIndex
CREATE INDEX "ReelComment_reelId_idx" ON "ReelComment"("reelId");

-- CreateIndex
CREATE INDEX "ReelComment_parentId_idx" ON "ReelComment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_userId_key" ON "Like"("postId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_repositoryId_idx" ON "Post"("repositoryId");

-- CreateIndex
CREATE INDEX "Post_type_idx" ON "Post"("type");

-- CreateIndex
CREATE INDEX "Reel_userId_idx" ON "Reel"("userId");

-- CreateIndex
CREATE INDEX "Repository_stars_idx" ON "Repository"("stars");

-- CreateIndex
CREATE INDEX "Repository_language_idx" ON "Repository"("language");

-- CreateIndex
CREATE INDEX "Story_userId_idx" ON "Story"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- AddForeignKey
ALTER TABLE "RepoComment" ADD CONSTRAINT "RepoComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RepoComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoComment" ADD CONSTRAINT "RepoComment_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoComment" ADD CONSTRAINT "RepoComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoReaction" ADD CONSTRAINT "RepoReaction_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoReaction" ADD CONSTRAINT "RepoReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSnippet" ADD CONSTRAINT "CodeSnippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSnippet" ADD CONSTRAINT "CodeSnippet_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoFollow" ADD CONSTRAINT "RepoFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoFollow" ADD CONSTRAINT "RepoFollow_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRepo" ADD CONSTRAINT "SavedRepo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRepo" ADD CONSTRAINT "SavedRepo_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRepo" ADD CONSTRAINT "SavedRepo_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorAuth" ADD CONSTRAINT "TwoFactorAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComment" ADD CONSTRAINT "UnifiedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedComment" ADD CONSTRAINT "UnifiedComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "UnifiedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReply" ADD CONSTRAINT "StoryReply_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReply" ADD CONSTRAINT "StoryReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelLike" ADD CONSTRAINT "ReelLike_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelLike" ADD CONSTRAINT "ReelLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReelComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
