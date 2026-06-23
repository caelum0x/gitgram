'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import api from '@/services/api';

interface Collaboration {
  id: string;
  username: string;
  repoName: string;
  role: string;
  createdAt: string;
}

export default function CollaboratePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();

  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [username, setUsername] = useState('');
  const [repoId, setRepoId] = useState('');
  const [role, setRole] = useState('contributor');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  const loadCollaborations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/v1/collaborations');
      setCollaborations(response.data.collaborations ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load collaborations';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadCollaborations();
    }
  }, [isAuthenticated, loadCollaborations]);

  if (!isAuthenticated) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !repoId.trim()) {
      showToast('Username and repository are required', 'warning');
      return;
    }

    try {
      setInviting(true);
      await api.post('/v1/collaborations/invite', { username, repoId, role });
      showToast(`Invitation sent to ${username}`, 'success');
      setUsername('');
      setRepoId('');
      setRole('contributor');
      await loadCollaborations();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation';
      showToast(message, 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      setRemovingId(id);
      await api.delete(`/v1/collaborations/${id}`);
      setCollaborations((prev) => prev.filter((c) => c.id !== id));
      showToast('Collaborator removed', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove collaborator';
      showToast(message, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8 text-foreground">Collaboration</h1>

      <div className="bg-card p-6 rounded-lg border border-border mb-8">
        <h2 className="text-xl font-bold mb-4 text-foreground">Invite Collaborators</h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="flex-1 border border-border rounded px-4 py-2 bg-muted text-foreground"
              required
            />
            <input
              type="text"
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              placeholder="Repository ID"
              className="flex-1 border border-border rounded px-4 py-2 bg-muted text-foreground"
              required
            />
          </div>
          <div className="flex gap-4 items-center">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-border rounded px-4 py-2 bg-muted text-foreground"
            >
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="bg-primary text-white px-6 py-2 rounded disabled:opacity-50"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-card p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4 text-foreground">Active Collaborations</h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-border rounded" />
                  <div className="h-3 w-24 bg-border rounded" />
                </div>
                <div className="h-8 w-20 bg-border rounded" />
              </div>
            ))}
          </div>
        ) : collaborations.length === 0 ? (
          <div className="text-muted text-center py-8">
            No active collaborations yet
          </div>
        ) : (
          <div className="space-y-4">
            {collaborations.map((collab) => (
              <div
                key={collab.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted"
              >
                <div>
                  <p className="font-medium text-foreground">{collab.username}</p>
                  <p className="text-sm text-muted">
                    {collab.repoName} - {collab.role}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(collab.id)}
                  disabled={removingId === collab.id}
                  className="bg-error text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
                >
                  {removingId === collab.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
