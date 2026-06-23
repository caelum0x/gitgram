import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// DELETE /api/organizations/[id]/invitations/[invitationId] - Cancel invitation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, invitationId } = await params;

  try {
    const response = await fetch(
      `${API_URL}/api/internal/organizations/${id}/invitations/${invitationId}?userId=${userId}`,
      {
        method: 'DELETE',
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Not authorized to cancel invitations' }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to cancel invitation:', error);
    return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 });
  }
}
