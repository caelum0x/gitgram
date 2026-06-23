'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionKey = 'general' | 'collaborators' | 'branches' | 'webhooks' | 'danger';

type CollaboratorRole = 'Owner' | 'Admin' | 'Write' | 'Read';

interface RepoFeatures {
  issues: boolean;
  pullRequests: boolean;
  discussions: boolean;
  wiki: boolean;
  projects: boolean;
}

interface RepoSettings {
  id: string;
  name: string;
  description: string;
  website: string;
  topics: string[];
  visibility: 'public' | 'private';
  features: RepoFeatures;
  defaultBranch: string;
}

interface Collaborator {
  id: string;
  username: string;
  avatarUrl: string;
  role: CollaboratorRole;
}

interface ProtectedBranch {
  id: string;
  pattern: string;
  requireReviews: boolean;
  dismissStaleReviews: boolean;
  requireStatusChecks: boolean;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDelivery: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'collaborators', label: 'Collaborators' },
  { key: 'branches', label: 'Branches' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'danger', label: 'Danger Zone' },
];

const WEBHOOK_EVENTS = [
  'push',
  'pull_request',
  'issues',
  'issue_comment',
  'release',
  'fork',
  'star',
  'watch',
  'create',
  'delete',
];

const ROLE_OPTIONS: CollaboratorRole[] = ['Admin', 'Write', 'Read'];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SaveBannerProps {
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}

function SaveBanner({ saving, saved, error, onSave }: SaveBannerProps) {
  return (
    <div className="flex items-center gap-3 mt-6">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 rounded-md text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
      {saved && <span className="text-sm text-[var(--accent)]">Saved successfully.</span>}
      {error && <span className="text-sm text-[var(--error)]">{error}</span>}
    </div>
  );
}

interface TopicInputProps {
  topics: string[];
  onChange: (topics: string[]) => void;
}

