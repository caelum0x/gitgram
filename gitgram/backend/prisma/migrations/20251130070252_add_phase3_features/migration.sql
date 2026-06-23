/*
  Warnings:

  - You are about to drop the column `likesCount` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `momentId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `reelId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `reelId` on the `Like` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `isRead` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `mediaType` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `recipientId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `body` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `data` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `isRead` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `codeSnippet` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `githubRepoId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `hashtags` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `isArchived` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `mediaType` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `mediaUrl` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `mentions` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `details` on the `PostReport` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `PostReport` table. All the data in the column will be lost.
  - You are about to drop the column `mediaType` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `viewedAt` on the `StoryView` table. All the data in the column will be lost.
  - You are about to drop the column `githubToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `interests` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isGoldenVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `AccountSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Ad` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdCampaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdInteraction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdPreference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdTargeting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Collection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CollectionPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmailVerificationToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GitHubProject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GitHubSync` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GroupChat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GroupChatMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LinkedAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MessageRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Moment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MomentLike` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NotificationPreference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PasswordResetToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Reel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SavedProject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SubscriptionHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationPurchase` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationRequest` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[postId,userId]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Made the column `postId` on table `Comment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `postId` on table `Like` required. This step will fail if there are existing NULL values in that column.
  - Made the column `content` on table `Message` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `content` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `content` on table `Post` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('POST', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'MENTION', 'MESSAGE');

-- DropForeignKey
ALTER TABLE "AccountSettings" DROP CONSTRAINT "AccountSettings_userId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_postId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_reelId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_storyId_fkey";

-- DropForeignKey
ALTER TABLE "AdCampaign" DROP CONSTRAINT "AdCampaign_advertiserId_fkey";

-- DropForeignKey
ALTER TABLE "AdInteraction" DROP CONSTRAINT "AdInteraction_adId_fkey";

-- DropForeignKey
ALTER TABLE "AdInteraction" DROP CONSTRAINT "AdInteraction_userId_fkey";

-- DropForeignKey
ALTER TABLE "AdPayment" DROP CONSTRAINT "AdPayment_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "AdPreference" DROP CONSTRAINT "AdPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "AdReport" DROP CONSTRAINT "AdReport_adId_fkey";

-- DropForeignKey
ALTER TABLE "AdReport" DROP CONSTRAINT "AdReport_userId_fkey";

-- DropForeignKey
ALTER TABLE "AdTargeting" DROP CONSTRAINT "AdTargeting_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_userId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionPost" DROP CONSTRAINT "CollectionPost_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "CollectionPost" DROP CONSTRAINT "CollectionPost_postId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_momentId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_reelId_fkey";

-- DropForeignKey
ALTER TABLE "GitHubProject" DROP CONSTRAINT "GitHubProject_userId_fkey";

-- DropForeignKey
ALTER TABLE "GroupChat" DROP CONSTRAINT "GroupChat_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "GroupChatMember" DROP CONSTRAINT "GroupChatMember_groupId_fkey";

-- DropForeignKey
ALTER TABLE "GroupChatMember" DROP CONSTRAINT "GroupChatMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_reelId_fkey";

-- DropForeignKey
ALTER TABLE "LinkedAccount" DROP CONSTRAINT "LinkedAccount_linkedUserId_fkey";

-- DropForeignKey
ALTER TABLE "LinkedAccount" DROP CONSTRAINT "LinkedAccount_userId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "MessageRequest" DROP CONSTRAINT "MessageRequest_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "MessageRequest" DROP CONSTRAINT "MessageRequest_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Moment" DROP CONSTRAINT "Moment_userId_fkey";

-- DropForeignKey
ALTER TABLE "MomentLike" DROP CONSTRAINT "MomentLike_momentId_fkey";

-- DropForeignKey
ALTER TABLE "MomentLike" DROP CONSTRAINT "MomentLike_userId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_githubRepoId_fkey";

-- DropForeignKey
ALTER TABLE "PostReport" DROP CONSTRAINT "PostReport_postId_fkey";

-- DropForeignKey
ALTER TABLE "PostReport" DROP CONSTRAINT "PostReport_userId_fkey";

-- DropForeignKey
ALTER TABLE "PostShare" DROP CONSTRAINT "PostShare_postId_fkey";

-- DropForeignKey
ALTER TABLE "PostShare" DROP CONSTRAINT "PostShare_userId_fkey";

-- DropForeignKey
ALTER TABLE "Reel" DROP CONSTRAINT "Reel_userId_fkey";

-- DropForeignKey
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_userId_fkey";

-- DropForeignKey
ALTER TABLE "SavedProject" DROP CONSTRAINT "SavedProject_projectId_fkey";

-- DropForeignKey
ALTER TABLE "SavedProject" DROP CONSTRAINT "SavedProject_userId_fkey";

-- DropForeignKey
ALTER TABLE "StoreItem" DROP CONSTRAINT "StoreItem_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionHistory" DROP CONSTRAINT "SubscriptionHistory_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_itemId_fkey";

-- DropForeignKey
ALTER TABLE "UserBlock" DROP CONSTRAINT "UserBlock_blockedId_fkey";

-- DropForeignKey
ALTER TABLE "UserBlock" DROP CONSTRAINT "UserBlock_blockerId_fkey";

-- DropForeignKey
ALTER TABLE "UserSession" DROP CONSTRAINT "UserSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "VerificationPurchase" DROP CONSTRAINT "VerificationPurchase_userId_fkey";

-- DropIndex
DROP INDEX "Comment_createdAt_idx";

-- DropIndex
DROP INDEX "Comment_momentId_idx";

-- DropIndex
DROP INDEX "Comment_reelId_idx";

-- DropIndex
DROP INDEX "Like_reelId_idx";

-- DropIndex
DROP INDEX "Like_userId_postId_key";

-- DropIndex
DROP INDEX "Like_userId_reelId_key";

-- DropIndex
DROP INDEX "Message_groupId_idx";

-- DropIndex
DROP INDEX "Message_isRead_idx";

-- DropIndex
DROP INDEX "Message_recipientId_idx";

-- DropIndex
DROP INDEX "Message_senderId_recipientId_idx";

-- DropIndex
DROP INDEX "Notification_type_idx";

-- DropIndex
DROP INDEX "Notification_userId_isRead_idx";

-- DropIndex
DROP INDEX "Post_isArchived_idx";

-- DropIndex
DROP INDEX "Post_userId_createdAt_idx";

-- DropIndex
DROP INDEX "PostReport_status_idx";

-- DropIndex
DROP INDEX "Story_userId_expiresAt_idx";

-- DropIndex
DROP INDEX "User_createdAt_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "likesCount",
DROP COLUMN "momentId",
DROP COLUMN "reelId",
ALTER COLUMN "postId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Like" DROP COLUMN "reelId",
ALTER COLUMN "postId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "groupId",
DROP COLUMN "isRead",
DROP COLUMN "mediaType",
DROP COLUMN "recipientId",
ADD COLUMN     "chatId" TEXT,
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiverId" TEXT,
ALTER COLUMN "content" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "body",
DROP COLUMN "data",
DROP COLUMN "isRead",
DROP COLUMN "title",
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "postId" TEXT,
ADD COLUMN     "read" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "codeSnippet",
DROP COLUMN "githubRepoId",
DROP COLUMN "hashtags",
DROP COLUMN "isArchived",
DROP COLUMN "language",
DROP COLUMN "latitude",
DROP COLUMN "location",
DROP COLUMN "longitude",
DROP COLUMN "mediaType",
DROP COLUMN "mediaUrl",
DROP COLUMN "mentions",
ADD COLUMN     "mediaUrls" TEXT[],
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "repoData" JSONB,
ADD COLUMN     "repoUrl" TEXT,
ADD COLUMN     "type" "PostType" NOT NULL DEFAULT 'POST',
ADD COLUMN     "viewsCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "content" SET NOT NULL;

-- AlterTable
ALTER TABLE "PostReport" DROP COLUMN "details",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "SavedPost" ADD COLUMN     "collectionId" TEXT;

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "mediaType";

-- AlterTable
ALTER TABLE "StoryView" DROP COLUMN "viewedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "githubToken",
DROP COLUMN "interests",
DROP COLUMN "isGoldenVerified",
DROP COLUMN "isVerified",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "role",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "githubAccessToken" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "premium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "website" TEXT;

-- DropTable
DROP TABLE "AccountSettings";

-- DropTable
DROP TABLE "Ad";

-- DropTable
DROP TABLE "AdCampaign";

-- DropTable
DROP TABLE "AdInteraction";

-- DropTable
DROP TABLE "AdPayment";

-- DropTable
DROP TABLE "AdPreference";

-- DropTable
DROP TABLE "AdReport";

-- DropTable
DROP TABLE "AdTargeting";

-- DropTable
DROP TABLE "Collection";

-- DropTable
DROP TABLE "CollectionPost";

-- DropTable
DROP TABLE "EmailVerificationToken";

-- DropTable
DROP TABLE "Feedback";

-- DropTable
DROP TABLE "GitHubProject";

-- DropTable
DROP TABLE "GitHubSync";

-- DropTable
DROP TABLE "GroupChat";

-- DropTable
DROP TABLE "GroupChatMember";

-- DropTable
DROP TABLE "LinkedAccount";

-- DropTable
DROP TABLE "MessageRequest";

-- DropTable
DROP TABLE "Moment";

-- DropTable
DROP TABLE "MomentLike";

-- DropTable
DROP TABLE "NotificationPreference";

-- DropTable
DROP TABLE "PasswordResetToken";

-- DropTable
DROP TABLE "Reel";

-- DropTable
DROP TABLE "RefreshToken";

-- DropTable
DROP TABLE "SavedProject";

-- DropTable
DROP TABLE "StoreItem";

-- DropTable
DROP TABLE "Subscription";

-- DropTable
DROP TABLE "SubscriptionHistory";

-- DropTable
DROP TABLE "Transaction";

-- DropTable
DROP TABLE "UserSession";

-- DropTable
DROP TABLE "VerificationPurchase";

-- DropTable
DROP TABLE "VerificationRequest";

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
    "userId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hashtag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHashtag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,

    CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_refreshToken_idx" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Chat_isGroup_idx" ON "Chat"("isGroup");

-- CreateIndex
CREATE INDEX "ChatMember_chatId_idx" ON "ChatMember"("chatId");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_chatId_userId_key" ON "ChatMember"("chatId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Hashtag_name_key" ON "Hashtag"("name");

-- CreateIndex
CREATE INDEX "Hashtag_name_idx" ON "Hashtag"("name");

-- CreateIndex
CREATE INDEX "Hashtag_trending_idx" ON "Hashtag"("trending");

-- CreateIndex
CREATE INDEX "PostHashtag_postId_idx" ON "PostHashtag"("postId");

-- CreateIndex
CREATE INDEX "PostHashtag_hashtagId_idx" ON "PostHashtag"("hashtagId");

-- CreateIndex
CREATE UNIQUE INDEX "PostHashtag_postId_hashtagId_key" ON "PostHashtag"("postId", "hashtagId");

-- CreateIndex
CREATE INDEX "StoryReaction_storyId_idx" ON "StoryReaction"("storyId");

-- CreateIndex
CREATE INDEX "StoryReaction_userId_idx" ON "StoryReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_storyId_userId_key" ON "StoryReaction"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryReply_storyId_idx" ON "StoryReply"("storyId");

-- CreateIndex
CREATE INDEX "StoryReply_userId_idx" ON "StoryReply"("userId");

-- CreateIndex
CREATE INDEX "Mention_userId_idx" ON "Mention"("userId");

-- CreateIndex
CREATE INDEX "Mention_postId_idx" ON "Mention"("postId");

-- CreateIndex
CREATE INDEX "Mention_commentId_idx" ON "Mention"("commentId");

-- CreateIndex
CREATE INDEX "SavedCollection_userId_idx" ON "SavedCollection"("userId");

-- CreateIndex
CREATE INDEX "SavedCollectionItem_collectionId_idx" ON "SavedCollectionItem"("collectionId");

-- CreateIndex
CREATE INDEX "SavedCollectionItem_postId_idx" ON "SavedCollectionItem"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCollectionItem_collectionId_postId_key" ON "SavedCollectionItem"("collectionId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_githubId_key" ON "Project"("githubId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_owner_name_idx" ON "Project"("owner", "name");

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_userId_key" ON "Like"("postId", "userId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Post_projectId_idx" ON "Post"("projectId");

-- CreateIndex
CREATE INDEX "Post_type_idx" ON "Post"("type");

-- CreateIndex
CREATE INDEX "SavedPost_userId_idx" ON "SavedPost"("userId");

-- CreateIndex
CREATE INDEX "SavedPost_postId_idx" ON "SavedPost"("postId");

-- CreateIndex
CREATE INDEX "SavedPost_collectionId_idx" ON "SavedPost"("collectionId");

-- CreateIndex
CREATE INDEX "StoryView_storyId_idx" ON "StoryView"("storyId");

-- CreateIndex
CREATE INDEX "StoryView_userId_idx" ON "StoryView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_githubId_idx" ON "User"("githubId");

-- CreateIndex
CREATE INDEX "User_googleId_idx" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "Hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReply" ADD CONSTRAINT "StoryReply_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCollectionItem" ADD CONSTRAINT "SavedCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
