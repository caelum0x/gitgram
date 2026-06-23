/**
 * Data Capture Pipeline Service
 *
 * Aggregates captured sessions, chats, and code changes into
 * training-ready datasets. Supports scheduled exports and
 * webhook notifications when datasets are ready.
 */

import { db, schema } from "../db/index.js";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { persistKnowledgeArtifact } from "./knowledgeBase.js";

// Pipeline job status
type PipelineStatus = "pending" | "collecting" | "processing" | "exporting" | "completed" | "failed";

interface PipelineJob {
  id: string;
  userId: string;
  status: PipelineStatus;
  config: PipelineConfig;
  progress: number;
  stats: PipelineStats;
  result?: PipelineResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PipelineConfig {
  // What to capture
  includeChats: boolean;
  includeCodeChanges: boolean;
  includeTerminalCommands: boolean;
  includeCheckpoints: boolean;

  // Filters
  projectIds?: string[];
  since?: string;
  until?: string;
  minConversationTurns?: number;

  // Output
  format: "openai" | "anthropic" | "generic" | "raw";
  redactSecrets: boolean;

  // Scheduling
  schedule?: "daily" | "weekly" | "monthly" | null;
  webhookUrl?: string;

  // Delivery
  destination?: "s3";
  s3Bucket?: string;
  s3Prefix?: string;
}

interface PipelineStats {
  eventsCollected: number;
  conversationsFound: number;
  codeChangesFound: number;
  filesProcessed: number;
  bytesGenerated: number;
}

interface PipelineResult {
  downloadUrl: string;
  format: string;
  recordCount: number;
  sizeBytes: number;
  generatedAt: string;
  s3Url?: string;
  s3Bucket?: string;
  s3Key?: string;
}

// Extended job type with output data attached for in-memory download
interface PipelineJobWithOutput extends PipelineJob {
  _outputData?: string;
}

// Represents a row from the events table
type EventRow = typeof schema.events.$inferSelect;

// In-memory job tracking (source of truth for active jobs)
const pipelineJobs = new Map<string, PipelineJob>();

// Scheduled jobs per user
const scheduledJobs = new Map<string, NodeJS.Timeout>();

// S3 client (lazy init)
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return s3Client;
}

function defaultStats(): PipelineStats {
  return {
    eventsCollected: 0,
    conversationsFound: 0,
    codeChangesFound: 0,
    filesProcessed: 0,
    bytesGenerated: 0,
  };
}

async function persistPipelineJob(job: PipelineJob): Promise<void> {
  try {
    await db.insert(schema.jobs).values({
      id: job.id,
      userId: job.userId,
      type: "pipeline",
      status: job.status,
      params: job.config,
      result: { stats: job.stats, result: job.result ?? null },
      progress: job.progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch {
    // Best-effort persistence
  }
}

async function updatePipelineJob(
  job: PipelineJob,
  options: { completedAt?: Date } = {}
): Promise<void> {
  try {
    await db
      .update(schema.jobs)
      .set({
        status: job.status,
        progress: job.progress,
        result: { stats: job.stats, result: job.result ?? null },
        error: job.error,
        updatedAt: job.updatedAt,
        completedAt: options.completedAt ?? undefined,
      })
      .where(eq(schema.jobs.id, job.id));
  } catch {
    // Best-effort persistence
  }
}

async function getPipelineJobFromDb(jobId: string): Promise<PipelineJob | undefined> {
  try {
    const [row] = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.type, "pipeline")))
      .limit(1);

    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId,
      status: (row.status as PipelineStatus) || "pending",
      config: (row.params as PipelineConfig) || {
        includeChats: true,
        includeCodeChanges: true,
        includeTerminalCommands: true,
        includeCheckpoints: true,
        format: "generic",
        redactSecrets: true,
      },
      progress: row.progress || 0,
      stats: ((row.result as Record<string, unknown> | null)?.stats as PipelineStats) || defaultStats(),
      result: ((row.result as Record<string, unknown> | null)?.result as PipelineResult | undefined) || undefined,
      error: row.error || undefined,
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || row.createdAt || new Date(),
    };
  } catch {
    return undefined;
  }
}

