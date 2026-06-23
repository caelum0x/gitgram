import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// PATCH /api/organizations/[id]/members/[memberId] - Update member role
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, memberId } = await params;
  const { role } = await req.json();

  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${API_URL}/api/internal/organizations/${id}/members/${memberId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        },
        body: JSON.stringify({
          userId,
          role,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Not authorized to change roles' }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to update member' },
        { status: response.status }
      );
    }

    const member = await response.json();
    return NextResponse.json(member);
  } catch (error) {
    console.error('Failed to update member:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

// DELETE /api/organizations/[id]/members/[memberId] - Remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, memberId } = await params;

  try {
    const response = await fetch(
      `${API_URL}/api/internal/organizations/${id}/members/${memberId}?userId=${userId}`,
      {
        method: 'DELETE',
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Not authorized to remove this member' }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
