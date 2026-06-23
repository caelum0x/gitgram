import { db, schema } from "../db/index.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface CheckpointSummary {
  id: string;
  name: string;
  description: string | null;
  triggerType: string | null;
  createdAt: string;
  filesChanged: string[];
}

export interface SessionExportItem {
  id: string;
  projectPath: string | null;
  projectId: string;
  tool: string;
  checkpoints: CheckpointSummary[];
  createdAt: string;
  duration: number | null;
  filesChanged: string[];
}

export interface SessionExport {
  exportedAt: string;
  userId: string;
  totalSessions: number;
  sessions: SessionExportItem[];
}

export interface ActivityReport {
  userId: string;
  period: { days: number; from: string; to: string };
  totalSessions: number;
  totalCheckpoints: number;
  totalFilesChanged: number;
  averageSessionDurationMs: number | null;
  sessionsPerDay: Record<string, number>;
  mostActiveTimes: { hour: number; count: number }[];
  topFilesChanged: { filePath: string; count: number }[];
  topProjects: { projectId: string; projectPath: string | null; sessions: number }[];
}

export interface GitExportResult {
  sessionId: string;
  commitMessage: string;
  diff: string;
  filesChanged: string[];
  checkpointCount: number;
}

// ============================================================================
// Internal helpers
// ============================================================================

type ChatSessionRow = typeof schema.chatSessions.$inferSelect;
type CheckpointRow = typeof schema.checkpoints.$inferSelect;
type CheckpointFileRow = typeof schema.checkpointFiles.$inferSelect;

interface SessionWithProject {
  session: ChatSessionRow;
  rootPath: string | null;
}

async function fetchUserSessionsWithProjects(
  userId: string,
  since?: Date
): Promise<SessionWithProject[]> {
  const conditions = [eq(schema.chatSessions.userId, userId)];
  if (since) {
    conditions.push(gte(schema.chatSessions.startedAt, since));
  }

  const rows = await db
    .select({
      session: schema.chatSessions,
      rootPath: schema.projects.rootPath,
    })
    .from(schema.chatSessions)
    .leftJoin(schema.projects, eq(schema.chatSessions.projectId, schema.projects.id))
    .where(and(...conditions))
    .orderBy(desc(schema.chatSessions.startedAt))
    .limit(500);

  return rows.map((r) => ({ session: r.session, rootPath: r.rootPath ?? null }));
}

async function fetchCheckpointsForSession(
  sessionId: string
): Promise<CheckpointRow[]> {
  // Checkpoints belong to projects; link them through checkpoint_id on messages
  // or by matching sessionId via toolCalls. We use the chatMessages relation.
  const messageRows = await db
    .select({ checkpointId: schema.chatMessages.checkpointId })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        sql`${schema.chatMessages.checkpointId} IS NOT NULL`
      )
    )
    .limit(200);

  const cpIds = [
    ...new Set(
      messageRows
        .map((r) => r.checkpointId)
        .filter((id): id is string => id !== null)
    ),
  ];

  if (cpIds.length === 0) return [];

  const checkpoints = await Promise.all(
    cpIds.map((id) =>
      db
        .select()
        .from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, id))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    )
  );

  return checkpoints.filter((cp): cp is CheckpointRow => cp !== null);
}

async function fetchFilesForCheckpoint(
  checkpointId: string
): Promise<CheckpointFileRow[]> {
  return db
    .select()
    .from(schema.checkpointFiles)
    .where(eq(schema.checkpointFiles.checkpointId, checkpointId));
}

function computeSessionDurationMs(
  session: ChatSessionRow
): number | null {
  if (!session.startedAt || !session.endedAt) return null;
  return new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
}

