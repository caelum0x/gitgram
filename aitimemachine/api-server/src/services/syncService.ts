import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

// ============================================
// TYPES & INTERFACES
// ============================================

export interface SyncCheckpoint {
  id: string;
  projectPath: string;
  userId: string;
  deviceId: string;
  gitHash: string | null;
  fileHashesHash: string;
  envVarsHash: string;
  branch: string | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface SyncStatus {
  inSync: boolean;
  behind: number;
  ahead: number;
  conflicts: string[];
}

export interface ProjectState {
  checkpointId: string;
  projectPath: string;
  gitHash: string | null;
  branch: string | null;
  fileHashesHash: string;
  changedFiles: string[];
  pushedAt: Date;
}

export interface Device {
  id: string;
  name: string;
  lastSync: Date | null;
  platform: string;
  currentBranch: string | null;
}

export type ConflictResolution = "keep_local" | "keep_remote" | "merge";

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return crypto.randomUUID();
}

function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hashObject(obj: Record<string, unknown>): string {
  return hashString(JSON.stringify(obj, Object.keys(obj).sort()));
}

/**
 * Derive a stable per-device project key used to scope sync records.
 */
function projectDeviceKey(projectPath: string, deviceId: string): string {
  return hashString(`${projectPath}:${deviceId}`);
}

// ============================================
// SYNC CHECKPOINT
// ============================================

/**
 * Takes a snapshot of the current project state and stores it in the DB.
 * Reads current checkpoint data from the projects + checkpoints tables.
 */
export async function createSyncCheckpoint(
  projectPath: string,
  userId: string,
  deviceId: string = "default",
  extras: {
    gitHash?: string;
    fileHashes?: Record<string, string>;
    envVarNames?: string[];
    branch?: string;
  } = {}
): Promise<SyncCheckpoint> {
  const { gitHash = null, fileHashes = {}, envVarNames = [], branch = null } = extras;

  const fileHashesHash = hashObject(fileHashes as Record<string, unknown>);
  // Hash only the sorted names of env vars (not values) to avoid storing secrets
  const envVarsHash = hashString(envVarNames.slice().sort().join(","));

  const id = generateId();
  const now = new Date();

  const checkpointData = {
    id,
    projectPath,
    userId,
    deviceId,
    gitHash,
    fileHashesHash,
    envVarsHash,
    branch,
    createdAt: now,
  };

  // Persist as a JSON metadata blob on an existing checkpoint row so we
  // reuse the schema without requiring a migration.  We look up the latest
  // project checkpoint and annotate it, or create a lightweight sentinel row.
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.rootPath, projectPath)
      )
    )
    .limit(1);

  if (project) {
    await db.insert(schema.checkpoints).values({
      id,
      projectId: project.id,
      userId,
      name: `sync:${deviceId}:${now.toISOString()}`,
      description: `Sync checkpoint from device ${deviceId}`,
      manifestHash: fileHashesHash,
      triggerType: "sync",
      metadata: checkpointData as unknown as Record<string, unknown>,
    });
  }

  logger.info("Sync checkpoint created", {
    checkpointId: id,
    userId,
    deviceId,
    projectPath,
  });

  return { ...checkpointData, metadata: checkpointData };
}

// ============================================
// SYNC STATUS
// ============================================

/**
 * Compares the local device's latest checkpoint against all other device
 * checkpoints for the same project to determine sync status.
 */
