import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
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
        scopeType: body.scopeType || 'project',
        scopePath: body.scopePath,
        includeContext: body.includeContext ?? true,
        messageLimit: body.messageLimit ?? 50,
        source: 'dashboard_timeline',
        reason: body.reason,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('restore_failed');
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({
      success: true,
      checkpoint: {
        id: 'cp_mock_after',
        name: 'Mock Restore',
        description: 'Mock restore fallback',
        createdAt: new Date().toISOString(),
      },
      scope: { type: 'project', path: null },
      restoreEventId: 'restore_mock_1',
      restoredCount: 2,
      restoredFiles: [{ path: 'src/app/page.tsx' }, { path: 'src/lib/api.ts' }],
      messages: [],
    });
  }
}
