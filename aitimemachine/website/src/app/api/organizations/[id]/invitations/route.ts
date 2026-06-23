import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/organizations/[id]/invitations - List pending invitations
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
      `${API_URL}/api/internal/organizations/${id}/invitations?userId=${userId}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      return NextResponse.json({ invitations: [] });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    return NextResponse.json({ invitations: [] });
  }
}

// POST /api/organizations/[id]/invitations - Create invitation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { email, role } = await req.json();

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const invitationId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');

    const response = await fetch(`${API_URL}/api/internal/organizations/${id}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        id: invitationId,
        email: email.toLowerCase().trim(),
        role,
        token,
        invitedBy: userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to create invitation' },
        { status: response.status }
      );
    }

    const invitation = await response.json();

    // In production, send email here
    // await sendInvitationEmail(email, invitation.token, orgName);

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    console.error('Failed to create invitation:', error);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}
