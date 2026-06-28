'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Repository, repoService } from '@/services/repoService';
import { githubService } from '@/services/githubService';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/utils/error';
import { buildRepoTextPath } from '@/utils/repositoryRouting';

interface RepoInteractionPanelProps {
  repository: Repository;
  owner: string;
  name: string;
  onFollow: () => void;
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

/** Simple activity graph -- 12-week bar chart (commit counts). */
function ActivityGraph({ owner, name }: { owner: string; name: string }) {
  const [weeklyData, setWeeklyData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
  }, [owner, name]);

  const fetchActivity = async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/stats/participation`);
      if (res.ok) {
        const data = await res.json();
        // participation.all is 52-week array of commit counts; take last 12 weeks
        const all: number[] = data?.all || [];
        setWeeklyData(all.slice(-12));
      }
    } catch {
      // Silently handle if rate limited
    } finally {
      setLoading(false);
    }
  };

  const maxVal = Math.max(...weeklyData, 1);

  if (loading) {
    return (
      <div className="flex items-end gap-1 h-16">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-t bg-hover animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
        ))}
      </div>
    );
  }

  if (weeklyData.length === 0) {
    return (
      <p className="text-xs text-foreground-secondary">Activity data unavailable.</p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-1 h-16">
        {weeklyData.map((val, i) => {
          const pct = Math.max((val / maxVal) * 100, 4);
          return (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary/60 transition-all hover:bg-primary"
              style={{ height: `${pct}%` }}
              title={`Week ${i + 1}: ${val} commits`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-foreground-secondary">
        <span>12 weeks ago</span>
        <span>This week</span>
      </div>
    </div>
  );
}

/** Recent contributors row from GitHub API. */
function RecentContributors({ owner, name }: { owner: string; name: string }) {
  const [contributors, setContributors] = useState<any[]>([]);

  useEffect(() => {
    fetchContributors();
  }, [owner, name]);

  const fetchContributors = async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contributors?per_page=8`);
      if (res.ok) {
        const data = await res.json();
        setContributors(Array.isArray(data) ? data.slice(0, 8) : []);
      }
    } catch {
      // Silently handle
    }
  };

  if (contributors.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-foreground-secondary">Recent Contributors</h4>
      <div className="flex -space-x-2">
        {contributors.map((c) => (
          <a
            key={c.id}
            href={c.html_url}
            target="_blank"
            rel="noopener noreferrer"
            title={c.login}
          >
            <img
              src={c.avatar_url}
              alt={c.login}
              className="h-7 w-7 rounded-full border-2 border-card transition hover:scale-110 hover:z-10"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function RepoInteractionPanel({ repository, owner, name, onFollow }: RepoInteractionPanelProps) {
  const REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F680}', '\u{1F440}', '\u{1F525}'];
  const { user } = useAuthStore();
  const isGitHubConnected = Boolean(user?.githubId);
  const [shareCopied, setShareCopied] = useState(false);
  const [exportLoading, setExportLoading] = useState<'copy' | 'download' | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [cachedRepoText, setCachedRepoText] = useState<string | null>(null);

  // GitHub one-click star state
  const [starred, setStarred] = useState<boolean | null>(null);
  const [starLoading, setStarLoading] = useState(false);
  const [starError, setStarError] = useState<string | null>(null);

  // Resolve current star state once GitHub is connected.
  useEffect(() => {
    let active = true;
    if (!isGitHubConnected) {
      setStarred(null);
      return;
    }
    githubService
      .hasStarredRepo(repository.fullName)
      .then((value) => {
        if (active) setStarred(value);
      })
      .catch(() => {
        // Non-fatal: leave as unknown so the button still offers to star.
        if (active) setStarred(false);
      });
    return () => {
      active = false;
    };
  }, [isGitHubConnected, repository.fullName]);

  const handleStarOnGitHub = useCallback(async () => {
    // Not connected → fall back to opening the repo on GitHub (previous behavior).
    if (!isGitHubConnected) {
      window.open(repository.htmlUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (starLoading) return;
    setStarError(null);

    const next = !starred;
    // Optimistic toggle.
    setStarred(next);
    setStarLoading(true);
    try {
      const result = next
        ? await githubService.starRepo(repository.fullName)
        : await githubService.unstarRepo(repository.fullName);
      if (!result.success) {
        throw new Error(result.message || 'GitHub action failed');
      }
      setStarred(result.active);
    } catch (error) {
      // Revert on failure.
      setStarred(!next);
      setStarError(getErrorMessage(error));
    } finally {
      setStarLoading(false);
    }
  }, [isGitHubConnected, starred, starLoading, repository.fullName, repository.htmlUrl]);

  const handleReaction = async (type: string) => {
    try {
      await repoService.addReaction(owner, name, type);
    } catch (error) {
      console.error('Failed to add reaction', error);
    }
  };

  const handleShare = async () => {
    try {
      await repoService.shareRepo(owner, name);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to share', error);
    }
  };

  const fetchRepoText = async () => {
    if (cachedRepoText) {
      return cachedRepoText;
    }

    const text = await repoService.exportToText(owner, name);
    setCachedRepoText(text);
    return text;
  };

  const handleCopyRepoText = async () => {
    setExportLoading('copy');
    setExportMessage(null);

    try {
      const text = await fetchRepoText();
      await navigator.clipboard.writeText(text);
      setExportMessage('Repo text copied.');
    } catch (error) {
      console.error('Failed to copy repo text', error);
      setExportMessage('Repo text export failed.');
    } finally {
      setExportLoading(null);
    }
  };

  const handleDownloadRepoText = async () => {
    setExportLoading('download');
    setExportMessage(null);

    try {
      const text = await fetchRepoText();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${owner}-${name}-repo-to-text.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage('Repo text downloaded.');
    } catch (error) {
      console.error('Failed to download repo text', error);
      setExportMessage('Repo text export failed.');
    } finally {
      setExportLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Follow / Star / Share */}
      <div className="rounded-xl border border-border bg-card p-4">
        <button
          onClick={onFollow}
          className={`mb-3 w-full rounded-lg py-2.5 text-sm font-semibold transition ${
            repository.isFollowing
              ? 'border border-border bg-background text-foreground hover:bg-hover'
              : 'bg-primary text-white hover:bg-primary-hover'
          }`}
        >
          {repository.isFollowing ? 'Following' : 'Follow Repository'}
        </button>

        <div className="flex gap-2 mb-3">
          <button
            onClick={handleStarOnGitHub}
            disabled={starLoading}
            aria-pressed={isGitHubConnected ? starred ?? false : undefined}
            title={
              isGitHubConnected
                ? starred
                  ? 'Unstar on GitHub'
                  : 'Star on GitHub'
                : 'Open on GitHub'
            }
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isGitHubConnected && starred
                ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                : 'border-border bg-background text-foreground hover:bg-hover'
            }`}
          >
            {starLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg
                className={`h-4 w-4 ${isGitHubConnected && starred ? 'text-yellow-500' : 'text-yellow-500'}`}
                fill={isGitHubConnected && starred ? 'currentColor' : 'currentColor'}
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
            {isGitHubConnected ? (starred ? 'Starred' : 'Star') : 'Star'}
          </button>
          <button
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground transition hover:bg-hover"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {shareCopied ? 'Copied!' : 'Share'}
          </button>
        </div>

        {starError && (
          <p className="mb-3 text-xs text-error" role="alert">
            {starError}
          </p>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={handleCopyRepoText}
            disabled={exportLoading !== null}
            className="flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportLoading === 'copy' ? 'Copying...' : 'Copy Repo Text'}
          </button>
          <button
            onClick={handleDownloadRepoText}
            disabled={exportLoading !== null}
            className="flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportLoading === 'download' ? 'Preparing...' : 'Download .txt'}
          </button>
        </div>

        <Link
          href={buildRepoTextPath(owner, name)}
          className="mb-3 flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-hover"
        >
          Open Text View
        </Link>

        {exportMessage ? (
          <p className="mb-3 text-xs text-foreground-secondary">{exportMessage}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-background p-3 text-center">
            <p className="text-lg font-bold text-foreground">{fmt(repository.stars)}</p>
            <p className="text-xs text-foreground-secondary">Stars</p>
          </div>
          <div className="rounded-lg bg-background p-3 text-center">
            <p className="text-lg font-bold text-foreground">{fmt(repository.forks)}</p>
            <p className="text-xs text-foreground-secondary">Forks</p>
          </div>
          <div className="rounded-lg bg-background p-3 text-center">
            <p className="text-lg font-bold text-foreground">{fmt(repository.social?.followers)}</p>
            <p className="text-xs text-foreground-secondary">Followers</p>
          </div>
          <div className="rounded-lg bg-background p-3 text-center">
            <p className="text-lg font-bold text-foreground">{fmt(repository.social?.posts)}</p>
            <p className="text-xs text-foreground-secondary">Posts</p>
          </div>
        </div>
      </div>

      {/* Quick reactions */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-2 text-xs font-medium text-foreground-secondary">React to this repo</h4>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-lg transition hover:scale-110 hover:bg-hover"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Activity graph */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-3 text-xs font-medium text-foreground-secondary">Commit Activity</h4>
        <ActivityGraph owner={owner} name={name} />
      </div>

      {/* Recent contributors */}
      <div className="rounded-xl border border-border bg-card p-4">
        <RecentContributors owner={owner} name={name} />
      </div>
    </div>
  );
}
