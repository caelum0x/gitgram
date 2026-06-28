'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import SubscriptionStatus from '@/components/SubscriptionStatus';

interface AccountSettings {
  displayName: string;
  autoSync: boolean;
  emailNotifications: boolean;
  weeklySummary: boolean;
}

const DEFAULT_SETTINGS: AccountSettings = {
  displayName: '',
  autoSync: true,
  emailNotifications: false,
  weeklySummary: true,
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const { user } = useUser();
  const [settings, setSettings] = useState<AccountSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then((data: Partial<AccountSettings>) => {
        if (cancelled) return;
        setSettings((prev) => ({
          displayName: data.displayName ?? user?.fullName ?? prev.displayName,
          autoSync: data.autoSync ?? prev.autoSync,
          emailNotifications: data.emailNotifications ?? prev.emailNotifications,
          weeklySummary: data.weeklySummary ?? prev.weeklySummary,
        }));
      })
      .catch(() => {
        // Backend unavailable: keep defaults; surface only on save.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.fullName]);

  const update = useCallback(
    <K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaveState('idle');
    },
    [],
  );

  const handleSave = async () => {
    setSaveState('saving');
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setSaveState('saved');
    } catch (err: unknown) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const saving = saveState === 'saving';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">Gitgram TimeMachine</Link>
          <div className="flex gap-4 items-center">
            <Link href="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link href="/settings" className="text-white">Settings</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {/* Subscription */}
        <div className="mb-6">
          <SubscriptionStatus />
        </div>

        {/* Profile */}
        <section className="bg-gray-900 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={email}
                readOnly
                disabled
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-500">
                Managed by your authentication provider.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Display Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={settings.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                disabled={loading}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="bg-gray-900 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Preferences</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm">Auto-sync checkpoints to cloud</span>
              <input
                type="checkbox"
                checked={settings.autoSync}
                onChange={(e) => update('autoSync', e.target.checked)}
                disabled={loading}
                className="w-5 h-5 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm">Email notifications for sync errors</span>
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => update('emailNotifications', e.target.checked)}
                disabled={loading}
                className="w-5 h-5 rounded"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm">Weekly usage summary</span>
              <input
                type="checkbox"
                checked={settings.weeklySummary}
                onChange={(e) => update('weeklySummary', e.target.checked)}
                disabled={loading}
                className="w-5 h-5 rounded"
              />
            </label>
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-gray-900 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <button className="text-sm text-blue-400 hover:text-blue-300">
              Create New Key
            </button>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            API keys allow you to authenticate with Gitgram TimeMachine from the CLI or SDK.
          </p>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Default Key</p>
                <p className="text-xs text-gray-500">aitm_abc1234... | Created Jan 15, 2026</p>
              </div>
              <button className="text-sm text-red-400 hover:text-red-300">
                Revoke
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-gray-900 rounded-xl p-6 border border-red-900/50">
          <h2 className="text-lg font-semibold mb-4 text-red-400">Danger Zone</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete all cloud data</p>
                <p className="text-xs text-gray-500">Remove all synced checkpoints from cloud</p>
              </div>
              <button className="px-4 py-2 text-sm border border-red-800 text-red-400 rounded-lg hover:bg-red-900/20">
                Delete Data
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete account</p>
                <p className="text-xs text-gray-500">Permanently delete your account and all data</p>
              </div>
              <button className="px-4 py-2 text-sm border border-red-800 text-red-400 rounded-lg hover:bg-red-900/20">
                Delete Account
              </button>
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="mt-8 flex items-center justify-end gap-4">
          {saveState === 'saved' && (
            <span className="text-sm text-green-400">Settings saved.</span>
          )}
          {saveState === 'error' && error && (
            <span className="text-sm text-red-400">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
