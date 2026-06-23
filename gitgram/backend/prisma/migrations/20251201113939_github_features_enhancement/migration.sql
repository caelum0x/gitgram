-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "openIssues" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "watchers" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserLanguagePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLanguagePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopicInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTopicInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingRepository" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLanguagePreference_userId_idx" ON "UserLanguagePreference"("userId");

-- CreateIndex
CREATE INDEX "UserLanguagePreference_language_idx" ON "UserLanguagePreference"("language");

-- CreateIndex
CREATE UNIQUE INDEX "UserLanguagePreference_userId_language_key" ON "UserLanguagePreference"("userId", "language");

-- CreateIndex
CREATE INDEX "UserTopicInterest_userId_idx" ON "UserTopicInterest"("userId");

-- CreateIndex
CREATE INDEX "UserTopicInterest_topic_idx" ON "UserTopicInterest"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicInterest_userId_topic_key" ON "UserTopicInterest"("userId", "topic");

-- CreateIndex
CREATE INDEX "RepositoryView_userId_idx" ON "RepositoryView"("userId");

-- CreateIndex
CREATE INDEX "RepositoryView_repositoryId_idx" ON "RepositoryView"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryView_createdAt_idx" ON "RepositoryView"("createdAt");

-- CreateIndex
CREATE INDEX "RepositoryBookmark_userId_idx" ON "RepositoryBookmark"("userId");

-- CreateIndex
CREATE INDEX "RepositoryBookmark_repositoryId_idx" ON "RepositoryBookmark"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryBookmark_userId_repositoryId_key" ON "RepositoryBookmark"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "TrendingRepository_period_rank_idx" ON "TrendingRepository"("period", "rank");

-- CreateIndex
CREATE INDEX "TrendingRepository_createdAt_idx" ON "TrendingRepository"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingRepository_repositoryId_period_key" ON "TrendingRepository"("repositoryId", "period");

-- CreateIndex
CREATE INDEX "Repository_trending_idx" ON "Repository"("trending");

-- CreateIndex
CREATE INDEX "Repository_trendingScore_idx" ON "Repository"("trendingScore");

-- AddForeignKey
ALTER TABLE "RepositoryView" ADD CONSTRAINT "RepositoryView_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryBookmark" ADD CONSTRAINT "RepositoryBookmark_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
