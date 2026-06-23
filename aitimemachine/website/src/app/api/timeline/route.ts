import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TimelineEvent = {
  id: string;
  type: string;
  project: string | null;
  projectId: string | null;
  checkpointId: string | null;
  description: string;
  timestamp: string;
  action: string | null;
  scopeType: string | null;
  scopePath: string | null;
  triggerType: string | null;
  linkedCheckpointId: string | null;
  changes: { added: number; deleted: number; modified: number } | null;
  fileCount: number | null;
  conversationPreview: string | null;
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const project = searchParams.get('project');
  const type = searchParams.get('type');
  const action = searchParams.get('action');
  const triggerType = searchParams.get('triggerType');
  const scopeType = searchParams.get('scopeType');
  const scopePath = searchParams.get('scopePath');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const linkedOnly = searchParams.get('linkedOnly');
  const limit = searchParams.get('limit') || '50';
  const offset = searchParams.get('offset') || '0';

  try {
    const queryParams = new URLSearchParams({
      userId,
      limit,
      offset,
      ...(project && { project }),
      ...(type && { type }),
      ...(action && { action }),
      ...(triggerType && { triggerType }),
      ...(scopeType && { scopeType }),
      ...(scopePath && { scopePath }),
      ...(from && { from }),
      ...(to && { to }),
      ...(linkedOnly && { linkedOnly }),
    });

    const response = await fetch(`${API_URL}/api/internal/timeline?${queryParams}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        events: [],
        hasMore: false,
        total: 0,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ events: [], hasMore: false, total: 0 });
  }
}
