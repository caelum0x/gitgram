import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// GET /api/organizations/[id] - Get organization details
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
      `${API_URL}/api/internal/organizations/${id}?userId=${userId}`,
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 });
    }

    const org = await response.json();
    return NextResponse.json(org);
  } catch (error) {
    console.error('Failed to fetch organization:', error);
    return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 });
  }
}

// PATCH /api/organizations/[id] - Update organization
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  try {
    const response = await fetch(`${API_URL}/api/internal/organizations/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
      },
      body: JSON.stringify({
        ...body,
        userId,
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to update organization' },
        { status: response.status }
      );
    }

    const org = await response.json();
    return NextResponse.json(org);
  } catch (error) {
    console.error('Failed to update organization:', error);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}

// DELETE /api/organizations/[id] - Delete organization
export async function DELETE(
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
      `${API_URL}/api/internal/organizations/${id}?userId=${userId}`,
      {
        method: 'DELETE',
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: 'Only the owner can delete the organization' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete organization:', error);
    return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 });
  }
}
