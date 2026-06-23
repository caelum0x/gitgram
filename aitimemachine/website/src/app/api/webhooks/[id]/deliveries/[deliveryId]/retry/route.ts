import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliveryId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, deliveryId } = await params;

  try {
    const response = await fetch(
      `${API_URL}/api/internal/webhooks/${id}/deliveries/${deliveryId}/retry`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        },
        body: JSON.stringify({ userId }),
      }
    );

    if (!response.ok) {
      const msg = await response.text().catch(() => '');
      return NextResponse.json(
        { error: 'Failed to retry delivery', details: msg || undefined },
        { status: response.status || 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to retry delivery:', error);
    return NextResponse.json({ error: 'Failed to retry delivery' }, { status: 500 });
  }
}
