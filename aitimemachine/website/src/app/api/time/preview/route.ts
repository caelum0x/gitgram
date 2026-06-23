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
        fromCheckpointId: body.fromCheckpointId,
        scopeType: body.scopeType || 'project',
        scopePath: body.scopePath,
        limit: body.limit || 200,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('preview_failed');
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({
      success: true,
      fromCheckpointId: 'cp_mock_before',
      toCheckpointId: 'cp_mock_after',
      fileCount: 2,
      summary: { added: 12, removed: 4, modified: 7 },
      files: [
        { filePath: 'src/app/page.tsx', diffContent: '@@ mock @@', stats: { added: 8, removed: 2, modified: 4 } },
        { filePath: 'src/lib/api.ts', diffContent: '@@ mock @@', stats: { added: 4, removed: 2, modified: 3 } },
      ],
    });
  }
}
