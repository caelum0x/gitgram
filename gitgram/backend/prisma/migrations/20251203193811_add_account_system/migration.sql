/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Like` table. All the data in the column will be lost.
  - You are about to drop the column `chatId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `gifUrl` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `gifUrl` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `repoData` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `repoName` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `repoOwner` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `repoUrl` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `repositoryId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `viewsCount` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `commentsCount` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `height` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `repositoryId` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `sharesCount` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `width` on the `Reel` table. All the data in the column will be lost.
  - You are about to drop the column `avatarUrl` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `lastFetched` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `openIssues` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `trending` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `trendingScore` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `duration` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `repositoryId` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnailUrl` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `avatar` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bio` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `premium` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorEnabled` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorSecret` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Advertisement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Analytics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Chat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Hashtag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Mention` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ModerationLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NotificationPreferences` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostHashtag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostShare` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReelComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReelLike` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReelView` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RepositoryBookmark` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RepositoryFollow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RepositoryView` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedCollection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedCollectionItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScheduledPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoryReaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoryReply` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoryView` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrendingRepository` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserBlock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserLanguagePreference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserTopicInterest` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[postId,accountId]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[fullName]` on the table `Repository` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accountId` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Like` table without a default value. This is not possible if the table is not empty.
  - Made the column `receiverId` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `accountId` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Reel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `Story` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('USER', 'REPOSITORY', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REPO_UPDATE';

-- DropForeignKey
ALTER TABLE "ChatMember" DROP CONSTRAINT "ChatMember_chatId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followerId_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followingId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_userId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_chatId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_userId_fkey";

-- DropForeignKey
ALTER TABLE "PostHashtag" DROP CONSTRAINT "PostHashtag_hashtagId_fkey";

-- DropForeignKey
ALTER TABLE "PostHashtag" DROP CONSTRAINT "PostHashtag_postId_fkey";

-- DropForeignKey
ALTER TABLE "Reel" DROP CONSTRAINT "Reel_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "Reel" DROP CONSTRAINT "Reel_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReelComment" DROP CONSTRAINT "ReelComment_reelId_fkey";

-- DropForeignKey
ALTER TABLE "ReelComment" DROP CONSTRAINT "ReelComment_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReelLike" DROP CONSTRAINT "ReelLike_reelId_fkey";

-- DropForeignKey
ALTER TABLE "ReelLike" DROP CONSTRAINT "ReelLike_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReelView" DROP CONSTRAINT "ReelView_reelId_fkey";

-- DropForeignKey
ALTER TABLE "ReelView" DROP CONSTRAINT "ReelView_userId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryBookmark" DROP CONSTRAINT "RepositoryBookmark_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryBookmark" DROP CONSTRAINT "RepositoryBookmark_userId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryFollow" DROP CONSTRAINT "RepositoryFollow_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryFollow" DROP CONSTRAINT "RepositoryFollow_userId_fkey";

-- DropForeignKey
ALTER TABLE "RepositoryView" DROP CONSTRAINT "RepositoryView_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "SavedCollectionItem" DROP CONSTRAINT "SavedCollectionItem_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_postId_fkey";

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "Story" DROP CONSTRAINT "Story_userId_fkey";

-- DropForeignKey
ALTER TABLE "StoryReaction" DROP CONSTRAINT "StoryReaction_storyId_fkey";

-- DropForeignKey
ALTER TABLE "StoryReply" DROP CONSTRAINT "StoryReply_storyId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_storyId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_userId_fkey";

-- DropIndex
DROP INDEX "Comment_userId_idx";

-- DropIndex
DROP INDEX "Like_postId_userId_key";

-- DropIndex
DROP INDEX "Like_userId_idx";

-- DropIndex
DROP INDEX "Message_chatId_idx";

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- DropIndex
DROP INDEX "Post_projectId_idx";

-- DropIndex
DROP INDEX "Post_repositoryId_idx";

-- DropIndex
DROP INDEX "Post_type_idx";

-- DropIndex
DROP INDEX "Post_userId_idx";

-- DropIndex
DROP INDEX "Reel_repositoryId_idx";

-- DropIndex
DROP INDEX "Reel_userId_idx";

-- DropIndex
DROP INDEX "Reel_viewsCount_idx";

-- DropIndex
DROP INDEX "Repository_language_idx";

-- DropIndex
DROP INDEX "Repository_lastFetched_idx";

-- DropIndex
DROP INDEX "Repository_name_idx";

-- DropIndex
DROP INDEX "Repository_stars_idx";

-- DropIndex
DROP INDEX "Repository_trending_idx";

-- DropIndex
DROP INDEX "Session_refreshToken_idx";

-- DropIndex
DROP INDEX "Story_createdAt_idx";

-- DropIndex
DROP INDEX "Story_repositoryId_idx";

-- DropIndex
DROP INDEX "Story_userId_idx";

-- DropIndex
DROP INDEX "User_googleId_idx";

-- DropIndex
DROP INDEX "User_username_idx";

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "accountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Like" DROP COLUMN "userId",
ADD COLUMN     "accountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "chatId",
DROP COLUMN "gifUrl",
ALTER COLUMN "receiverId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "userId",
ADD COLUMN     "accountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "gifUrl",
DROP COLUMN "projectId",
DROP COLUMN "repoData",
DROP COLUMN "repoName",
DROP COLUMN "repoOwner",
DROP COLUMN "repoUrl",
DROP COLUMN "repositoryId",
DROP COLUMN "userId",
DROP COLUMN "viewsCount",
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "sharesCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Reel" DROP COLUMN "commentsCount",
DROP COLUMN "description",
DROP COLUMN "height",
DROP COLUMN "repositoryId",
DROP COLUMN "sharesCount",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
DROP COLUMN "width",
ADD COLUMN     "accountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Repository" DROP COLUMN "avatarUrl",
DROP COLUMN "lastFetched",
DROP COLUMN "openIssues",
DROP COLUMN "trending",
DROP COLUMN "trendingScore",
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "lastSynced" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "duration",
DROP COLUMN "repositoryId",
DROP COLUMN "thumbnailUrl",
DROP COLUMN "userId",
ADD COLUMN     "accountId" TEXT NOT NULL,
ALTER COLUMN "mediaType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "avatar",
DROP COLUMN "bio",
DROP COLUMN "location",
DROP COLUMN "premium",
DROP COLUMN "twoFactorEnabled",
DROP COLUMN "twoFactorSecret",
DROP COLUMN "username",
DROP COLUMN "verified",
DROP COLUMN "website";

-- DropTable
DROP TABLE "Advertisement";

-- DropTable
DROP TABLE "Analytics";

-- DropTable
DROP TABLE "Chat";

-- DropTable
DROP TABLE "ChatMember";

-- DropTable
DROP TABLE "Hashtag";

-- DropTable
DROP TABLE "Mention";

-- DropTable
DROP TABLE "ModerationLog";

-- DropTable
DROP TABLE "NotificationPreferences";

-- DropTable
DROP TABLE "PostHashtag";

-- DropTable
DROP TABLE "PostReport";

-- DropTable
DROP TABLE "PostShare";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "ReelComment";

-- DropTable
DROP TABLE "ReelLike";

-- DropTable
DROP TABLE "ReelView";

-- DropTable
DROP TABLE "RepositoryBookmark";

-- DropTable
DROP TABLE "RepositoryFollow";

-- DropTable
DROP TABLE "RepositoryView";

-- DropTable
DROP TABLE "SavedCollection";

-- DropTable
DROP TABLE "SavedCollectionItem";

-- DropTable
DROP TABLE "SavedPost";

-- DropTable
DROP TABLE "ScheduledPost";

-- DropTable
DROP TABLE "StoryReaction";

-- DropTable
DROP TABLE "StoryReply";

-- DropTable
DROP TABLE "StoryView";

-- DropTable
DROP TABLE "Subscription";

-- DropTable
DROP TABLE "TrendingRepository";

-- DropTable
DROP TABLE "UserBlock";

-- DropTable
DROP TABLE "UserLanguagePreference";

-- DropTable
DROP TABLE "UserTopicInterest";

-- DropEnum
DROP TYPE "ChatRole";

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
CREATE INDEX "Comment_accountId_idx" ON "Comment"("accountId");

-- CreateIndex
CREATE INDEX "Like_accountId_idx" ON "Like"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_accountId_key" ON "Like"("postId", "accountId");

-- CreateIndex
CREATE INDEX "Notification_accountId_idx" ON "Notification"("accountId");

-- CreateIndex
CREATE INDEX "Post_accountId_idx" ON "Post"("accountId");

-- CreateIndex
CREATE INDEX "Reel_accountId_idx" ON "Reel"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE INDEX "Repository_claimedBy_idx" ON "Repository"("claimedBy");

-- CreateIndex
CREATE INDEX "Story_accountId_idx" ON "Story"("accountId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
