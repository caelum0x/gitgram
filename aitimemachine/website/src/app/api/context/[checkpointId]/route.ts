import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: { checkpointId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const qp = req.nextUrl.searchParams;
    const qs = new URLSearchParams({
      userId,
      messageLimit: qp.get('messageLimit') || '50',
      toolCallLimit: qp.get('toolCallLimit') || '50',
      contextLimit: qp.get('contextLimit') || '20',
    });

    const response = await fetch(
      `${API_URL}/api/internal/context/${params.checkpointId}?${qs.toString()}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
        cache: 'no-store',
      }
    );

    // Propagate the backend's real status. A 404 is a genuine "not found"
    // (empty state) that the UI handles distinctly from a service outage.
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        data ?? { error: 'Failed to load checkpoint context' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    // Backend unreachable: report the outage rather than fabricating context.
    return NextResponse.json(
      { error: 'Context service is unavailable' },
      { status: 502 }
    );
  }
}
