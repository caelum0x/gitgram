'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import RepoCard from '@/components/RepoCard';
import api from '@/services/api';

export default function FollowedReposPage() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFollowedRepos();
  }, []);

  const fetchFollowedRepos = async () => {
    try {
      const res = await api.get('/v1/repositories/following');
      setRepos(res.data.repositories || []);
    } catch (error) {
      console.error('Failed to fetch followed repos:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">📦 Followed Repos</h1>
        
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : repos.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-gray-500">No followed repos yet</p>
            <p className="text-sm text-gray-400 mt-2">Follow repos to see them here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {repos.map((repo) => (
              <RepoCard key={repo.id || repo.fullName} repo={repo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