async function listPipelineJobsFromDb(userId: string): Promise<PipelineJob[]> {
  try {
    const rows = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.type, "pipeline")))
      .orderBy(desc(schema.jobs.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      status: (row.status as PipelineStatus) || "pending",
      config: (row.params as PipelineConfig) || {
        includeChats: true,
        includeCodeChanges: true,
        includeTerminalCommands: true,
        includeCheckpoints: true,
        format: "generic",
        redactSecrets: true,
      },
      progress: row.progress || 0,
      stats: ((row.result as Record<string, unknown> | null)?.stats as PipelineStats) || defaultStats(),
      result: ((row.result as Record<string, unknown> | null)?.result as PipelineResult | undefined) || undefined,
      error: row.error || undefined,
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || row.createdAt || new Date(),
    }));
  } catch {
    return [];
  }
}

/**
 * Upload pipeline output to S3
 */
export async function uploadToS3(
  data: string,
  options: { bucket: string; prefix?: string; jobId: string; format: string }
): Promise<{ bucket: string; key: string; url: string }> {
  const client = getS3Client();
  const key = `${options.prefix || "exports"}/${options.jobId}.${options.format === "raw" ? "jsonl" : "jsonl"}`;

  await client.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: key,
      Body: data,
      ContentType: "application/x-ndjson",
    })
  );

  return {
    bucket: options.bucket,
    key,
    url: `s3://${options.bucket}/${key}`,
  };
}

/**
 * Create and run a pipeline job
 */
export async function createPipelineJob(userId: string, config: PipelineConfig): Promise<PipelineJob> {
  const job: PipelineJob = {
    id: `pipeline_${crypto.randomBytes(8).toString("hex")}`,
    userId,
    status: "pending",
    config,
    progress: 0,
    stats: {
      eventsCollected: 0,
      conversationsFound: 0,
      codeChangesFound: 0,
      filesProcessed: 0,
      bytesGenerated: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  pipelineJobs.set(job.id, job);
  await persistPipelineJob(job);

  // Run async
  setImmediate(() => runPipeline(job));

  return job;
}

/**
 * Execute the pipeline
 */
async function runPipeline(job: PipelineJob): Promise<void> {
  try {
    // Phase 1: Collect events
    job.status = "collecting";
    job.progress = 10;
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    const events = await collectEvents(job.userId, job.config);
    job.stats.eventsCollected = events.length;
    job.progress = 30;
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    // Phase 2: Process into conversations
    job.status = "processing";
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    const conversations = groupIntoConversations(events, job.config.minConversationTurns || 2);
    job.stats.conversationsFound = conversations.length;
    job.progress = 50;
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    // Phase 3: Extract code changes
    const codeChanges = events.filter(e =>
      e.eventType === "fs.change_batch" || e.eventType === "checkpoint.created"
    );
    job.stats.codeChangesFound = codeChanges.length;
    job.progress = 60;
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    // Phase 4: Format output
    job.status = "exporting";
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    const output = formatOutput(conversations, codeChanges, job.config);
    job.stats.bytesGenerated = output.length;
    job.stats.filesProcessed = conversations.length + codeChanges.length;
    job.progress = 90;
    job.updatedAt = new Date();
    await updatePipelineJob(job);

    // Phase 5: Store result
    job.result = {
      downloadUrl: `/v1/pipeline/${job.id}/download`,
      format: job.config.format,
      recordCount: conversations.length,
      sizeBytes: output.length,
      generatedAt: new Date().toISOString(),
    };

    // Store output data on the job for download
    (job as PipelineJobWithOutput)._outputData = output;

    // Upload to S3 if destination is configured
    if (job.config.destination === "s3" && job.config.s3Bucket) {
      const s3Result = await uploadToS3(output, {
        bucket: job.config.s3Bucket,
        prefix: job.config.s3Prefix,
        jobId: job.id,
        format: job.config.format,
      });
      job.result = {
        ...job.result!,
        s3Url: s3Result.url,
        s3Bucket: s3Result.bucket,
        s3Key: s3Result.key,
      };
    }

    try {
      const projectId =
        job.config.projectIds && job.config.projectIds.length === 1
          ? job.config.projectIds[0]
          : null;
      await persistKnowledgeArtifact({
        id: `kb_${job.id}`,
        userId: job.userId,
        projectId,
        jobId: job.id,
        type: "pipeline",
        format: job.config.format,
        content: job.config.destination === "s3" ? null : output,
        stats: job.stats as unknown as Record<string, unknown>,
        storage: job.config.destination === "s3" ? "s3" : "db",
        s3: job.result?.s3Bucket
          ? { bucket: job.result.s3Bucket, key: job.result.s3Key || "", url: job.result.s3Url }
          : null,
      });
    } catch {
      // Best-effort persistence
    }

    job.status = "completed";
    job.progress = 100;
    job.updatedAt = new Date();
    await updatePipelineJob(job, { completedAt: new Date() });

    // Notify webhook if configured
    if (job.config.webhookUrl) {
      try {
        await fetch(job.config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "pipeline.completed",
            job_id: job.id,
            stats: job.stats,
            download_url: job.result!.downloadUrl,
          }),
        });
      } catch { /* webhook failures are non-fatal */ }
    }
  } catch (err) {
    job.status = "failed";
    job.error = (err as Error).message;
    job.updatedAt = new Date();
    await updatePipelineJob(job, { completedAt: new Date() });
  }
}

