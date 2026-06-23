import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user's sessions from backend
    const response = await fetch(`${API_URL}/api/internal/sessions?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
    });

    if (!response.ok) {
      // Return empty state when backend not available
      return NextResponse.json({
        sessions: [],
        currentSessionId: sessionId,
      });
    }

    const data = await response.json();
    return NextResponse.json({
      sessions: data.sessions || [],
      currentSessionId: sessionId,
    });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    // Return empty state on error
    return NextResponse.json({
      sessions: [],
      currentSessionId: sessionId,
    });
  }
}

export async function DELETE() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Revoke all sessions except current
    const response = await fetch(`${API_URL}/api/internal/sessions/revoke-all`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        'X-User-Id': userId,
        'X-Current-Session-Id': sessionId || '',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to revoke sessions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke sessions:', error);
    return NextResponse.json({ error: 'Failed to revoke sessions' }, { status: 500 });
  }
}
