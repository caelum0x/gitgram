import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/organizations - List user's organizations
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/organizations?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
    });

    if (!response.ok) {
      return NextResponse.json({ organizations: [] });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch organizations:', error);
    return NextResponse.json({ organizations: [] });
  }
}

// POST /api/organizations - Create a new organization
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const orgId = crypto.randomUUID();
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const response = await fetch(`${API_URL}/api/internal/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        id: orgId,
        name: name.trim(),
        slug,
        ownerId: userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to create organization' },
        { status: response.status }
      );
    }

    const org = await response.json();
    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    console.error('Failed to create organization:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