/**
 * Collect events from database
 */
async function collectEvents(userId: string, config: PipelineConfig): Promise<EventRow[]> {
  // Get user's projects
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  const projectIds = config.projectIds || projects.map((p) => p.id);
  const allEvents: EventRow[] = [];

  for (const projectId of projectIds) {
    try {
      const query = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.projectId, projectId))
        .orderBy(desc(schema.events.timestamp))
        .limit(10000);

      const events = await query;
      allEvents.push(...events);
    } catch {
      // Project may not have events table - skip
    }
  }

  // Filter by time range
  return allEvents.filter(e => {
    const ts = new Date(e.timestamp!).getTime();
    if (config.since && ts < new Date(config.since).getTime()) return false;
    if (config.until && ts > new Date(config.until).getTime()) return false;
    return true;
  });
}

/**
 * Group events into conversations
 */
function groupIntoConversations(events: EventRow[], minTurns: number): EventRow[][] {
  const chatEvents = events
    .filter(e => e.eventType === "chat.message")
    .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

  const conversations: EventRow[][] = [];
  let current: EventRow[] = [];
  let lastTimestamp = 0;
  const GAP_MS = 30 * 60 * 1000; // 30 min gap = new conversation

  for (const event of chatEvents) {
    const ts = new Date(event.timestamp!).getTime();
    if (current.length > 0 && ts - lastTimestamp > GAP_MS) {
      if (current.length >= minTurns) {
        conversations.push(current);
      }
      current = [];
    }
    current.push(event);
    lastTimestamp = ts;
  }

  if (current.length >= minTurns) {
    conversations.push(current);
  }

  return conversations;
}

/**
 * Secret redaction patterns
 */