function TopicInput({ topics, onChange }: TopicInputProps) {
  const [input, setInput] = useState('');

  const addTopic = () => {
    const trimmed = input.trim().toLowerCase().replace(/\s+/g, '-');
    if (trimmed && !topics.includes(trimmed)) {
      onChange([...topics, trimmed]);
    }
    setInput('');
  };

  const removeTopic = (topic: string) => {
    onChange(topics.filter((t) => t !== topic));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {topics.map((topic) => (
          <span
            key={topic}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30"
          >
            {topic}
            <button
              onClick={() => removeTopic(topic)}
              className="ml-1 hover:text-[var(--error)] transition-colors"
              aria-label={`Remove topic ${topic}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
          placeholder="Add a topic…"
          className="flex-1 px-3 py-1.5 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
        />
        <button
          onClick={addTopic}
          className="px-3 py-1.5 text-sm rounded-md border border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  requireTyping?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  requireTyping,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = !requireTyping || typed === requireTyping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--foreground-secondary)] mb-4">{description}</p>
        {requireTyping && (
          <div className="mb-4">
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">
              Type <strong className="text-[var(--foreground)]">{requireTyping}</strong> to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--error)]"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-[var(--border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-md text-white transition-opacity disabled:opacity-40 ${
              danger ? 'bg-[var(--error)]' : 'bg-[var(--accent)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section: General ─────────────────────────────────────────────────────────

interface GeneralSectionProps {
  settings: RepoSettings;
  onChange: (updated: RepoSettings) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
}

function GeneralSection({ settings, onChange, onSave, saving, saved, saveError }: GeneralSectionProps) {
  const update = <K extends keyof RepoSettings>(key: K, value: RepoSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const updateFeature = (key: keyof RepoFeatures, value: boolean) =>
    onChange({ ...settings, features: { ...settings.features, [key]: value } });

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          Repository name
        </label>
        <input
          type="text"
          value={settings.name}
          onChange={(e) => update('name', e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
        />
        <p className="mt-1 text-xs text-[var(--warning)]">
          Renaming will break existing clone URLs and links.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          Description
        </label>
        <textarea
          value={settings.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          placeholder="A short description of this repository"
          className="w-full px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          Website URL
        </label>
        <input
          type="url"
          value={settings.website}
          onChange={(e) => update('website', e.target.value)}
          placeholder="https://example.com"
          className="w-full max-w-sm px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Topics</label>
        <TopicInput topics={settings.topics} onChange={(topics) => update('topics', topics)} />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Visibility
        </label>
        <div className="space-y-2">
          {(['public', 'private'] as const).map((v) => (
            <label
              key={v}
              className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-[var(--border)] hover:border-[var(--primary)]/50 transition-colors"
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={settings.visibility === v}
                onChange={() => update('visibility', v)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <div>
                <p className="text-sm font-medium text-[var(--foreground)] capitalize">{v}</p>
                <p className="text-xs text-[var(--foreground-secondary)]">
                  {v === 'public'
                    ? 'Anyone on the internet can see this repository.'
                    : 'Only you and invited collaborators can see this repository.'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-3">Features</label>
        <div className="space-y-2">
          {(
            [
              { key: 'issues', label: 'Issues', desc: 'Track bugs and feature requests' },
              { key: 'pullRequests', label: 'Pull Requests', desc: 'Submit and review code changes' },
              { key: 'discussions', label: 'Discussions', desc: 'Community conversations' },
              { key: 'wiki', label: 'Wiki', desc: 'Documentation pages' },
              { key: 'projects', label: 'Projects', desc: 'Project planning boards' },
            ] as { key: keyof RepoFeatures; label: string; desc: string }[]
          ).map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 rounded-md border border-[var(--border)]"
            >
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                <p className="text-xs text-[var(--foreground-secondary)]">{desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.features[key]}
                onClick={() => updateFeature(key, !settings.features[key])}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.features[key] ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    settings.features[key] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <SaveBanner saving={saving} saved={saved} error={saveError} onSave={onSave} />
    </div>
  );
}

// ─── Section: Collaborators ───────────────────────────────────────────────────

interface CollaboratorsSectionProps {
  owner: string;
  name: string;
}

function CollaboratorsSection({ owner, name }: CollaboratorsSectionProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('Write');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<ApiResponse<{ collaborators: Collaborator[] }>>(
          `/v1/repositories/${owner}/${name}/collaborators`
        );
        setCollaborators(res.data?.data?.collaborators ?? []);
      } catch {
        // non-fatal: show empty list
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [owner, name]);

  const invite = async () => {
    if (!inviteUsername.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await api.post(`/v1/repositories/${owner}/${name}/collaborators`, {
        username: inviteUsername.trim(),
        role: inviteRole,
      });
      setInviteUsername('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const remove = async (collaboratorId: string) => {
    try {
      await api.delete(`/v1/repositories/${owner}/${name}/collaborators/${collaboratorId}`);
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Add collaborator</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void invite()}
            placeholder="Search by username…"
            className="flex-1 px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as CollaboratorRole)}
            className="px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={() => void invite()}
            disabled={inviting || !inviteUsername.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {inviting ? 'Inviting…' : 'Invite'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--error)]">{error}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
          Current collaborators
        </h3>
        {loading ? (
          <p className="text-sm text-[var(--foreground-secondary)]">Loading…</p>
        ) : collaborators.length === 0 ? (
          <p className="text-sm text-[var(--foreground-secondary)]">No collaborators yet.</p>
        ) : (
          <ul className="space-y-2">
            {collaborators.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                <div className="flex items-center gap-3">
                  {c.avatarUrl ? (
                    <img
                      src={c.avatarUrl}
                      alt={c.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-xs font-medium text-[var(--foreground-secondary)]">
                      {c.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{c.username}</p>
                    <p className="text-xs text-[var(--foreground-secondary)]">{c.role}</p>
                  </div>
                </div>
                {c.role !== 'Owner' && (
                  <button
                    onClick={() => void remove(c.id)}
                    className="text-xs text-[var(--error)] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Section: Branches ────────────────────────────────────────────────────────

interface BranchesSectionProps {
  defaultBranch: string;
  owner: string;
  name: string;
}

function BranchesSection({ defaultBranch: initialDefault, owner, name }: BranchesSectionProps) {
  const [defaultBranch, setDefaultBranch] = useState(initialDefault);
  const [protectedBranches, setProtectedBranches] = useState<ProtectedBranch[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<ApiResponse<{ protectedBranches: ProtectedBranch[] }>>(
          `/v1/repositories/${owner}/${name}/branches/protection`
        );
        setProtectedBranches(res.data?.data?.protectedBranches ?? []);
      } catch {
        // non-fatal
      }
    };
    void load();
  }, [owner, name]);

  const saveDefault = async () => {
    setSaving(true);
    try {
      await api.patch(`/v1/repositories/${owner}/${name}`, { defaultBranch });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const addProtection = async () => {
    if (!newPattern.trim()) return;
    try {
      const res = await api.post<ApiResponse<{ rule: ProtectedBranch }>>(
        `/v1/repositories/${owner}/${name}/branches/protection`,
        { pattern: newPattern.trim(), requireReviews: true, dismissStaleReviews: false, requireStatusChecks: false }
      );
      if (res.data?.data?.rule) {
        setProtectedBranches((prev) => [...prev, res.data!.data!.rule]);
      }
      setNewPattern('');
    } catch {
      // ignore
    }
  };

  const removeProtection = async (ruleId: string) => {
    try {
      await api.delete(`/v1/repositories/${owner}/${name}/branches/protection/${ruleId}`);
      setProtectedBranches((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
          Default branch
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            className="max-w-xs px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button
            onClick={() => void saveDefault()}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
          {saved && <span className="text-xs text-[var(--accent)]">Updated.</span>}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
          Branch protection rules
        </h3>
        {protectedBranches.length === 0 ? (
          <p className="text-sm text-[var(--foreground-secondary)] mb-3">No protection rules yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {protectedBranches.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                <div>
                  <p className="text-sm font-mono text-[var(--foreground)]">{rule.pattern}</p>
                  <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                    {[
                      rule.requireReviews && 'Require reviews',
                      rule.dismissStaleReviews && 'Dismiss stale reviews',
                      rule.requireStatusChecks && 'Require status checks',
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No restrictions'}
                  </p>
                </div>
                <button
                  onClick={() => void removeProtection(rule.id)}
                  className="text-xs text-[var(--error)] hover:underline ml-4 flex-shrink-0"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
          <h4 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wide mb-3">
            Add protection rule
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addProtection()}
              placeholder="Branch name pattern, e.g. main or release/*"
              className="flex-1 px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              onClick={() => void addProtection()}
              disabled={!newPattern.trim()}
              className="px-3 py-2 text-sm rounded-md bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Add rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Webhooks ────────────────────────────────────────────────────────

interface WebhooksSectionProps {
  owner: string;
  name: string;
}

function WebhooksSection({ owner, name }: WebhooksSectionProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['push']);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<ApiResponse<{ webhooks: Webhook[] }>>(
          `/v1/repositories/${owner}/${name}/webhooks`
        );
        setWebhooks(res.data?.data?.webhooks ?? []);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [owner, name]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const createWebhook = async () => {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const res = await api.post<ApiResponse<{ webhook: Webhook }>>(
        `/v1/repositories/${owner}/${name}/webhooks`,
        { url: newUrl.trim(), secret: newSecret.trim() || undefined, events: selectedEvents }
      );
      if (res.data?.data?.webhook) {
        setWebhooks((prev) => [...prev, res.data!.data!.webhook]);
      }
      setNewUrl('');
      setNewSecret('');
      setSelectedEvents(['push']);
      setShowForm(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    try {
      await api.delete(`/v1/repositories/${owner}/${name}/webhooks/${webhookId}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
    } catch {
      // ignore
    }
  };

  const testWebhook = async (webhookId: string) => {
    setTestingId(webhookId);
    try {
      await api.post(`/v1/repositories/${owner}/${name}/webhooks/${webhookId}/test`);
    } catch {
      // ignore
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Configured webhooks</h3>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : 'Add webhook'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)] space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1">
              Payload URL *
            </label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1">
              Secret (optional)
            </label>
            <input
              type="password"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="Signing secret"
              className="w-full max-w-sm px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">
              Events
            </label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border cursor-pointer transition-colors ${
                    selectedEvents.includes(event)
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--primary)]/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="sr-only"
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => void createWebhook()}
            disabled={saving || !newUrl.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Creating…' : 'Create webhook'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--foreground-secondary)]">Loading…</p>
      ) : webhooks.length === 0 && !showForm ? (
        <p className="text-sm text-[var(--foreground-secondary)]">No webhooks configured.</p>
      ) : (
        <ul className="space-y-3">
          {webhooks.map((webhook) => (
            <li
              key={webhook.id}
              className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-[var(--foreground)] truncate">{webhook.url}</p>
                  <p className="text-xs text-[var(--foreground-secondary)] mt-1">
                    Events: {webhook.events.join(', ')}
                  </p>
                  {webhook.lastDelivery && (
                    <p className="text-xs text-[var(--foreground-secondary)]">
                      Last delivery: {new Date(webhook.lastDelivery).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void testWebhook(webhook.id)}
                    disabled={testingId === webhook.id}
                    className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--foreground-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors disabled:opacity-50"
                  >
                    {testingId === webhook.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    onClick={() => void deleteWebhook(webhook.id)}
                    className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--error)] hover:border-[var(--error)] transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Section: Danger Zone ─────────────────────────────────────────────────────

interface DangerZoneSectionProps {
  owner: string;
  name: string;
}

type DangerAction = 'transfer' | 'archive' | 'delete' | null;

function DangerZoneSection({ owner, name }: DangerZoneSectionProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<DangerAction>(null);
  const [transferTarget, setTransferTarget] = useState('');

  const handleTransfer = async () => {
    try {
      await api.post(`/v1/repositories/${owner}/${name}/transfer`, { newOwner: transferTarget });
      router.push(`/${transferTarget}/${name}`);
    } catch {
      // ignore
    } finally {
      setActiveAction(null);
    }
  };

  const handleArchive = async () => {
    try {
      await api.patch(`/v1/repositories/${owner}/${name}`, { archived: true });
      router.push(`/${owner}/${name}`);
    } catch {
      // ignore
    } finally {
      setActiveAction(null);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/v1/repositories/${owner}/${name}`);
      router.push(`/${owner}`);
    } catch {
      // ignore
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/5">
      <div className="px-4 py-3 border-b border-[var(--error)]/30">
        <h3 className="text-sm font-semibold text-[var(--error)]">Danger Zone</h3>
      </div>
      <div className="divide-y divide-[var(--error)]/20">
        <div className="flex items-center justify-between px-4 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Transfer ownership</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              Transfer this repository to another user or organization.
            </p>
          </div>
          <button
            onClick={() => setActiveAction('transfer')}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
          >
            Transfer
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Archive this repository</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              Mark as read-only. No new issues, PRs, or comments will be allowed.
            </p>
          </div>
          <button
            onClick={() => setActiveAction('archive')}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
          >
            Archive
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-4 gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Delete this repository</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              Permanently remove this repository and all its content. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setActiveAction('delete')}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--error)] text-white hover:opacity-90 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>

      {activeAction === 'transfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Transfer repository
            </h3>
            <p className="text-sm text-[var(--foreground-secondary)] mb-4">
              Transfer {owner}/{name} to another account. You will lose admin access unless the new
              owner grants it back.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
                New owner username or organization
              </label>
              <input
                type="text"
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                placeholder="e.g. octocat"
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--error)]"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setActiveAction(null); setTransferTarget(''); }}
                className="px-4 py-2 text-sm rounded-md border border-[var(--border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleTransfer()}
                disabled={!transferTarget.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--error)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                I understand, transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAction === 'archive' && (
        <ConfirmModal
          title="Archive repository"
          description={`Archive ${owner}/${name}? The repository will become read-only.`}
          confirmLabel="Archive repository"
          requireTyping={`${owner}/${name}`}
          danger
          onCancel={() => setActiveAction(null)}
          onConfirm={() => void handleArchive()}
        />
      )}

      {activeAction === 'delete' && (
        <ConfirmModal
          title="Delete repository"
          description="This action cannot be undone. All issues, PRs, code, and history will be permanently deleted."
          confirmLabel="Delete this repository"
          requireTyping={`${owner}/${name}`}
          danger
          onCancel={() => setActiveAction(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: RepoSettings = {
  id: '',
  name: '',
  description: '',
  website: '',
  topics: [],
  visibility: 'public',
  features: {
    issues: true,
    pullRequests: true,
    discussions: false,
    wiki: false,
    projects: false,
  },
  defaultBranch: 'main',
};

export default function RepoSettingsPage() {
  const params = useParams<{ owner: string; name: string }>();
  const owner = params?.owner ?? '';
  const name = params?.name ?? '';

  const [activeSection, setActiveSection] = useState<SectionKey>('general');
  const [settings, setSettings] = useState<RepoSettings>(DEFAULT_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !name) return;

    const load = async () => {
      try {
        const res = await api.get<ApiResponse<{ settings: RepoSettings }>>(
          `/v1/repositories/${owner}/${name}/settings`
        );
        const data = res.data?.data?.settings;
        if (data) {
          setSettings(data);
        }
      } catch (err: unknown) {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load repository settings.'
        );
      }
    };

    void load();
  }, [owner, name]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/v1/repositories/${owner}/${name}`, {
        name: settings.name,
        description: settings.description,
        website: settings.website,
        topics: settings.topics,
        visibility: settings.visibility,
        features: settings.features,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }, [owner, name, settings]);

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--error)] text-sm">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">
            <a href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">
              {owner}
            </a>
            {' / '}
            <a href={`/${owner}/${name}`} className="hover:text-[var(--primary)] transition-colors">
              {name || settings.name}
            </a>
          </p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Repository Settings</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar nav */}
          <nav className="flex-shrink-0 lg:w-48">
            <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
              {NAV_ITEMS.map(({ key, label }) => (
                <li key={key}>
                  <button
                    onClick={() => setActiveSection(key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                      activeSection === key
                        ? 'bg-[var(--primary)]/15 text-[var(--primary)] font-medium'
                        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
                    } ${key === 'danger' ? 'text-[var(--error)] hover:text-[var(--error)]' : ''}`}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            {activeSection === 'general' && (
              <GeneralSection
                settings={settings}
                onChange={setSettings}
                onSave={() => void handleSave()}
                saving={saving}
                saved={saved}
                saveError={saveError}
              />
            )}
            {activeSection === 'collaborators' && (
              <CollaboratorsSection owner={owner} name={name} />
            )}
            {activeSection === 'branches' && (
              <BranchesSection
                defaultBranch={settings.defaultBranch}
                owner={owner}
                name={name}
              />
            )}
            {activeSection === 'webhooks' && (
              <WebhooksSection owner={owner} name={name} />
            )}
            {activeSection === 'danger' && (
              <DangerZoneSection owner={owner} name={name} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
