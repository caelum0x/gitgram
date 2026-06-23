/**
 * Production MCP Tools: GC, Integrity, etc.
 */

import { z } from "zod";
import type { Repo } from "../store/repo.js";
import type { CasStore } from "../core/cas.js";
import { TimeMachineEngine } from "../core/engine.js";
import { runGarbageCollection } from "../core/gc.js";
import { verifyIntegrity, type IntegrityCheckLevel } from "../core/integrity.js";
import { TmError } from "../core/errors.js";

/**
 * Garbage Collection Tool Schema
 */
export const zGcRunInput = z.object({
  projectId: z.string().optional(),
  dryRun: z.boolean().default(false),
  safetyWindowDays: z.number().int().min(1).max(90).default(7),
});

/**
 * Integrity Check Tool Schema
 */
export const zIntegrityCheckInput = z.object({
  projectId: z.string().min(1),
  level: z.enum(["light", "deep"]).default("light"),
});

/**
 * Create GC tool handler
 */
export function createGcTool(engine: TimeMachineEngine) {
  return {
    name: "tm_gc_run",
    description: "Run garbage collection to remove unreferenced blobs (mark & sweep)",
    inputSchema: zGcRunInput,
    handler: async (input: z.infer<typeof zGcRunInput>) => {
      try {
        const result = await runGarbageCollection(engine, {
          dryRun: input.dryRun,
          keepDays: input.safetyWindowDays || 7,
          keepMinimum: 10,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                  message: input.dryRun
                    ? `DRY RUN: Would delete ${result.blobsRemoved} blobs (${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB)`
                    : `Deleted ${result.blobsRemoved} blobs, reclaimed ${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        const err = e instanceof TmError ? e : new TmError("TM_IO_ERROR", String(e));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  };
}

/**
 * Create Integrity Check tool handler
 */
export function createIntegrityCheckTool(repo: Repo, cas: CasStore) {
  return {
    name: "tm_integrity_check",
    description: "Verify integrity of checkpoints and blobs",
    inputSchema: zIntegrityCheckInput,
    handler: async (input: z.infer<typeof zIntegrityCheckInput>) => {
      try {
        const result = await verifyIntegrity(repo, cas, input.projectId, input.level as IntegrityCheckLevel);

        const summary = result.passed
          ? `✅ Integrity check PASSED\n` +
            `Checkpoints: ${result.checkpointsChecked}\n` +
            `Manifests verified: ${result.manifestsVerified}\n` +
            `Blobs verified: ${result.blobsVerified}`
          : `❌ Integrity check FAILED\n` +
            `Errors: ${result.errors.length}\n` +
            `Warnings: ${result.warnings.length}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.passed,
                  summary,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        const err = e instanceof TmError ? e : new TmError("TM_IO_ERROR", String(e));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  };
}
