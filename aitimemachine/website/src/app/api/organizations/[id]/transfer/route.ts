import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// POST /api/organizations/[id]/transfer - Transfer organization ownership
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { newOwnerId } = await req.json();

  if (!newOwnerId) {
    return NextResponse.json({ error: 'New owner ID is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/organizations/${id}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        newOwnerId,
      }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Only the owner can transfer ownership' }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Organization or member not found' }, { status: 404 });
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to transfer ownership' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to transfer ownership:', error);
    return NextResponse.json({ error: 'Failed to transfer ownership' }, { status: 500 });
  }
}
