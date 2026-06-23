import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URLSearchParams({
    userId,
    query: request.nextUrl.searchParams.get('query') || '',
  });

  const optionalKeys = ['projectId', 'repositoryId', 'limit'] as const;
  for (const key of optionalKeys) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }

  if (!params.get('query')) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/knowledge-base/search?${params.toString()}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to search knowledge base' }, { status: 500 });
  }
}
