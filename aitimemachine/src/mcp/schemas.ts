import { z } from "zod";

export const zProjectId = z.string().min(1);
export const zCheckpointId = z.string().min(1);

export const zCheckpointScope = z.enum(["files", "files+chat", "files+chat+terminal", "full"]);
export const zRestoreMode = z.enum(["safe", "hard"]);
export const zRestoreScope = z.enum(["files", "files+chat"]);

export const zEnvMap = z.record(z.string(), z.string());

export const zCheckpointCreateInput = z.object({
  projectId: zProjectId,
  name: z.string().min(1),
  scope: zCheckpointScope,
  mode: z.enum(["shallow", "full"]).default("shallow"),
  capsule: z
    .object({
      imageRef: z.string().min(1).optional(),
      // If you support pinning directly:
      imageDigest: z.string().min(1).optional(),
      workdir: z.string().min(1).optional(),
      env: zEnvMap.optional(),
    })
    .optional(),
});

export const zCheckpointRestoreInput = z.object({
  projectId: zProjectId,
  checkpointId: zCheckpointId,
  mode: zRestoreMode,
  restoreScope: zRestoreScope,
  backupCurrent: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const zCapsuleExecInput = z.object({
  projectId: zProjectId,
  capsuleId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(10 * 60 * 1000).default(60_000),
});

// Optional for capsule upsert
export const zCapsuleUpsertInput = z.object({
  projectId: zProjectId,
  capsuleId: z.string().min(1),
  imageRef: z.string().min(1),
  workdir: z.string().min(1).default("/workspace"),
  env: zEnvMap.optional(),
});

export const zRewindToCheckpoint = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1),
  mode: z.enum(["safe","hard"]).default("hard"),
  includeContextText: z.boolean().default(true),
});

export const zRewindToLastGreen = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["safe","hard"]).default("hard"),
  includeContextText: z.boolean().default(true),
  // pattern override if user wants
  greenNamePatterns: z.array(z.string()).default(["Tests green", "Build green"]),
});

export const zResumeContext = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1),
});
