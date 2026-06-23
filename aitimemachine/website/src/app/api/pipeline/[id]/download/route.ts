import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${API_URL}/api/internal/pipeline/${encodeURIComponent(params.id)}/download?userId=${encodeURIComponent(userId)}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
        cache: 'no-store',
        redirect: 'manual',
      }
    );

    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400) {
      return NextResponse.redirect(location);
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Failed to download pipeline output' }));
      return NextResponse.json(data, { status: response.status });
    }

    const body = await response.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/x-ndjson',
        'Content-Disposition':
          response.headers.get('content-disposition') ||
          `attachment; filename="aitm-pipeline-${params.id}.jsonl"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to download pipeline output' }, { status: 500 });
  }
}