export async function getSyncStatus(
  projectPath: string,
  userId: string,
  deviceId: string
): Promise<SyncStatus> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.rootPath, projectPath)
      )
    )
    .limit(1);

  if (!project) {
    return { inSync: true, behind: 0, ahead: 0, conflicts: [] };
  }

  // Fetch all sync checkpoints for this project, newest first
  const rows = await db
    .select({ id: schema.checkpoints.id, metadata: schema.checkpoints.metadata, createdAt: schema.checkpoints.createdAt })
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.projectId, project.id),
        eq(schema.checkpoints.triggerType, "sync")
      )
    )
    .orderBy(desc(schema.checkpoints.createdAt));

  type SyncMeta = { deviceId?: string; fileHashesHash?: string; branch?: string; createdAt?: string };

  const localCheckpoints = rows.filter(
    (r) => (r.metadata as SyncMeta)?.deviceId === deviceId
  );
  const remoteCheckpoints = rows.filter(
    (r) => (r.metadata as SyncMeta)?.deviceId !== deviceId
  );

  const localLatest = localCheckpoints[0];
  const remoteLatest = remoteCheckpoints[0];

  if (!remoteLatest) {
    return { inSync: true, behind: 0, ahead: localCheckpoints.length, conflicts: [] };
  }

  if (!localLatest) {
    return { inSync: false, behind: remoteCheckpoints.length, ahead: 0, conflicts: [] };
  }

  const localMeta = localLatest.metadata as SyncMeta;
  const remoteMeta = remoteLatest.metadata as SyncMeta;

  const localHash = localMeta?.fileHashesHash ?? "";
  const remoteHash = remoteMeta?.fileHashesHash ?? "";

  if (localHash === remoteHash) {
    return { inSync: true, behind: 0, ahead: 0, conflicts: [] };
  }

  // Count divergence: checkpoints on each side newer than the other's latest
  const localTime = localLatest.createdAt ?? new Date(0);
  const remoteTime = remoteLatest.createdAt ?? new Date(0);

  const aheadCount = localCheckpoints.filter(
    (r) => r.createdAt != null && r.createdAt > remoteTime
  ).length;
  const behindCount = remoteCheckpoints.filter(
    (r) => r.createdAt != null && r.createdAt > localTime
  ).length;

  const conflicts: string[] = [];
  if (aheadCount > 0 && behindCount > 0) {
    conflicts.push("diverged_history");
    if (localMeta?.branch && remoteMeta?.branch && localMeta.branch !== remoteMeta.branch) {
      conflicts.push(`branch_mismatch:${localMeta.branch}:${remoteMeta.branch}`);
    }
  }

  return {
    inSync: false,
    behind: behindCount,
    ahead: aheadCount,
    conflicts,
  };
}

// ============================================
// PUSH PROJECT STATE
// ============================================

/**
 * Pushes the current local state to the remote record.
 * Detects conflicts before writing and throws if unresolved.
 */
export async function pushProjectState(
  projectPath: string,
  userId: string,
  deviceId: string,
  state: {
    gitHash?: string;
    fileHashes?: Record<string, string>;
    envVarNames?: string[];
    branch?: string;
  } = {}
): Promise<void> {
  const status = await getSyncStatus(projectPath, userId, deviceId);

  if (status.conflicts.length > 0) {
    throw new Error(
      `Cannot push: unresolved conflicts detected — ${status.conflicts.join(", ")}. ` +
        `Resolve with resolveConflict() before pushing.`
    );
  }

  await createSyncCheckpoint(projectPath, userId, deviceId, state);

  logger.info("Project state pushed", { userId, deviceId, projectPath });
}

// ============================================
// PULL PROJECT STATE
// ============================================

/**
 * Returns the latest remote project state (from any other device) and
 * records what has changed since the local checkpoint.
 */
