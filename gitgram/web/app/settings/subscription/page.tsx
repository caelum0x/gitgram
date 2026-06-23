'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    const res = await fetch('/api/subscriptions', {
      credentials: 'include',
    });
    const data = await res.json();
    setSubscription(data);
    setLoading(false);
  };

  const handleUpgrade = async (plan: string) => {
    const res = await fetch('/api/subscriptions/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const { url } = await res.json();
    window.location.href = url;
  };

  const handleCancel = async () => {
    if (!confirm('Cancel subscription?')) return;
    await fetch('/api/subscriptions', {
      method: 'DELETE',
      credentials: 'include',
    });
    fetchSubscription();
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Subscription</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-2">Free</h2>
          <p className="text-3xl font-bold mb-4">$0<span className="text-sm">/mo</span></p>
          <ul className="space-y-2 mb-6">
            <li>✓ Basic features</li>
            <li>✓ 100 posts/month</li>
            <li>✓ 1GB storage</li>
          </ul>
          {subscription?.plan === 'free' && (
            <button disabled className="w-full py-2 bg-gray-300 rounded">Current Plan</button>
          )}
        </div>

        <div className="border-2 border-blue-500 rounded-lg p-6">
          <div className="text-xs bg-blue-500 text-white px-2 py-1 rounded w-fit mb-2">POPULAR</div>
          <h2 className="text-xl font-bold mb-2">Premium</h2>
          <p className="text-3xl font-bold mb-4">$9<span className="text-sm">/mo</span></p>
          <ul className="space-y-2 mb-6">
            <li>✓ All Free features</li>
            <li>✓ Verified badge</li>
            <li>✓ Custom themes</li>
            <li>✓ Ad-free</li>
            <li>✓ 10GB storage</li>
          </ul>
          {subscription?.plan === 'premium' ? (
            <button onClick={handleCancel} className="w-full py-2 bg-red-500 text-white rounded">Cancel</button>
          ) : (
            <button onClick={() => handleUpgrade('premium')} className="w-full py-2 bg-blue-500 text-white rounded">Upgrade</button>
          )}
        </div>

        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-2">Creator</h2>
          <p className="text-3xl font-bold mb-4">$29<span className="text-sm">/mo</span></p>
          <ul className="space-y-2 mb-6">
            <li>✓ All Premium features</li>
            <li>✓ Advanced analytics</li>
            <li>✓ Content scheduling</li>
            <li>✓ Priority support</li>
            <li>✓ 100GB storage</li>
          </ul>
          {subscription?.plan === 'creator' ? (
            <button onClick={handleCancel} className="w-full py-2 bg-red-500 text-white rounded">Cancel</button>
          ) : (
            <button onClick={() => handleUpgrade('creator')} className="w-full py-2 bg-blue-500 text-white rounded">Upgrade</button>
          )}
        </div>
      </div>
    </div>
  );
}
