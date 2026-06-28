import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalGet, internalPost } from '@/lib/internalApi';

const bodySchema = z.object({
  sessionId: z.string().min(1),
  createBackup: z.boolean().optional().default(true),
});

interface ContextResponse {
  checkpoint: { id: string; projectId: string };
}

interface RestoreResponse {
  success: boolean;
  restoreEventId: string;
  restoredCount: number;
}

/**
 * POST /api/v1/sessions/restore
 * Restores a project to the given checkpoint (`sessionId`). Restore is
 * destructive, so this route NEVER reports success unless the backend
 * confirms it — backend failures and outages are propagated verbatim.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid restore request' },
      { status: 400 },
    );
  }

  const checkpointId = parsed.data.sessionId;

  // Resolve the owning project for this checkpoint (also enforces ownership).
  const context = await internalGet<ContextResponse>(`/context/${checkpointId}`, {
    messageLimit: '1',
    toolCallLimit: '1',
    contextLimit: '1',
  });
  if (!context.ok || !context.data) {
    return NextResponse.json(
      { error: context.error ?? 'Checkpoint not found' },
      { status: context.status },
    );
  }

  const restore = await internalPost<RestoreResponse>('/time/restore', {
    userId,
    projectId: context.data.checkpoint.projectId,
    checkpointId,
    scopeType: 'project',
    includeContext: true,
    messageLimit: 50,
    source: 'website_restore',
    reason: parsed.data.createBackup
      ? 'User-initiated restore (backup requested)'
      : 'User-initiated restore',
  });

  if (!restore.ok || !restore.data) {
    return NextResponse.json(
      { error: restore.error ?? 'Failed to restore checkpoint' },
      { status: restore.status },
    );
  }

  return NextResponse.json({
    success: true,
    sessionId: checkpointId,
    restoreEventId: restore.data.restoreEventId,
    restoredCount: restore.data.restoredCount,
  });
}
