-- AlterTable
ALTER TABLE "Post" ADD COLUMN "aitm_checkpoint_id" TEXT,
ADD COLUMN "aitm_project_id" TEXT,
ADD COLUMN "aitm_checkpoint_ref" JSONB;

-- CreateIndex
CREATE INDEX "Post_aitmCheckpointId_idx" ON "Post"("aitm_checkpoint_id");

-- CreateIndex
CREATE INDEX "Post_aitmProjectId_idx" ON "Post"("aitm_project_id");
