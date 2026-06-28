import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { internalGet } from '@/lib/internalApi';

interface ContextResponse {
  checkpoint: {
    id: string;
    projectId: string;
    name: string | null;
    description: string | null;
    triggerType: string | null;
    createdAt: string | null;
  };
}

interface InternalProject {
  id: string;
  name: string;
  rootPath: string | null;
  checkpointCount: number;
}

interface InternalProjectsResponse {
  projects: InternalProject[];
}

/**
 * GET /api/v1/sessions/:id
 * Returns a single AITM "session" (checkpoint) enriched with its project
 * metadata, in the shape the restore confirmation page expects.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checkpointId = params.id;

  const context = await internalGet<ContextResponse>(`/context/${checkpointId}`, {
    messageLimit: '1',
    toolCallLimit: '1',
    contextLimit: '1',
  });
  if (!context.ok || !context.data) {
    return NextResponse.json(
      { error: context.error ?? 'Session not found' },
      { status: context.status },
    );
  }

  const cp = context.data.checkpoint;

  // Look up the owning project for its display name and path.
  const projectsResult = await internalGet<InternalProjectsResponse>('/projects', {
    userId,
    limit: '200',
  });
  const project =
    projectsResult.ok && projectsResult.data
      ? projectsResult.data.projects.find((p) => p.id === cp.projectId)
      : undefined;

  return NextResponse.json({
    id: cp.id,
    name: cp.name ?? 'Checkpoint',
    description:
      cp.description ?? (cp.triggerType ? `Trigger: ${cp.triggerType}` : 'AITM checkpoint'),
    createdAt: cp.createdAt ?? new Date().toISOString(),
    projectName: project?.name ?? 'Project',
    projectPath: project?.rootPath ?? '',
    filesChanged: project?.checkpointCount ?? 0,
    sizeBytes: 0,
  });
}
