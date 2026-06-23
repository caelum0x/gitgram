import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetSessionId = params.id;

  // Prevent revoking current session
  if (targetSessionId === sessionId) {
    return NextResponse.json(
      { error: 'Cannot revoke current session' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/sessions/${targetSessionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke session:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
