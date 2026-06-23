'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

interface AnalyticsData {
  stats: {
    totalCheckpoints: number;
    totalProjects: number;
    storageUsed: string;
    syncedToday: number;
    restoresThisWeek: number;
    avgCheckpointsPerDay: string;
  };
  weeklyData: { day: string; checkpoints: number }[];
  recentActivity: { action: string; project: string; time: string; desc: string }[];
  projects: { name: string; checkpoints: number; lastActivity: string }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then(res => res.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const maxCheckpoints = data ? Math.max(...data.weeklyData.map(d => d.checkpoints), 1) : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">🕐 Gitgram TimeMachine</Link>
          <div className="flex gap-4 items-center">
            <Link href="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link href="/analytics" className="text-white">Analytics</Link>
            <Link href="/settings" className="text-gray-400 hover:text-white">Settings</Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Usage Analytics</h1>

        {loading && <div className="text-gray-400">Loading...</div>}
        {error && <div className="text-red-400">Error: {error}</div>}

        {data && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-blue-400">{data.stats.totalCheckpoints}</div>
                <div className="text-xs text-gray-500">Total Checkpoints</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-green-400">{data.stats.totalProjects}</div>
                <div className="text-xs text-gray-500">Projects</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-purple-400">{data.stats.storageUsed}</div>
                <div className="text-xs text-gray-500">Storage Used</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-yellow-400">{data.stats.syncedToday}</div>
                <div className="text-xs text-gray-500">Today</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-red-400">{data.stats.restoresThisWeek}</div>
                <div className="text-xs text-gray-500">Restores</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-400">{data.stats.avgCheckpointsPerDay}</div>
                <div className="text-xs text-gray-500">Avg/Day</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Weekly Chart */}
              <div className="bg-gray-900 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Checkpoints This Week</h2>
                <div className="flex items-end gap-2 h-40">
                  {data.weeklyData.map(d => (
                    <div key={d.day} className="flex-1 flex flex-col items-center">
                      <div 
                        className="w-full bg-blue-600 rounded-t"
                        style={{ height: `${(d.checkpoints / maxCheckpoints) * 100}%`, minHeight: d.checkpoints > 0 ? '8px' : '2px' }}
                      />
                      <span className="text-xs text-gray-500 mt-2">{d.day}</span>
                      <span className="text-xs text-gray-600">{d.checkpoints}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gray-900 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
                <div className="space-y-3">
                  {data.recentActivity.length === 0 && (
                    <div className="text-gray-500 text-sm">No recent activity</div>
                  )}
                  {data.recentActivity.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full ${
                        item.action === 'ai' ? 'bg-purple-400' :
                        item.action === 'restore' ? 'bg-yellow-400' :
                        'bg-blue-400'
                      }`} />
                      <span className="text-gray-400 flex-1 truncate">{item.desc}</span>
                      <span className="text-gray-600 text-xs">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Projects */}
            {data.projects.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-6 mt-6">
                <h2 className="text-lg font-semibold mb-4">Projects</h2>
                <div className="space-y-3">
                  {data.projects.map((p, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="w-32 text-sm truncate">{p.name}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${Math.min(100, (p.checkpoints / data.stats.totalCheckpoints) * 100)}%` }} 
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-20 text-right">{p.checkpoints} cp</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
