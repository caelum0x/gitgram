import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${API_URL}/api/internal/dashboard/stats?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty state when API is unreachable
      return NextResponse.json({
        checkpoints: 0,
        checkpointsDelta: 0,
        projects: 0,
        projectsDelta: 0,
        apiCalls: 0,
        apiCallsDelta: 0,
        storage: '0 GB',
        storageDelta: 0,
        recentActivity: [],
        backendConnected: false,
      });
    }

    const data = await response.json();
    return NextResponse.json({ ...data, backendConnected: true });
  } catch (error) {
    // Return empty state on error
    return NextResponse.json({
      checkpoints: 0,
      checkpointsDelta: 0,
      projects: 0,
      projectsDelta: 0,
      apiCalls: 0,
      apiCallsDelta: 0,
      storage: '0 GB',
      storageDelta: 0,
      recentActivity: [],
      backendConnected: false,
    });
  }
}
