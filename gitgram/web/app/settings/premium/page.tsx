'use client';

import { useState, useEffect } from 'react';
import ThemeSelector from '@/components/ThemeSelector';

export default function PremiumSettingsPage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const isPremium = subscription?.plan !== 'free' && subscription?.status === 'active';

  if (loading) return <div className="p-8">Loading...</div>;

  if (!isPremium) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-4">Premium Features</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <p className="text-yellow-800">Upgrade to Premium or Creator to access these features.</p>
          <a href="/settings/subscription" className="text-blue-500 underline mt-2 inline-block">
            View Plans →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Premium Features</h1>

      <div className="space-y-8">
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Custom Themes</h2>
          <p className="text-gray-600 mb-4">Choose your preferred color scheme</p>
          <ThemeSelector />
        </section>

        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Ad-Free Experience</h2>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-green-600 font-medium">Active</span>
          </div>
          <p className="text-gray-600 mt-2">You won't see any advertisements</p>
        </section>

        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Storage</h2>
          <div className="mb-2">
            <div className="flex justify-between text-sm mb-1">
              <span>Used</span>
              <span>{subscription.plan === 'creator' ? '100GB' : '10GB'} available</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: '25%' }}></div>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Priority Support</h2>
          <p className="text-gray-600 mb-4">Get help faster with priority support</p>
          <a href="mailto:premium@gitgram.app" className="text-blue-500 underline">
            Contact Support →
          </a>
        </section>
      </div>
    </div>
  );
}
