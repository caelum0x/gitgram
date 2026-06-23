/**
 * Tree routes: API endpoints for querying Git-like tree objects.
 *
 * Provides directory-level browsing of checkpoint file states:
 * - GET /trees/:checkpointId  - Get root tree entries for a checkpoint
 * - GET /trees/:checkpointId/path/* - Get tree entries at a specific directory path
 * - GET /trees/hash/:hash     - Get a tree directly by its content hash
 */

import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { eq, and } from "drizzle-orm";
import {
  getTreeEntriesForCheckpoint,
  getTreeByHash,
  getTreeAtPath,
} from "../services/treeService.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

// ============================================
// Validation schemas
// ============================================

const treeQuerySchema = z.object({
  projectId: z.string().min(1),
});

const treeByHashQuerySchema = z.object({
  projectId: z.string().min(1),
});

// ============================================
// GET /trees/:checkpointId
// Get root tree entries for a checkpoint
// ============================================

router.get("/:checkpointId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { checkpointId } = req.params;
    const query = treeQuerySchema.parse(req.query);

    const result = await getTreeEntriesForCheckpoint(
      checkpointId,
      query.projectId,
      userId,
      "/"
    );

    if (!result) {
      return res.status(404).json({
        error: "Tree not found",
        message:
          "Checkpoint not found, has no tree, or does not belong to you",
      });
    }

    return res.json({
      success: true,
      checkpoint: result.checkpoint,
      path: "/",
      tree: {
        hash: result.tree.hash,
        parentPath: result.tree.parentPath,
        entries: result.tree.entries,
      },
    });
  } catch (error) {
    logger.error("tree get error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid request" });
  }
});

// ============================================
// GET /trees/:checkpointId/path/*
// Get tree entries at a specific directory path within a checkpoint
// ============================================

router.get(
  "/:checkpointId/path/*",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { checkpointId } = req.params;
      // Express wildcard capture: req.params[0] gives everything after /path/
      const dirPath = (req.params as any)[0] || "/";
      const query = treeQuerySchema.parse(req.query);

      // Normalize path: ensure it ends with "/" for directory paths, or use "/" for root
      let normalizedPath = dirPath;
      if (normalizedPath !== "/" && !normalizedPath.endsWith("/")) {
        normalizedPath += "/";
      }

      const result = await getTreeEntriesForCheckpoint(
        checkpointId,
        query.projectId,
        userId,
        normalizedPath
      );

      if (!result) {
        return res.status(404).json({
          error: "Tree not found",
          message:
            "Checkpoint, tree path, or directory not found",
        });
      }

      return res.json({
        success: true,
        checkpoint: result.checkpoint,
        path: normalizedPath,
        tree: {
          hash: result.tree.hash,
          parentPath: result.tree.parentPath,
          entries: result.tree.entries,
        },
      });
    } catch (error) {
      logger.error("tree path get error", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(400).json({ error: "Invalid request" });
    }
  }
);

// ============================================
// GET /trees/hash/:hash
// Get a tree directly by its content hash (low-level access)
// ============================================

router.get("/hash/:hash", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { hash } = req.params;
    const query = treeByHashQuerySchema.parse(req.query);

    // Verify the user owns the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, query.projectId),
          eq(schema.projects.userId, userId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const tree = await getTreeByHash(query.projectId, hash);

    if (!tree) {
      return res.status(404).json({
        error: "Tree not found",
        message: "No tree with this hash exists for this project",
      });
    }

    return res.json({
      success: true,
      tree: {
        id: tree.id,
        hash: tree.hash,
        parentPath: tree.parentPath,
        entries: tree.entries,
        createdAt: tree.createdAt,
      },
    });
  } catch (error) {
    logger.error("tree hash get error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid request" });
  }
});

export default router;
