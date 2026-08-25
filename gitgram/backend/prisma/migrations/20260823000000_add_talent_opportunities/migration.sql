CREATE TYPE "TalentOpportunityStatus" AS ENUM ('OPEN', 'MATCHING', 'PILOT', 'CLOSED');
CREATE TYPE "TalentPilotStatus" AS ENUM ('PLANNED', 'ACTIVE', 'REVIEW', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TalentReferralStatus" AS ENUM ('CONTACTED', 'ACCEPTED', 'DECLINED');

CREATE TABLE "TalentOpportunity" (
  "id" TEXT NOT NULL,
  "organizationName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "requiredSkills" TEXT[] NOT NULL,
  "successMetric" TEXT NOT NULL,
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "sourceChannel" TEXT NOT NULL DEFAULT 'direct',
    "communityReferralConsent" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "status" "TalentOpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentOpportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TalentOpportunity_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "TalentOpportunity_durationWeeks_check" CHECK ("durationWeeks" BETWEEN 1 AND 16)
);

CREATE TABLE "TalentPilot" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "referralId" TEXT,
  "participantId" TEXT NOT NULL,
  "status" "TalentPilotStatus" NOT NULL DEFAULT 'PLANNED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "milestones" JSONB NOT NULL DEFAULT '[]',
  "deliverableUrl" TEXT,
  "feedback" TEXT,
  "publicEvidenceConsent" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentPilot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TalentPilot_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "TalentReferral" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "referredById" TEXT NOT NULL,
  "status" "TalentReferralStatus" NOT NULL DEFAULT 'CONTACTED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentReferral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TalentReferral_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "TalentPilotStatusTransition" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "previousStatus" "TalentPilotStatus" NOT NULL,
  "nextStatus" "TalentPilotStatus" NOT NULL,
  "revision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentPilotStatusTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TalentPilotStatusTransition_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "TalentPublicProof" (
  "pilotId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "deliverableUrl" TEXT NOT NULL,
  "evidenceSkills" TEXT[] NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentPublicProof_pkey" PRIMARY KEY ("pilotId"),
  CONSTRAINT "TalentPublicProof_schemaVersion_check" CHECK ("schemaVersion" = 1)
);

CREATE TABLE "TalentMutationReceipt" (
  "id" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TalentOpportunity_createdById_idx" ON "TalentOpportunity"("createdById");
CREATE INDEX "TalentOpportunity_status_createdAt_idx" ON "TalentOpportunity"("status", "createdAt");
CREATE UNIQUE INDEX "TalentPilot_opportunityId_participantId_key" ON "TalentPilot"("opportunityId", "participantId");
CREATE UNIQUE INDEX "TalentPilot_referralId_key" ON "TalentPilot"("referralId");
CREATE INDEX "TalentPilot_participantId_status_idx" ON "TalentPilot"("participantId", "status");
CREATE UNIQUE INDEX "TalentReferral_opportunityId_participantId_key" ON "TalentReferral"("opportunityId", "participantId");
CREATE INDEX "TalentReferral_participantId_status_idx" ON "TalentReferral"("participantId", "status");
CREATE INDEX "TalentReferral_opportunityId_status_idx" ON "TalentReferral"("opportunityId", "status");
CREATE INDEX "TalentPilotStatusTransition_pilotId_createdAt_idx" ON "TalentPilotStatusTransition"("pilotId", "createdAt");
CREATE INDEX "TalentPilotStatusTransition_actorId_createdAt_idx" ON "TalentPilotStatusTransition"("actorId", "createdAt");
CREATE UNIQUE INDEX "TalentPilotStatusTransition_pilotId_revision_key" ON "TalentPilotStatusTransition"("pilotId", "revision");
CREATE UNIQUE INDEX "TalentPublicProof_publicId_key" ON "TalentPublicProof"("publicId");
CREATE INDEX "TalentPublicProof_participantId_completedAt_idx" ON "TalentPublicProof"("participantId", "completedAt");
CREATE INDEX "TalentPublicProof_evidenceSkills_idx" ON "TalentPublicProof" USING GIN ("evidenceSkills");
CREATE UNIQUE INDEX "TalentMutationReceipt_requestFingerprint_key" ON "TalentMutationReceipt"("requestFingerprint");
CREATE INDEX "TalentMutationReceipt_actorId_createdAt_idx" ON "TalentMutationReceipt"("actorId", "createdAt");
CREATE INDEX "TalentMutationReceipt_resourceType_resourceId_createdAt_idx" ON "TalentMutationReceipt"("resourceType", "resourceId", "createdAt");

ALTER TABLE "TalentPilot"
  ADD CONSTRAINT "TalentPilot_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "TalentOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TalentReferral"
  ADD CONSTRAINT "TalentReferral_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "TalentOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TalentPilot"
  ADD CONSTRAINT "TalentPilot_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "TalentReferral"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TalentPilotStatusTransition"
  ADD CONSTRAINT "TalentPilotStatusTransition_pilotId_fkey"
  FOREIGN KEY ("pilotId") REFERENCES "TalentPilot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TalentPublicProof"
  ADD CONSTRAINT "TalentPublicProof_pilotId_fkey"
  FOREIGN KEY ("pilotId") REFERENCES "TalentPilot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
