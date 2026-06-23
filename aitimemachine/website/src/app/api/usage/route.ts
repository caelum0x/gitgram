import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/usage?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        plan: 'free',
        apiRequests: {
          used: 0,
          limit: 0,
          percentage: 0,
        },
        storage: {
          used: 0,
          limit: 0,
          percentage: 0,
          unit: 'GB',
        },
        checkpoints: {
          used: 0,
          limit: null,
          percentage: null,
        },
        projects: {
          used: 0,
          limit: null,
          percentage: null,
        },
        chartData: [],
        endpointBreakdown: [],
        storageByProject: [],
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
  }
}
