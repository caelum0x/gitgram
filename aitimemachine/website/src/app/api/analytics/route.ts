import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get user's projects and stats from backend
    const [statsRes, checkpointsRes] = await Promise.all([
      fetch(`${API_URL}/api/cloud/stats`, {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }),
      fetch(`${API_URL}/api/checkpoints`, {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      }),
    ]);

    const stats = statsRes.ok ? await statsRes.json() : null;
    const checkpoints = checkpointsRes.ok ? await checkpointsRes.json() : [];

    // Calculate analytics from real data
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentCheckpoints = checkpoints.filter((cp: any) => 
      new Date(cp.timestamp) > weekAgo
    );
    const todayCheckpoints = checkpoints.filter((cp: any) => 
      new Date(cp.timestamp) > dayAgo
    );

    // Group by day for weekly chart
    const weeklyData: Record<string, number> = {};
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      weeklyData[days[d.getDay()]] = 0;
    }
    recentCheckpoints.forEach((cp: any) => {
      const d = new Date(cp.timestamp);
      const day = days[d.getDay()];
      if (weeklyData[day] !== undefined) {
        weeklyData[day]++;
      }
    });

    // Recent activity
    const recentActivity = checkpoints.slice(0, 10).map((cp: any) => ({
      action: cp.trigger?.type === 'ai_action' ? 'ai' : 'checkpoint',
      project: stats?.project?.name || 'local',
      time: formatTimeAgo(new Date(cp.timestamp)),
      desc: cp.description,
    }));

    return NextResponse.json({
      stats: {
        totalCheckpoints: checkpoints.length,
        totalProjects: stats?.project ? 1 : 0,
        storageUsed: stats?.stats?.storageSizeFormatted || '0 B',
        syncedToday: todayCheckpoints.length,
        restoresThisWeek: 0, // Would need to track this
        avgCheckpointsPerDay: (recentCheckpoints.length / 7).toFixed(1),
      },
      weeklyData: Object.entries(weeklyData).map(([day, count]) => ({ day, checkpoints: count })),
      recentActivity,
      projects: stats?.project ? [{
        name: stats.project.name,
        checkpoints: checkpoints.length,
        lastActivity: stats.stats?.lastActivity,
      }] : [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
