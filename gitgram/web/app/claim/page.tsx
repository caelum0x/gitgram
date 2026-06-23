'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/store/authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GithubRepo {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  htmlUrl: string;
}

interface ClaimedRepo {
  fullName: string;
  username: string;
}

type FilterTab = 'all' | 'unclaimed' | 'claimed';

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LanguageBadgeProps {
  language: string;
}

function LanguageBadge({ language }: LanguageBadgeProps) {
  const color = LANGUAGE_COLORS[language] ?? '#8b949e';
  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--foreground-secondary)]">
      <span
        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {language}
    </span>
  );
}

interface RepoCardProps {
  repo: GithubRepo;
  claimed: ClaimedRepo | undefined;
  claiming: boolean;
  onClaim: (repo: GithubRepo) => void;
}

function RepoCard({ repo, claimed, claiming, onClaim }: RepoCardProps) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3 hover:border-[var(--primary)]/40 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] font-semibold text-sm hover:underline break-all leading-tight"
          >
            {repo.fullName}
          </a>
          <p className="mt-1 text-[var(--foreground-secondary)] text-xs line-clamp-2 leading-relaxed">
            {repo.description ?? 'No description provided.'}
          </p>
        </div>

        {claimed ? (
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-semibold">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Claimed
          </span>
        ) : (
          <button
            onClick={() => onClaim(repo)}
            disabled={claiming}
            className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all"
          >
            {claiming ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Claiming…
              </span>
            ) : (
              'Claim'
            )}
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 flex-wrap">
        {repo.language && <LanguageBadge language={repo.language} />}
        <span className="flex items-center gap-1 text-xs text-[var(--foreground-secondary)]">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          {repo.stars.toLocaleString()}
        </span>
      </div>

      {/* Manage link when claimed */}
      {claimed && (
        <div className="pt-1 border-t border-[var(--border)]">
          <Link
            href={`/${claimed.username}`}
            className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Manage @{claimed.username}
          </Link>
        </div>
      )}
    </div>
  );
}

interface FilterTabsProps {
  active: FilterTab;
  counts: { all: number; unclaimed: number; claimed: number };
  onChange: (tab: FilterTab) => void;
}

