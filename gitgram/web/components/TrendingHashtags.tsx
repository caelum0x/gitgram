'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/services/api';

export default function TrendingHashtags() {
  const router = useRouter();
  const [hashtags, setHashtags] = useState<any[]>([]);

  useEffect(() => {
    fetchTrending();
  }, []);

  const fetchTrending = async () => {
    try {
      const response = await api.get('/tags?limit=10');
      setHashtags(response.data);
    } catch (error) {
      console.error('Failed to load trending hashtags');
    }
  };

  if (hashtags.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold mb-3">Trending</h3>
      <div className="space-y-2">
        {hashtags.map((tag) => (
          <div
            key={tag.id}
            onClick={() => router.push(`/hashtag/${tag.name}`)}
            className="cursor-pointer hover:bg-gray-50 p-2 rounded"
          >
            <div className="font-semibold">#{tag.name}</div>
            <div className="text-sm text-gray-500">
              {tag.count.toLocaleString()} posts
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