const SECRET_PATTERNS = [
  /(?:sk|pk|api)[_-](?:live|test|prod)?[_-]?[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /AKIA[A-Z0-9]{16}/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /(?:password|secret|token|key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
];

function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Format output based on target format
 */
function formatOutput(conversations: EventRow[][], codeChanges: EventRow[], config: PipelineConfig): string {
  const lines: string[] = [];

  for (const conv of conversations) {
    const messages = conv.map(e => {
      const payload = e.payload as Record<string, unknown> | string | null;
      let content = typeof payload === "string" ? payload : ((payload as Record<string, unknown> | null)?.content as string || JSON.stringify(payload));
      if (config.redactSecrets) content = redactSecrets(content);

      return {
        role: (typeof payload === "object" && payload !== null ? (payload.role as string) : undefined) || "user",
        content,
        timestamp: e.timestamp,
      };
    });

    switch (config.format) {
      case "openai":
        lines.push(JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }));
        break;

      case "anthropic":
        lines.push(JSON.stringify({
          system: "AI coding assistant conversation",
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }));
        break;

      case "generic":
        lines.push(JSON.stringify({
          conversation: messages,
          metadata: {
            turns: messages.length,
            start: messages[0]?.timestamp,
            end: messages[messages.length - 1]?.timestamp,
          },
        }));
        break;

      case "raw":
        lines.push(JSON.stringify({
          type: "conversation",
          events: conv.map(e => ({
            type: e.eventType,
            payload: config.redactSecrets ? redactSecrets(JSON.stringify(e.payload)) : e.payload,
            timestamp: e.timestamp,
          })),
        }));
        break;
    }
  }

  // Include code changes if configured
  if (config.includeCodeChanges) {
    for (const change of codeChanges) {
      let payload: unknown = change.payload;
      if (config.redactSecrets && typeof payload === "string") {
        payload = redactSecrets(payload);
      }
      lines.push(JSON.stringify({
        type: "code_change",
        event_type: change.eventType,
        payload,
        timestamp: change.timestamp,
      }));
    }
  }

  return lines.join("\n");
}

/**
 * Get a pipeline job by ID
 */
export async function getPipelineJob(jobId: string): Promise<PipelineJob | undefined> {
  const inMemory = pipelineJobs.get(jobId);
  if (inMemory) return inMemory;

  return await getPipelineJobFromDb(jobId);
}

/**
 * List pipeline jobs for a user
 */
export async function listPipelineJobs(userId: string): Promise<PipelineJob[]> {
  const dbJobs = await listPipelineJobsFromDb(userId);
  const inMemoryJobs = Array.from(pipelineJobs.values()).filter(j => j.userId === userId);

  const merged = new Map<string, PipelineJob>();
  for (const job of dbJobs) merged.set(job.id, job);
  for (const job of inMemoryJobs) merged.set(job.id, job);

  return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get download data for a completed job
 */
export async function getPipelineDownload(
  jobId: string
): Promise<{ data?: string; s3Url?: string; s3Bucket?: string; s3Key?: string } | null> {
  const job = await getPipelineJob(jobId);
  if (!job || job.status !== "completed") return null;

  const inMemoryJob = pipelineJobs.get(jobId) as PipelineJobWithOutput | undefined;
  if (inMemoryJob?._outputData) return { data: inMemoryJob._outputData };

  if (job.result?.s3Url) {
    return {
      s3Url: job.result.s3Url,
      s3Bucket: job.result.s3Bucket,
      s3Key: job.result.s3Key,
    };
  }

  return null;
}

/**
 * Schedule recurring pipeline jobs
 */
export function schedulePipeline(userId: string, config: PipelineConfig): string {
  const scheduleId = `sched_${crypto.randomBytes(8).toString("hex")}`;

  const intervalMs = config.schedule === "daily" ? 86400000
    : config.schedule === "weekly" ? 604800000
    : config.schedule === "monthly" ? 2592000000
    : 0;

  if (intervalMs === 0) return scheduleId;

  // Cancel existing schedule for this user
  const existing = scheduledJobs.get(userId);
  if (existing) clearInterval(existing);

  const timer = setInterval(() => {
    createPipelineJob(userId, { ...config, schedule: null });
  }, intervalMs);

  scheduledJobs.set(userId, timer);
  return scheduleId;
}

/**
 * Cancel scheduled pipeline
 */
export function cancelSchedule(userId: string): boolean {
  const timer = scheduledJobs.get(userId);
  if (timer) {
    clearInterval(timer);
    scheduledJobs.delete(userId);
    return true;
  }
  return false;
}