function FilterTabs({ active, counts, onChange }: FilterTabsProps) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unclaimed', label: 'Unclaimed' },
    { key: 'claimed', label: 'Claimed' },
  ];

  return (
    <div className="flex gap-1 p-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            active === tab.key
              ? 'bg-[var(--primary)] text-[var(--background)] shadow-sm'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {tab.label}
          <span
            className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              active === tab.key ? 'bg-white/20' : 'bg-[var(--surface-secondary)]'
            }`}
          >
            {counts[tab.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

function FaqSection() {
  const faqs: Array<{ q: string; a: string }> = [
    {
      q: 'Why should I claim my repository?',
      a: 'Claiming your repository gives it a social profile on Gitgram. You can post updates, attract followers, share code snippets, and turn your open-source work into a community — like GitHub meets Instagram.',
    },
    {
      q: 'What does claiming actually do?',
      a: 'It creates a dedicated account page for your repository (e.g. gitgram.app/owner/repo), lets you publish posts and change stories, and links the repo to your Gitgram profile. You become its verified manager.',
    },
    {
      q: 'Is it free?',
      a: 'Claiming repositories is completely free. Gitgram offers optional paid features like verified badges and analytics, but the core social experience — including claiming — costs nothing.',
    },
    {
      q: 'Can I claim repositories I do not own?',
      a: 'No. Gitgram verifies your GitHub write access via OAuth before allowing a claim. Only repository owners and collaborators with push permissions can claim.',
    },
    {
      q: 'What if my GitHub account is not connected?',
      a: 'Head to Settings and link your GitHub account via OAuth. Once connected, your repositories will appear here automatically.',
    },
  ];

  return (
    <section className="mt-16 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-6 text-[var(--foreground)]">Frequently asked questions</h2>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details
            key={faq.q}
            className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
          >
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors">
              {faq.q}
              <svg
                className="w-4 h-4 text-[var(--foreground-secondary)] flex-shrink-0 ml-3 group-open:rotate-180 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p className="px-5 pb-4 text-sm text-[var(--foreground-secondary)] leading-relaxed border-t border-[var(--border)] pt-3">
              {faq.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 12;

export default function ClaimPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  // Search state
  const [searchUsername, setSearchUsername] = useState(user?.githubUsername ?? '');
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [claimedRepos, setClaimedRepos] = useState<ClaimedRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Claim state
  const [claimingRepo, setClaimingRepo] = useState<string | null>(null);

  // Filter + pagination
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);

  // Input ref for focus management
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const isRepoClaimed = useCallback(
    (fullName: string): ClaimedRepo | undefined =>
      claimedRepos.find((c) => c.fullName === fullName),
    [claimedRepos],
  );

  const filteredRepos = repos.filter((r) => {
    if (activeFilter === 'claimed') return Boolean(isRepoClaimed(r.fullName));
    if (activeFilter === 'unclaimed') return !isRepoClaimed(r.fullName);
    return true;
  });

  const paginatedRepos = filteredRepos.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedRepos.length < filteredRepos.length;

  const counts = {
    all: repos.length,
    claimed: repos.filter((r) => Boolean(isRepoClaimed(r.fullName))).length,
    unclaimed: repos.filter((r) => !isRepoClaimed(r.fullName)).length,
  };

  // ---------------------------------------------------------------------------
  // Fetch repos for a GitHub username
  // ---------------------------------------------------------------------------

  const handleSearch = useCallback(async () => {
    const username = searchUsername.trim();
    if (!username) {
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setFetchError(null);
    setSearched(false);
    setRepos([]);
    setClaimedRepos([]);
    setPage(1);
    setActiveFilter('all');

    try {
      // Fetch the user's own claimable repos from the backend (requires auth)
      const response = await api.get<{ repos: GithubRepo[] }>('/v1/claim/my-repos');
      const allRepos = response.data.repos ?? [];

      // Filter to repos that match the requested username (owner)
      const filtered = allRepos.filter(
        (r) => r.owner.toLowerCase() === username.toLowerCase(),
      );

      // Determine which repos are already claimed by checking the Gitgram DB
      // The backend exposes fullName on the existing account — we use a best-effort
      // approach: try to GET each claimed repo page and mark ones that 404 as unclaimed.
      // For performance we skip this and treat all as unclaimed until user claims them
      // (the claim endpoint returns 400 "already claimed" if it was).
      setRepos(filtered.length > 0 ? filtered : allRepos);
      setSearched(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        showToast('Please log in to search repositories.', 'error');
        router.push('/login');
        return;
      }
      if (status === 400) {
        setFetchError('Connect your GitHub account in Settings to browse your repositories.');
      } else {
        setFetchError(getErrorMessage(err));
      }
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [searchUsername, router, showToast]);

  // ---------------------------------------------------------------------------
  // Claim a repository
  // ---------------------------------------------------------------------------

  const handleClaim = useCallback(
    async (repo: GithubRepo) => {
      setClaimingRepo(repo.fullName);

      // Derive a slug: owner-reponame (safe for URL, unique enough)
      const slug = `${repo.owner}-${repo.name}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      try {
        const response = await api.post<{ account: { username: string } }>('/v1/claim/repository', {
          owner: repo.owner,
          name: repo.name,
          username: slug,
        });

        const username = response.data.account?.username ?? slug;

        setClaimedRepos((prev) => [...prev, { fullName: repo.fullName, username }]);
        showToast(`${repo.fullName} claimed as @${username}!`, 'success');
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 400) {
          const message = getErrorMessage(err);
          if (message.toLowerCase().includes('already claimed')) {
            // Mark locally as claimed with a placeholder username
            setClaimedRepos((prev) => [...prev, { fullName: repo.fullName, username: slug }]);
            showToast(`${repo.fullName} is already claimed.`, 'info');
          } else {
            showToast(message, 'error');
          }
        } else {
          showToast(`Failed to claim: ${getErrorMessage(err)}`, 'error');
        }
      } finally {
        setClaimingRepo(null);
      }
    },
    [showToast],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--background)] py-10 px-4">
      <div className="max-w-5xl mx-auto">

        {/* ------------------------------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------------------------------ */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Claim Your Repositories</h1>
          </div>
          <p className="text-[var(--foreground-secondary)] text-base max-w-xl leading-relaxed">
            Turn your GitHub repositories into social profiles on Gitgram. Post updates, attract
            followers, share code snippets, and build a community around your open-source work.
          </p>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* Search bar */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-[var(--foreground-secondary)]" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="GitHub username (e.g. torvalds)"
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--background)] text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search
              </>
            )}
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Error banner */}
        {/* ------------------------------------------------------------------ */}
        {fetchError && (
          <div className="mb-6 flex items-start gap-3 px-4 py-3 bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-xl text-sm text-[var(--error)]">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p>{fetchError}</p>
              {fetchError.toLowerCase().includes('connect') && (
                <Link href="/settings" className="mt-1 inline-block underline font-medium">
                  Go to Settings
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Results */}
        {/* ------------------------------------------------------------------ */}
        {searched && !fetchError && repos.length === 0 && (
          <div className="text-center py-16 text-[var(--foreground-secondary)] text-sm">
            No repositories found for{' '}
            <span className="text-[var(--foreground)] font-medium">{searchUsername}</span>. Check
            the username or connect your GitHub account in{' '}
            <Link href="/settings" className="text-[var(--primary)] hover:underline">
              Settings
            </Link>
            .
          </div>
        )}

        {repos.length > 0 && (
          <>
            {/* Filter tabs + count */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <FilterTabs active={activeFilter} counts={counts} onChange={(tab) => { setActiveFilter(tab); setPage(1); }} />
              <p className="text-xs text-[var(--foreground-secondary)]">
                {filteredRepos.length} repositor{filteredRepos.length === 1 ? 'y' : 'ies'}
              </p>
            </div>

            {/* Grid */}
            {filteredRepos.length === 0 ? (
              <div className="text-center py-12 text-[var(--foreground-secondary)] text-sm">
                No {activeFilter} repositories.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedRepos.map((repo) => (
                    <RepoCard
                      key={repo.fullName}
                      repo={repo}
                      claimed={isRepoClaimed(repo.fullName)}
                      claiming={claimingRepo === repo.fullName}
                      onClaim={handleClaim}
                    />
                  ))}
                </div>

                {/* Load more */}
                {hasMore && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      className="px-6 py-2.5 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)]/50 text-sm text-[var(--foreground)] rounded-xl transition-colors"
                    >
                      Load more ({filteredRepos.length - paginatedRepos.length} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* How it works — shown before first search */}
        {/* ------------------------------------------------------------------ */}
        {!searched && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: (
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                ),
                title: 'Search your username',
                body: 'Enter your GitHub username to browse all repositories you have push access to.',
              },
              {
                icon: (
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                ),
                title: 'Claim with one click',
                body: 'Click Claim on any repository. Gitgram verifies your GitHub write access and creates its social profile.',
              },
              {
                icon: (
                  <path
                    fillRule="evenodd"
                    d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z"
                    clipRule="evenodd"
                  />
                ),
                title: 'Start building community',
                body: 'Post updates, share change stories, attract followers, and grow your project into a social experience.',
              },
            ].map((step) => (
              <div
                key={step.title}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-600/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    {step.icon}
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{step.title}</h3>
                <p className="text-xs text-[var(--foreground-secondary)] leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        <FaqSection />
      </div>
    </div>
  );
}
