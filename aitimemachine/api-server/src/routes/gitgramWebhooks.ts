import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../lib/monitoring.js";
import {
  postCommitToGitgram,
  postReleaseToGitgram,
  postRestoreEventToGitgram,
} from "../services/gitgramBridgeService.js";

const router = Router();

// ============================================================================
// Validation schemas
// ============================================================================

const commitSchema = z.object({
  hash: z.string().min(1),
  message: z.string().min(1),
  author: z.string().min(1),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
});

const releaseSchema = z.object({
  tag: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(""),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
});

const restoreSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
});

// ============================================================================
// POST /gitgram-webhooks/commit
// ============================================================================

router.post("/commit", async (req: Request, res: Response) => {
  const parsed = commitSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        type: "invalid_request",
        message: "Invalid commit payload",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  try {
    await postCommitToGitgram(parsed.data);
    return res.json({ success: true, event: "commit" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("gitgramWebhooks: commit handler error", err);
    return res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to post commit to Gitgram",
      },
    });
  }
});

// ============================================================================
// POST /gitgram-webhooks/release
// ============================================================================

router.post("/release", async (req: Request, res: Response) => {
  const parsed = releaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        type: "invalid_request",
        message: "Invalid release payload",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  try {
    await postReleaseToGitgram(parsed.data);
    return res.json({ success: true, event: "release" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("gitgramWebhooks: release handler error", err);
    return res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to post release to Gitgram",
      },
    });
  }
});

// ============================================================================
// POST /gitgram-webhooks/restore
// ============================================================================

router.post("/restore", async (req: Request, res: Response) => {
  const parsed = restoreSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        type: "invalid_request",
        message: "Invalid restore payload",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const restoreData = {
    ...parsed.data,
    timestamp: new Date().toISOString(),
  };

  try {
    await postRestoreEventToGitgram(restoreData);
    return res.json({ success: true, event: "restore" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("gitgramWebhooks: restore handler error", err);
    return res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to post restore event to Gitgram",
      },
    });
  }
});

export default router;
