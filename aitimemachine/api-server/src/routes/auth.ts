import { Router } from "express";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// Verify API key and return user info
router.get("/me", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    res.json({
      userId: user.userId,
      email: user.email,
      plan: user.plan,
    });
  } catch (error) {
    logger.error("Auth me error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get user info" });
  }
});

export default router;
