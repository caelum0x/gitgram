import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { internalPost } from '@/lib/internalApi';

interface PreviewFile {
  filePath: string;
  diffContent: string | null;
  stats: { added?: number; removed?: number; modified?: number; status?: string } | null;
}

interface PreviewResponse {
  success: boolean;
  fromCheckpointId: string;
  toCheckpointId: string;
  fileCount: number;
  summary: { added: number; removed: number; modified: number };
  files: PreviewFile[];
}

type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed';

function deriveStatus(
  stats: PreviewFile['stats'],
): FileStatus {
  const status = stats?.status;
  if (status === 'added' || status === 'deleted' || status === 'renamed') {
    return status;
  }
  const added = stats?.added ?? 0;
  const removed = stats?.removed ?? 0;
  if (added > 0 && removed === 0) return 'added';
  if (removed > 0 && added === 0) return 'deleted';
  return 'modified';
}

/**
 * GET /api/v1/sessions/:id/diff?from=&to=
 * Returns the diff between two checkpoints of a project, mapped from the
 * internal time-preview endpoint into the diff viewer's expected shape.
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
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Both "from" and "to" checkpoint ids are required' },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json(
      { error: '"from" and "to" must be different checkpoints' },
      { status: 400 },
    );
  }

  const preview = await internalPost<PreviewResponse>('/time/preview', {
    userId,
    projectId,
    fromCheckpointId: from,
    toCheckpointId: to,
    scopeType: 'project',
    limit: 500,
  });

  if (!preview.ok || !preview.data) {
    return NextResponse.json(
      { error: preview.error ?? 'Failed to load diff' },
      { status: preview.status },
    );
  }

  const data = preview.data;
  const files = data.files.map((f) => ({
    filePath: f.filePath,
    status: deriveStatus(f.stats),
    added: f.stats?.added ?? 0,
    removed: f.stats?.removed ?? 0,
    diffContent: f.diffContent,
  }));

  return NextResponse.json({
    success: true,
    fromCheckpointId: data.fromCheckpointId,
    toCheckpointId: data.toCheckpointId,
    filesChanged: data.fileCount,
    totalAdded: data.summary?.added ?? 0,
    totalRemoved: data.summary?.removed ?? 0,
    files,
  });
}