async function buildSessionExportItem(
  sw: SessionWithProject
): Promise<SessionExportItem> {
  const { session, rootPath } = sw;

  const checkpointRows = await fetchCheckpointsForSession(session.id);
  const allFiles = new Set<string>();

  const checkpointSummaries: CheckpointSummary[] = await Promise.all(
    checkpointRows.map(async (cp) => {
      const files = await fetchFilesForCheckpoint(cp.id);
      const changed = files
        .filter((f) => f.changeType !== "unchanged")
        .map((f) => f.filePath);
      changed.forEach((f) => allFiles.add(f));
      return {
        id: cp.id,
        name: cp.name,
        description: cp.description ?? null,
        triggerType: cp.triggerType ?? null,
        createdAt: cp.createdAt?.toISOString() ?? new Date().toISOString(),
        filesChanged: changed,
      };
    })
  );

  return {
    id: session.id,
    projectPath: rootPath,
    projectId: session.projectId,
    tool: session.tool,
    checkpoints: checkpointSummaries,
    createdAt: session.startedAt?.toISOString() ?? new Date().toISOString(),
    duration: computeSessionDurationMs(session),
    filesChanged: Array.from(allFiles),
  };
}

// ============================================================================
// Public service functions
// ============================================================================

/**
 * Returns all of a user's chat sessions in a structured JSON format,
 * including checkpoints and the files changed in each.
 */
export async function exportSessionsAsJSON(userId: string): Promise<SessionExport> {
  const sessionRows = await fetchUserSessionsWithProjects(userId);
  const sessions = await Promise.all(sessionRows.map(buildSessionExportItem));

  return {
    exportedAt: new Date().toISOString(),
    userId,
    totalSessions: sessions.length,
    sessions,
  };
}

/**
 * Returns a Markdown changelog grouped by date, one section per session.
 */
