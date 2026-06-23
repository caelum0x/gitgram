/**
 * Worker status and manual trigger endpoints.
 *
 * GET  /api/workers/status           - show all worker states
 * POST /api/workers/:name/trigger    - manually trigger a worker run
 *
 * Protected by internal auth (X-Internal-Secret header).
 */

import { Router, Request, Response } from "express";
import { internalAuth } from "../middleware/auth.js";
import { getScheduler } from "../services/backgroundWorkers.js";

const router = Router();

// All worker admin endpoints require internal auth
router.use(internalAuth);

/**
 * GET /api/workers/status
 *
 * Returns the health report for all registered workers.
 */
router.get("/status", (req: Request, res: Response) => {
  const scheduler = getScheduler();

  if (!scheduler) {
    return res.json({
      success: true,
      managed: false,
      message: "Managed scheduler is not active. Set ENABLE_WORKERS=true to enable.",
      workers: [],
    });
  }

  const workers = scheduler.getAllHealth();

  return res.json({
    success: true,
    managed: true,
    workers,
  });
});

/**
 * POST /api/workers/:name/trigger
 *
 * Manually trigger a worker run by name.
 * The worker must be registered in the scheduler but does not have to be enabled.
 */
router.post("/:name/trigger", async (req: Request, res: Response) => {
  const scheduler = getScheduler();

  if (!scheduler) {
    return res.status(503).json({
      success: false,
      error: "Managed scheduler is not active. Set ENABLE_WORKERS=true to enable.",
    });
  }

  const { name } = req.params;
  const worker = scheduler.getWorker(name);

  if (!worker) {
    return res.status(404).json({
      success: false,
      error: `Worker "${name}" not found`,
      available: scheduler.getAllWorkers().map((w) => w.name),
    });
  }

  try {
    const result = await scheduler.trigger(name);

    if (result === null) {
      return res.status(409).json({
        success: false,
        error: `Worker "${name}" is currently locked (another run is in progress)`,
      });
    }

    return res.json({
      success: true,
      worker: name,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
