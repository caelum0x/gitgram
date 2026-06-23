-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "repoName" TEXT,
ADD COLUMN     "repoOwner" TEXT,
ADD COLUMN     "repositoryId" TEXT;

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "topics" TEXT[],
    "avatarUrl" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "lastFetched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepositoryFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_stars_idx" ON "Repository"("stars");

-- CreateIndex
CREATE INDEX "Repository_language_idx" ON "Repository"("language");

-- CreateIndex
CREATE INDEX "Repository_fullName_idx" ON "Repository"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "RepositoryFollow_userId_idx" ON "RepositoryFollow"("userId");

-- CreateIndex
CREATE INDEX "RepositoryFollow_repositoryId_idx" ON "RepositoryFollow"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryFollow_userId_repositoryId_key" ON "RepositoryFollow"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "Post_repositoryId_idx" ON "Post"("repositoryId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryFollow" ADD CONSTRAINT "RepositoryFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryFollow" ADD CONSTRAINT "RepositoryFollow_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
