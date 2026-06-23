import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/webhooks?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        webhooks: [],
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ webhooks: [] });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { url, events } = body;

  if (!url || !events || events.length === 0) {
    return NextResponse.json({ error: 'URL and events are required' }, { status: 400 });
  }

  // Generate webhook secret
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;

  try {
    const response = await fetch(`${API_URL}/api/internal/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        userId,
        url,
        events,
        secret,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
    }

    const data = await response.json();
    // Return the secret only on creation
    return NextResponse.json({
      ...data,
      secret,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
