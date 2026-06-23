import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// POST /api/organizations/[id]/invitations/[invitationId]/resend - Resend invitation email
export async function POST(
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
      `${API_URL}/api/internal/organizations/${id}/invitations/${invitationId}/resend`,
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
      if (response.status === 403) {
        return NextResponse.json({ error: 'Not authorized to resend invitations' }, { status: 403 });
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
    }

    // In production, send email here
    // const invitation = await response.json();
    // await sendInvitationEmail(invitation.email, invitation.token, orgName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to resend invitation:', error);
    return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
  }
}
