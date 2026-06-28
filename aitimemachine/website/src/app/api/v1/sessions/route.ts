import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { internalGet } from '@/lib/internalApi';

interface InternalProject {
  id: string;
  name: string;
  rootPath: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string | null;
  checkpointCount: number;
  lastCheckpointAt: string | null;
}

interface InternalProjectsResponse {
  projects: InternalProject[];
}

interface TimelineEvent {
  id: string;
  type: string;
  checkpointId: string | null;
  description: string;
  timestamp: string;
  triggerType?: string | null;
  fileCount?: number | null;
  changes?: { added: number; deleted: number; modified: number } | null;
}

interface TimelineResponse {
  events: TimelineEvent[];
}

/**
 * A "session" entry. The restore wizard reads name/description/sizeBytes; the
 * time-travel page reads projectName/projectPath. We populate both field sets
 * so a single response satisfies every consumer.
 *
 * `sizeBytes` is `null` when no real per-checkpoint byte size is available from
 * the backend. We deliberately do NOT fabricate or estimate a size here — the
 * restore wizard renders "Size unavailable" instead of a misleading figure.
 */
interface SessionDto {
  id: string;
  name: string;
  description: string;
  projectName: string;
  projectPath: string;
  createdAt: string;
  filesChanged: number;
  sizeBytes: number | null;
}

async function listProjectsAsSessions(
  userId: string,
  limit: string,
): Promise<NextResponse> {
  const result = await internalGet<InternalProjectsResponse>('/projects', {
    userId,
    limit,
  });
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to load sessions' },
      { status: result.status },
    );
  }
  const sessions: SessionDto[] = result.data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.rootPath ?? '',
    projectName: p.name,
    projectPath: p.rootPath ?? '',
    createdAt: p.createdAt ?? new Date().toISOString(),
    filesChanged: p.checkpointCount,
    // Project-level total byte size is not tracked; report it as unknown
    // rather than zero (which reads as an empty project).
    sizeBytes: null,
  }));
  return NextResponse.json({ sessions, total: sessions.length, success: true });
}

async function listCheckpointsAsSessions(
  userId: string,
  projectPath: string,
): Promise<NextResponse> {
  // Resolve the project by path so we can scope the timeline to its id.
  const projectsResult = await internalGet<InternalProjectsResponse>('/projects', {
    userId,
    path: projectPath,
  });
  if (!projectsResult.ok || !projectsResult.data) {
    return NextResponse.json(
      { error: projectsResult.error ?? 'Failed to load checkpoints' },
      { status: projectsResult.status },
    );
  }
  const project = projectsResult.data.projects[0];
  if (!project) {
    return NextResponse.json({ sessions: [], total: 0, success: true });
  }

  const timeline = await internalGet<TimelineResponse>('/timeline', {
    userId,
    project: project.id,
    type: 'checkpoint',
    limit: '200',
  });
  if (!timeline.ok || !timeline.data) {
    return NextResponse.json(
      { error: timeline.error ?? 'Failed to load checkpoints' },
      { status: timeline.status },
    );
  }

  const sessions: SessionDto[] = timeline.data.events
    .filter((e) => e.checkpointId)
    .map((e) => {
      const fileCount = e.fileCount ?? 0;
      // The backend persists real per-file byte sizes (checkpoint_files.size)
      // but does not yet expose an aggregate per checkpoint through the
      // internal timeline. Until it does, report size as unknown (null) instead
      // of a fabricated estimate.
      return {
        id: e.checkpointId as string,
        name: e.description || 'Checkpoint',
        description: e.triggerType ? `Trigger: ${e.triggerType}` : 'AITM checkpoint',
        projectName: project.name,
        projectPath: project.rootPath ?? '',
        createdAt: e.timestamp,
        filesChanged: fileCount,
        sizeBytes: null,
      };
    });

  return NextResponse.json({ sessions, total: sessions.length, success: true });
}

/**
 * GET /api/v1/sessions
 * - `?projectPath=` -> restore wizard: list a project's checkpoints.
 * - otherwise       -> time-travel: list the user's projects (sessions).
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const projectPath = sp.get('projectPath');
  if (projectPath) {
    return listCheckpointsAsSessions(userId, projectPath);
  }

  const limit = sp.get('limit') ?? '50';
  return listProjectsAsSessions(userId, limit);
}
