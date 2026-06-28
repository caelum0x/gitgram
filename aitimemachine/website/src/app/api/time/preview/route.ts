import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { toCheckpointId?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.toCheckpointId !== 'string' || body.toCheckpointId.length === 0) {
    return NextResponse.json(
      { error: 'toCheckpointId is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/time/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        projectId: body.projectId,
        toCheckpointId: body.toCheckpointId,
        fromCheckpointId: (body as { fromCheckpointId?: unknown }).fromCheckpointId,
        scopeType: (body as { scopeType?: unknown }).scopeType || 'project',
        scopePath: (body as { scopePath?: unknown }).scopePath,
        limit: (body as { limit?: unknown }).limit || 200,
      }),
      cache: 'no-store',
    });

    // Propagate the backend's real status and error payload so the UI can
    // distinguish a genuine failure from a successful preview.
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        data ?? { error: 'Failed to generate restore preview' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Restore preview service is unavailable' },
      { status: 502 }
    );
  }
}
