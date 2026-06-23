'use client';

import { useState, useEffect } from 'react';
import VerifiedBadge from './VerifiedBadge';

export default function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    fetchUser();
    fetchSubscription();
  }, [userId]);

  const fetchUser = async () => {
    const res = await fetch(`/api/users/${userId}`);
    const data = await res.json();
    setUser(data);
  };

  const fetchSubscription = async () => {
    const res = await fetch(`/api/subscriptions?userId=${userId}`);
    const data = await res.json();
    setSubscription(data);
  };

  const isVerified = subscription?.plan !== 'free' && subscription?.status === 'active';

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <img src={user.avatar || '/default-avatar.png'} alt={user.username} className="w-12 h-12 rounded-full" />
      <div>
        <div className="flex items-center gap-1">
          <span className="font-bold">{user.username}</span>
          {isVerified && <VerifiedBadge />}
        </div>
        <div className="text-sm text-gray-500">{user.name}</div>
      </div>
    </div>
  );
}
