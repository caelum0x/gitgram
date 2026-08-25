import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/monitoring.js";

export interface AdoptionIngestionRequest extends Request {
  collectorKeySlot?: "current" | "previous";
}

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateHash = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

export function adoptionIngestionAuth(
  req: AdoptionIngestionRequest,
  res: Response,
  next: NextFunction
) {
  const supplied = req.get("x-internal-secret") || "";
  const strictEnvironment = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
  const current = process.env.ADOPTION_INGESTION_SECRET
    || (!strictEnvironment ? process.env.INTERNAL_SECRET : undefined);
  const previous = process.env.ADOPTION_INGESTION_SECRET_PREVIOUS;

  res.setHeader("Cache-Control", "no-store");
  if (!current) {
    logger.error("ADOPTION_INGESTION_SECRET not configured", undefined, {
      source: "adoption-ingestion-auth",
    });
    return res.status(503).json({ error: "Adoption ingestion is not configured" });
  }

  if (supplied && matchesSecret(supplied, current)) {
    req.collectorKeySlot = "current";
    return next();
  }
  if (supplied && previous && matchesSecret(supplied, previous)) {
    req.collectorKeySlot = "previous";
    res.setHeader("X-Collector-Key-Rotation", "previous-key-accepted");
    return next();
  }

  return res.status(401).json({ error: "Invalid adoption ingestion credential" });
}
