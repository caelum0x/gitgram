import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { triggerWebhooksForUser } from "./webhookDelivery.js";
import { logger } from "../lib/monitoring.js";

export interface RestoreEventInput {
  userId: string;
  projectId: string;
  fromCheckpointId?: string | null;
  toCheckpointId: string;
  scopeType: "project" | "folder" | "file";
  scopePath?: string | null;
  status?: "requested" | "applied" | "failed";
  source?: string;
  details?: Record<string, unknown>;
}

export async function recordRestoreEventAndEmitWebhooks(input: RestoreEventInput) {
  const status = input.status || "applied";

  const [eventRow] = await db
    .insert(schema.restoreEvents)
    .values({
      projectId: input.projectId,
      actorUserId: input.userId,
      fromCheckpointId: input.fromCheckpointId || null,
      toCheckpointId: input.toCheckpointId,
      scopeType: input.scopeType,
      scopePath: input.scopePath || null,
      status,
      details: {
        source: input.source || "restore",
        ...(input.details || {}),
      },
      createdAt: new Date(),
    })
    .returning({
      id: schema.restoreEvents.id,
      createdAt: schema.restoreEvents.createdAt,
    });

  const [toCheckpoint] = await db
    .select({
      id: schema.checkpoints.id,
      name: schema.checkpoints.name,
      description: schema.checkpoints.description,
      createdAt: schema.checkpoints.createdAt,
    })
    .from(schema.checkpoints)
    .where(eq(schema.checkpoints.id, input.toCheckpointId))
    .limit(1);

  const [fromCheckpoint] = input.fromCheckpointId
    ? await db
        .select({
          id: schema.checkpoints.id,
          name: schema.checkpoints.name,
          description: schema.checkpoints.description,
          createdAt: schema.checkpoints.createdAt,
        })
        .from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, input.fromCheckpointId))
        .limit(1)
    : [null];

  const webhookBase = {
    restoreEventId: eventRow.id,
    projectId: input.projectId,
    scopeType: input.scopeType,
    scopePath: input.scopePath || null,
    status,
    source: input.source || "restore",
    fromCheckpointId: input.fromCheckpointId || null,
    toCheckpointId: input.toCheckpointId,
    details: input.details || {},
    restoredAt: eventRow.createdAt || new Date(),
  };

  const checkpointRestoredPayload = {
    ...webhookBase,
    checkpointId: input.toCheckpointId,
    checkpointName: toCheckpoint?.name || null,
    checkpointDescription: toCheckpoint?.description || null,
    checkpointCreatedAt: toCheckpoint?.createdAt || null,
    fromCheckpointName: fromCheckpoint?.name || null,
    fromCheckpointDescription: fromCheckpoint?.description || null,
    fromCheckpointCreatedAt: fromCheckpoint?.createdAt || null,
  };

  triggerWebhooksForUser(input.userId, "checkpoint.restored", checkpointRestoredPayload).catch(
    (err) => logger.error("checkpoint.restored webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) })
  );

  triggerWebhooksForUser(input.userId, "restore.event", webhookBase).catch((err) =>
    logger.error("restore.event webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) })
  );

  return {
    id: eventRow.id,
    createdAt: eventRow.createdAt,
  };
}