export async function exportSessionsAsMarkdown(userId: string): Promise<string> {
  const { sessions } = await exportSessionsAsJSON(userId);

  // Group by calendar date (UTC)
  const byDate = new Map<string, SessionExportItem[]>();
  for (const s of sessions) {
    const day = s.createdAt.slice(0, 10); // YYYY-MM-DD
    const group = byDate.get(day) ?? [];
    group.push(s);
    byDate.set(day, group);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  const lines: string[] = ["# AITM Session Export\n"];

  for (const date of sortedDates) {
    const label = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    lines.push(`## ${label}\n`);

    for (const session of byDate.get(date)!) {
      const durationStr =
        session.duration !== null
          ? `${Math.round(session.duration / 60000)} min`
          : "unknown duration";
      const projectLabel = session.projectPath ?? session.projectId;

      lines.push(`### Session ${session.id}`);
      lines.push(`- **Project**: \`${projectLabel}\``);
      lines.push(`- **Tool**: ${session.tool}`);
      lines.push(`- **Duration**: ${durationStr}`);
      lines.push(`- **Checkpoints**: ${session.checkpoints.length}`);

      if (session.filesChanged.length > 0) {
        lines.push(`- **Modified**:`);
        for (const f of session.filesChanged.slice(0, 20)) {
          lines.push(`  - \`${f}\``);
        }
        if (session.filesChanged.length > 20) {
          lines.push(
            `  - _...and ${session.filesChanged.length - 20} more files_`
          );
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Returns sessions formatted as a CSV string.
 * Columns: sessionId, date, duration, projectPath, filesChanged, checkpoints
 */
export async function exportSessionsAsCSV(userId: string): Promise<string> {
  const { sessions } = await exportSessionsAsJSON(userId);

  const escapeField = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const header = "sessionId,date,durationMs,projectPath,filesChanged,checkpoints";
  const rows = sessions.map((s) => {
    const fields = [
      s.id,
      s.createdAt,
      s.duration !== null ? String(s.duration) : "",
      s.projectPath ?? "",
      String(s.filesChanged.length),
      String(s.checkpoints.length),
    ];
    return fields.map(escapeField).join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Generates an activity report for a user over the last `days` days.
 */
export async function generateActivityReport(
  userId: string,
  days: number
): Promise<ActivityReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sessionRows = await fetchUserSessionsWithProjects(userId, since);

  const sessionsPerDay: Record<string, number> = {};
  const hourCounts: number[] = Array(24).fill(0) as number[];
  const fileCountMap = new Map<string, number>();
  const projectMap = new Map<string, { rootPath: string | null; sessions: number }>();
  let totalDurationMs = 0;
  let durationCount = 0;
  let totalCheckpoints = 0;
  let totalFilesChanged = 0;

  for (const { session, rootPath } of sessionRows) {
    const ts = session.startedAt ?? new Date();
    const day = ts.toISOString().slice(0, 10);
    sessionsPerDay[day] = (sessionsPerDay[day] ?? 0) + 1;
    hourCounts[ts.getHours()]++;

    const dur = computeSessionDurationMs(session);
    if (dur !== null) {
      totalDurationMs += dur;
      durationCount++;
    }

    const existing = projectMap.get(session.projectId);
    projectMap.set(session.projectId, {
      rootPath: rootPath ?? null,
      sessions: (existing?.sessions ?? 0) + 1,
    });

    const cps = await fetchCheckpointsForSession(session.id);
    totalCheckpoints += cps.length;

    for (const cp of cps) {
      const files = await fetchFilesForCheckpoint(cp.id);
      const changed = files.filter((f) => f.changeType !== "unchanged");
      totalFilesChanged += changed.length;
      for (const f of changed) {
        fileCountMap.set(f.filePath, (fileCountMap.get(f.filePath) ?? 0) + 1);
      }
    }
  }

  const mostActiveTimes = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topFilesChanged = Array.from(fileCountMap.entries())
    .map(([filePath, count]) => ({ filePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topProjects = Array.from(projectMap.entries())
    .map(([projectId, data]) => ({
      projectId,
      projectPath: data.rootPath,
      sessions: data.sessions,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  return {
    userId,
    period: { days, from: since.toISOString(), to: new Date().toISOString() },
    totalSessions: sessionRows.length,
    totalCheckpoints,
    totalFilesChanged,
    averageSessionDurationMs:
      durationCount > 0 ? Math.round(totalDurationMs / durationCount) : null,
    sessionsPerDay,
    mostActiveTimes,
    topFilesChanged,
    topProjects,
  };
}

/**
 * Creates a git-compatible export for a single session, showing what changed
 * across all checkpoints within it.
 */
export async function exportToGitHistory(
  sessionId: string
): Promise<GitExportResult> {
  const sessionRows = await db
    .select({ session: schema.chatSessions, rootPath: schema.projects.rootPath })
    .from(schema.chatSessions)
    .leftJoin(schema.projects, eq(schema.chatSessions.projectId, schema.projects.id))
    .where(eq(schema.chatSessions.id, sessionId))
    .limit(1);

  if (sessionRows.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { session, rootPath } = sessionRows[0];
  const checkpoints = await fetchCheckpointsForSession(sessionId);

  const allFilesSet = new Set<string>();
  const diffParts: string[] = [];

  for (const cp of checkpoints) {
    const files = await fetchFilesForCheckpoint(cp.id);
    const changed = files.filter((f) => f.changeType !== "unchanged");

    for (const f of changed) {
      allFilesSet.add(f.filePath);
    }

    if (changed.length > 0) {
      diffParts.push(`# Checkpoint: ${cp.name} (${cp.id})`);
      diffParts.push(`# Trigger: ${cp.triggerType ?? "manual"}`);
      diffParts.push(`# Time: ${cp.createdAt?.toISOString() ?? ""}`);

      for (const f of changed) {
        diffParts.push(`diff --git a/${f.filePath} b/${f.filePath}`);
        diffParts.push(`--- a/${f.filePath}`);
        diffParts.push(`+++ b/${f.filePath}`);
        diffParts.push(`# change_type: ${f.changeType}`);
        if (f.blobHash) {
          diffParts.push(`# blob_hash: ${f.blobHash}`);
        }
      }
      diffParts.push("");
    }
  }

  const projectLabel = rootPath ?? session.projectId;
  const filesSummary =
    allFilesSet.size <= 5
      ? Array.from(allFilesSet).join(", ")
      : `${Array.from(allFilesSet).slice(0, 5).join(", ")} and ${allFilesSet.size - 5} more`;

  const commitMessage =
    `AI session ${sessionId.slice(0, 8)}: ${checkpoints.length} checkpoint(s) in ${projectLabel}\n\n` +
    `Tool: ${session.tool}\n` +
    `Files changed: ${filesSummary}\n` +
    `Session started: ${session.startedAt?.toISOString() ?? "unknown"}`;

  return {
    sessionId,
    commitMessage,
    diff: diffParts.join("\n"),
    filesChanged: Array.from(allFilesSet),
    checkpointCount: checkpoints.length,
  };
}
