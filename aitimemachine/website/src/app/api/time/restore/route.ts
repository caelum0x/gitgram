import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { checkpointId?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.checkpointId !== 'string' || body.checkpointId.length === 0) {
    return NextResponse.json(
      { error: 'checkpointId is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/time/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        projectId: body.projectId,
        checkpointId: body.checkpointId,
        scopeType: (body as { scopeType?: unknown }).scopeType || 'project',
        scopePath: (body as { scopePath?: unknown }).scopePath,
        includeContext: (body as { includeContext?: unknown }).includeContext ?? true,
        messageLimit: (body as { messageLimit?: unknown }).messageLimit ?? 50,
        source: 'dashboard_timeline',
        reason: (body as { reason?: unknown }).reason,
      }),
      cache: 'no-store',
    });

    // A restore is destructive: never report success when the backend failed.
    // Propagate the real status and error so the UI surfaces the failure.
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        data ?? { error: 'Failed to restore checkpoint' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Restore service is unavailable' },
      { status: 502 }
    );
  }
}