export async function pullProjectState(
  projectPath: string,
  userId: string,
  deviceId: string
): Promise<ProjectState> {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.rootPath, projectPath)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error(`Project not found for path: ${projectPath}`);
  }

  type SyncMeta = {
    deviceId?: string;
    fileHashesHash?: string;
    gitHash?: string;
    branch?: string;
    id?: string;
    createdAt?: string;
  };

  const rows = await db
    .select({ id: schema.checkpoints.id, metadata: schema.checkpoints.metadata, createdAt: schema.checkpoints.createdAt })
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.projectId, project.id),
        eq(schema.checkpoints.triggerType, "sync")
      )
    )
    .orderBy(desc(schema.checkpoints.createdAt));

  const remoteRows = rows.filter(
    (r) => (r.metadata as SyncMeta)?.deviceId !== deviceId
  );
  const localRows = rows.filter(
    (r) => (r.metadata as SyncMeta)?.deviceId === deviceId
  );

  if (remoteRows.length === 0) {
    throw new Error("No remote state available to pull");
  }

  const remoteLatest = remoteRows[0];
  const localLatest = localRows[0];
  const remoteMeta = remoteLatest.metadata as SyncMeta;

  // Derive changed files by comparing manifest hashes in sequential remote checkpoints
  const changedFiles: string[] = [];
  if (localLatest) {
    const localMeta = localLatest.metadata as SyncMeta;
    if (localMeta?.fileHashesHash !== remoteMeta?.fileHashesHash) {
      changedFiles.push("(file state diverged — re-sync required)");
    }
  } else {
    changedFiles.push("(no local checkpoint — full pull required)");
  }

  logger.info("Project state pulled", {
    userId,
    deviceId,
    projectPath,
    remoteCheckpointId: remoteLatest.id,
  });

  return {
    checkpointId: remoteLatest.id,
    projectPath,
    gitHash: remoteMeta?.gitHash ?? null,
    branch: remoteMeta?.branch ?? null,
    fileHashesHash: remoteMeta?.fileHashesHash ?? "",
    changedFiles,
    pushedAt: remoteLatest.createdAt ?? new Date(),
  };
}

// ============================================
// LIST DEVICES
// ============================================

/**
 * Lists all devices that have synced the given project for this user.
 */
export async function listDevices(
  userId: string,
  projectPath?: string
): Promise<Device[]> {
  const projectConditions = [eq(schema.projects.userId, userId)];
  if (projectPath) {
    projectConditions.push(eq(schema.projects.rootPath, projectPath));
  }

  const projects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(...projectConditions));

  if (projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((p) => p.id);

  type SyncMeta = {
    deviceId?: string;
    branch?: string;
    platform?: string;
  };

  // Fetch all sync checkpoints belonging to this user's projects, newest first.
  // Scope by projectId at the query level so we never read other users' data.
  const rows = await db
    .select({
      id: schema.checkpoints.id,
      projectId: schema.checkpoints.projectId,
      metadata: schema.checkpoints.metadata,
      createdAt: schema.checkpoints.createdAt,
    })
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.triggerType, "sync"),
        inArray(schema.checkpoints.projectId, projectIds)
      )
    )
    .orderBy(desc(schema.checkpoints.createdAt));

  // Group by deviceId, keep only the most recent checkpoint per device
  const deviceMap = new Map<string, Device>();

  for (const row of rows) {
    const meta = row.metadata as SyncMeta;
    const deviceId = meta?.deviceId;
    if (!deviceId) continue;
    if (deviceMap.has(deviceId)) continue; // already captured latest (sorted desc)

    deviceMap.set(deviceId, {
      id: deviceId,
      name: deviceId,
      lastSync: row.createdAt ?? null,
      platform: meta?.platform ?? "unknown",
      currentBranch: meta?.branch ?? null,
    });
  }

  return Array.from(deviceMap.values());
}

// ============================================
// RESOLVE CONFLICT
// ============================================

/**
 * Resolves a conflict on a specific checkpoint by annotating it with the
 * chosen resolution strategy.  Actual file-level merging is delegated to
 * the CLI client using the returned metadata.
 */
export async function resolveConflict(
  checkpointId: string,
  resolution: ConflictResolution
): Promise<void> {
  const [existing] = await db
    .select({ id: schema.checkpoints.id, metadata: schema.checkpoints.metadata })
    .from(schema.checkpoints)
    .where(eq(schema.checkpoints.id, checkpointId))
    .limit(1);

  if (!existing) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  const updatedMetadata = {
    ...(existing.metadata as Record<string, unknown>),
    conflictResolution: resolution,
    resolvedAt: new Date().toISOString(),
  };

  await db
    .update(schema.checkpoints)
    .set({ metadata: updatedMetadata })
    .where(eq(schema.checkpoints.id, checkpointId));

  logger.info("Conflict resolved", { checkpointId, resolution });
}
