import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { internalGet } from '@/lib/internalApi';

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

interface CheckpointDto {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string;
  triggerType: string | null;
  filesChanged: number;
  added: number;
  removed: number;
  files: { path: string; status?: string }[];
}

/**
 * GET /api/v1/sessions/:id/checkpoints
 * Lists the checkpoints for a project (`:id`), used by the time-travel, diff,
 * and replay views. Backed by the internal timeline endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.id;
  const limit = req.nextUrl.searchParams.get('limit') ?? '100';

  const timeline = await internalGet<TimelineResponse>('/timeline', {
    userId,
    project: projectId,
    type: 'checkpoint',
    limit,
  });

  if (!timeline.ok || !timeline.data) {
    return NextResponse.json(
      { error: timeline.error ?? 'Failed to load checkpoints' },
      { status: timeline.status },
    );
  }

  const checkpoints: CheckpointDto[] = timeline.data.events
    .filter((e) => e.checkpointId)
    .map((e) => ({
      id: e.checkpointId as string,
      name: e.description || null,
      description: e.triggerType ? `Trigger: ${e.triggerType}` : null,
      createdAt: e.timestamp,
      triggerType: e.triggerType ?? null,
      filesChanged: e.fileCount ?? 0,
      added: e.changes?.added ?? 0,
      removed: e.changes?.deleted ?? 0,
      files: [],
    }));

  return NextResponse.json({ success: true, checkpoints });
}
