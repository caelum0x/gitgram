-- Recruiter placement / candidate-unlock revenue entitlement + receipt.
-- Charged through the Creem adapter (merchant-of-record with Turkey payout
-- support), settled by the signed Creem checkout.completed webhook.

CREATE TABLE "TalentPlacement" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "feeCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "feeModel" TEXT NOT NULL DEFAULT 'unlock',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT NOT NULL DEFAULT 'creem',
  "checkoutId" TEXT,
  "providerOrderId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentPlacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TalentPlacement_feeCents_check" CHECK ("feeCents" >= 0)
);

CREATE UNIQUE INDEX "TalentPlacement_providerOrderId_key" ON "TalentPlacement"("providerOrderId");
CREATE UNIQUE INDEX "TalentPlacement_opportunityId_candidateId_recruiterId_key" ON "TalentPlacement"("opportunityId", "candidateId", "recruiterId");
CREATE INDEX "TalentPlacement_recruiterId_status_idx" ON "TalentPlacement"("recruiterId", "status");
CREATE INDEX "TalentPlacement_candidateId_idx" ON "TalentPlacement"("candidateId");
CREATE INDEX "TalentPlacement_status_idx" ON "TalentPlacement"("status");

ALTER TABLE "TalentPlacement"
  ADD CONSTRAINT "TalentPlacement_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "TalentOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
