import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/organizations/[id]/members - List organization members
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
      `${API_URL}/api/internal/organizations/${id}/members?userId=${userId}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      return NextResponse.json({ members: [] });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return NextResponse.json({ members: [] });
  }
}

// POST /api/organizations/[id]/members - Add a member directly (not via invitation)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { memberId, role } = await req.json();

  if (!memberId) {
    return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
  }

  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/organizations/${id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        memberId,
        role,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to add member' },
        { status: response.status }
      );
    }

    const member = await response.json();
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error('Failed to add member:', error);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}
