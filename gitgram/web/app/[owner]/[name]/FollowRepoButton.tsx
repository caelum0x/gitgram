'use client';

import { useState } from 'react';

interface FollowRepoButtonProps {
  owner: string;
  name: string;
}

export default function FollowRepoButton({ owner, name }: FollowRepoButtonProps) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFollow = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiUrl}/api/v1/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'repo',
          targetId: `${owner}/${name}`,
        }),
      });

      if (res.ok) {
        setFollowing((prev) => !prev);
      }
    } catch {
      // silently handle network errors
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleFollow}
      disabled={loading}
      style={{
        backgroundColor: following ? 'transparent' : '#7C3AED',
        color: following ? '#7C3AED' : '#FFFFFF',
        border: `1px solid #7C3AED`,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
      className="px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
    >
      {loading ? 'Loading…' : following ? 'Following' : 'Follow Repo'}
    </button>
  );
}
