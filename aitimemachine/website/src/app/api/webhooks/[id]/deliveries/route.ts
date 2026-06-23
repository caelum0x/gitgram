import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const response = await fetch(
      `${API_URL}/api/internal/webhooks/${id}/deliveries?userId=${userId}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        webhook: null,
        deliveries: [],
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch deliveries:', error);
    return NextResponse.json({ deliveries: [], webhook: null });
  }
}
