'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';

interface RepoAitmSettingsProps {
  owner: string;
  name: string;
}

interface AitmSettings {
  aitmProjectId: string | null;
  autoGenerateStories: boolean;
  hasApiKey: boolean;
}

export default function RepoAitmSettings({ owner, name }: RepoAitmSettingsProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [settings, setSettings] = useState<AitmSettings>({
    aitmProjectId: null,
    autoGenerateStories: false,
    hasApiKey: false,
  });

  // Form state
  const [projectId, setProjectId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(false);

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, name]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/v1/repositories/${owner}/${name}/aitm-settings`);
      const s = data.settings;
      setSettings(s);
      setProjectId(s.aitmProjectId || '');
      setAutoGenerate(s.autoGenerateStories);
    } catch {
      // Not found or not authorized -- leave defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!projectId.trim()) {
      showToast('AITM Project ID is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        aitmProjectId: projectId.trim(),
        autoGenerateStories: autoGenerate,
      };
      if (apiKey.trim()) {
        payload.aitmApiKey = apiKey.trim();
      }
      const { data } = await api.put(`/v1/repositories/${owner}/${name}/aitm-settings`, payload);
      setSettings(data.settings);
      setApiKey(''); // Clear API key field after save
      showToast('AITM settings saved', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [owner, name, projectId, apiKey, autoGenerate, showToast]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    try {
      await api.delete(`/v1/repositories/${owner}/${name}/aitm-settings`);
      setSettings({ aitmProjectId: null, autoGenerateStories: false, hasApiKey: false });
      setProjectId('');
      setApiKey('');
      setAutoGenerate(false);
      showToast('AITM integration removed', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setRemoving(false);
    }
  }, [owner, name, showToast]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-background" />
          <div className="h-4 w-full rounded bg-background" />
          <div className="h-10 w-full rounded bg-background" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-blue-500/5 to-purple-500/5 px-5 py-4 border-b border-border">
        <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <h3 className="text-sm font-semibold text-foreground">AITM Change Story Settings</h3>
          <p className="text-xs text-foreground-secondary">
            Connect Gitgram TimeMachine to auto-generate change stories from checkpoints.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4 p-5">
        {/* AITM Project ID */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-secondary">
            AITM Project ID
          </label>
          <input
            type="text"
            placeholder="e.g. proj_abc123"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-secondary">
            AITM API Key
            {settings.hasApiKey && (
              <span className="ml-2 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-500">
                Stored securely
              </span>
            )}
          </label>
          <input
            type="password"
            placeholder={settings.hasApiKey ? 'Leave blank to keep existing key' : 'Enter your AITM API key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-foreground-secondary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-foreground-secondary">
            Your API key is encrypted before storage and never displayed.
          </p>
        </div>

        {/* Auto-generate toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-generate change stories</p>
            <p className="text-xs text-foreground-secondary">
              When AITM creates a checkpoint, automatically generate a draft change story for review.
            </p>
          </div>
          <button
            onClick={() => setAutoGenerate(!autoGenerate)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              autoGenerate ? 'bg-primary' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
                autoGenerate ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {settings.aitmProjectId && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="text-xs text-red-500 hover:text-red-400 transition disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove AITM integration'}
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !projectId.trim()}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
