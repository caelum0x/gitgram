import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/api/internal/settings?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
    });

    if (!res.ok) {
      // Return defaults if no settings exist
      return NextResponse.json({
        autoSync: true,
        emailNotifications: false,
        weeklySummary: true,
      });
    }

    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      autoSync: true,
      emailNotifications: false,
      weeklySummary: true,
    });
  }
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await req.json();

  try {
    const res = await fetch(`${API_URL}/api/internal/settings`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '' 
      },
      body: JSON.stringify({ userId, ...settings }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
