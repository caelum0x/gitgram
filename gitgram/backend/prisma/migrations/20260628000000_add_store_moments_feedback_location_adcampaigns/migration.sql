-- Store: creator marketplace items & purchases
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
CREATE INDEX "StoreItem_sellerId_idx" ON "StoreItem"("sellerId");
CREATE INDEX "StoreItem_status_idx" ON "StoreItem"("status");
CREATE INDEX "StoreItem_category_idx" ON "StoreItem"("category");
CREATE INDEX "StoreItem_createdAt_idx" ON "StoreItem"("createdAt");

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
CREATE INDEX "StorePurchase_itemId_idx" ON "StorePurchase"("itemId");
CREATE INDEX "StorePurchase_buyerId_idx" ON "StorePurchase"("buyerId");
CREATE INDEX "StorePurchase_sellerId_idx" ON "StorePurchase"("sellerId");
CREATE INDEX "StorePurchase_status_idx" ON "StorePurchase"("status");
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Moments: screenshot + selfie posts
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
CREATE INDEX "Moment_userId_idx" ON "Moment"("userId");
CREATE INDEX "Moment_createdAt_idx" ON "Moment"("createdAt");

CREATE TABLE "MomentLike" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MomentLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MomentLike_momentId_userId_key" ON "MomentLike"("momentId", "userId");
CREATE INDEX "MomentLike_momentId_idx" ON "MomentLike"("momentId");
CREATE INDEX "MomentLike_userId_idx" ON "MomentLike"("userId");
ALTER TABLE "MomentLike" ADD CONSTRAINT "MomentLike_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feedback: user-submitted bug reports & feature requests
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
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX "Feedback_type_idx" ON "Feedback"("type");
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- Ad campaigns
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
CREATE INDEX "AdCampaign_advertiserId_idx" ON "AdCampaign"("advertiserId");
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- Ad preferences (per-user personalization)
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
CREATE UNIQUE INDEX "AdPreferences_userId_key" ON "AdPreferences"("userId");
CREATE INDEX "AdPreferences_userId_idx" ON "AdPreferences"("userId");

-- Advertisement: campaign linkage + creative & engagement fields
ALTER TABLE "Advertisement" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN "callToAction" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN "placement" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Advertisement" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Advertisement" ADD COLUMN "conversions" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Advertisement_campaignId_idx" ON "Advertisement"("campaignId");

-- Geotagging columns for map / nearby discovery
ALTER TABLE "Post" ADD COLUMN "location" TEXT;
ALTER TABLE "Post" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Post" ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "Project" ADD COLUMN "location" TEXT;
ALTER TABLE "Project" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "User" ADD COLUMN "location" TEXT;
ALTER TABLE "User" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "longitude" DOUBLE PRECISION;
