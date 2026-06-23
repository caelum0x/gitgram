import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get('action');
  const resource = searchParams.get('resource');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = searchParams.get('limit') || '50';
  const offset = searchParams.get('offset') || '0';

  try {
    const queryParams = new URLSearchParams({
      userId,
      limit,
      offset,
      ...(action && { action }),
      ...(resource && { resource }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    });

    const response = await fetch(`${API_URL}/v1/audit?${queryParams}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        logs: [],
        hasMore: false,
        total: 0,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ logs: [], hasMore: false, total: 0 });
  }
}
