import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import FollowRepoButton from './FollowRepoButton';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  watchersCount: number;
  topics: string[];
  readme: string | null;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

interface ApiResponse {
  success: boolean;
  data?: {
    repository: Repository;
  };
  repository?: Repository;
}

interface RepoPostAuthor {
  id: string;
  username: string;
  avatar: string | null;
  verified?: boolean;
}

interface RepoPost {
  id: string;
  content: string | null;
  createdAt: string;
  user: RepoPostAuthor | null;
  _count?: { likes: number; comments: number };
}

interface GitHubUserLite {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

interface GitHubFork {
  id: number;
  full_name: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  owner: GitHubUserLite;
}

/** Discriminated result so the UI can render error vs empty vs data distinctly. */
type FetchResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'empty' }
  | { status: 'error' };

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
};

function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? '#8b949e';
}

async function fetchRepository(owner: string, name: string): Promise<Repository | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const url = `${apiUrl}/api/v1/repositories/github/${owner}/${name}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });

    if (!res.ok) {
      return null;
    }

    const json: ApiResponse = await res.json();
    const repo = json.data?.repository ?? (json as unknown as { repository: Repository }).repository;
    return repo ?? null;
  } catch {
    return null;
  }
}

/** Optional GitHub auth header for higher rate limits when a token is configured. */
function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchRepoPosts(
  owner: string,
  name: string
): Promise<FetchResult<RepoPost[]>> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const url = `${apiUrl}/api/v1/repositories/github/${owner}/${name}/posts?limit=20`;

  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      return { status: 'error' };
    }
    const json = (await res.json()) as { posts?: RepoPost[] };
    const posts = Array.isArray(json.posts) ? json.posts : [];
    return posts.length > 0 ? { status: 'ok', data: posts } : { status: 'empty' };
  } catch {
    return { status: 'error' };
  }
}

async function fetchStargazers(
  fullName: string
): Promise<FetchResult<GitHubUserLite[]>> {
  const url = `https://api.github.com/repos/${fullName}/stargazers?per_page=30`;
  try {
    const res = await fetch(url, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { status: 'error' };
    }
    const json = (await res.json()) as GitHubUserLite[];
    const users = Array.isArray(json) ? json : [];
    return users.length > 0 ? { status: 'ok', data: users } : { status: 'empty' };
  } catch {
    return { status: 'error' };
  }
}

async function fetchForks(fullName: string): Promise<FetchResult<GitHubFork[]>> {
  const url = `https://api.github.com/repos/${fullName}/forks?per_page=30&sort=stargazers`;
  try {
    const res = await fetch(url, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { status: 'error' };
    }
    const json = (await res.json()) as GitHubFork[];
    const forks = Array.isArray(json) ? json : [];
    return forks.length > 0 ? { status: 'ok', data: forks } : { status: 'empty' };
  } catch {
    return { status: 'error' };
  }
}

export default async function RepoProfilePage({
  params,
}: {
  params: { owner: string; name: string };
}) {
  const { owner, name } = params;
  const repository = await fetchRepository(owner, name);

  if (!repository) {
    notFound();
  }

  const fullName = repository.fullName || `${owner}/${name}`;

  const [posts, stargazers, forks] = await Promise.all([
    fetchRepoPosts(owner, name),
    fetchStargazers(fullName),
    fetchForks(fullName),
  ]);

  const readmePreview = repository.readme
    ? repository.readme.slice(0, 600)
    : null;
  const hasMoreReadme = !!(repository.readme && repository.readme.length > 600);

  return (
    <div
      style={{ backgroundColor: '#0F0F1A', minHeight: '100vh', color: '#E2E8F0' }}
      className="px-4 py-8"
    >
      <div className="mx-auto max-w-4xl">
        {/* Hero Section */}
        <div
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          className="rounded-2xl p-6 mb-6"
        >
          {/* Owner info */}
          <div className="flex items-center gap-3 mb-4">
            <Link href={`/${owner}`} className="flex items-center gap-2 group">
              <Image
                src={repository.owner.avatarUrl}
                alt={`${repository.owner.login} avatar`}
                width={36}
                height={36}
                className="rounded-full ring-2 ring-transparent group-hover:ring-purple-500 transition-all"
              />
              <span
                style={{ color: '#A78BFA' }}
                className="text-sm font-medium hover:underline"
              >
                {repository.owner.login}
              </span>
            </Link>
            <span style={{ color: '#4B5563' }}>/</span>
          </div>

          {/* Repo name */}
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#E2E8F0' }}>
            {repository.name}
          </h1>

          {/* Description */}
          {repository.description && (
            <p style={{ color: '#94A3B8' }} className="text-base mb-4 leading-relaxed">
              {repository.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* Language badge */}
            {repository.language && (
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    backgroundColor: getLanguageColor(repository.language),
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#CBD5E1' }} className="text-sm">
                  {repository.language}
                </span>
              </div>
            )}

            {/* Stars */}
            <div className="flex items-center gap-1 text-sm" style={{ color: '#CBD5E1' }}>
              <span>⭐</span>
              <span>{repository.stargazersCount.toLocaleString()}</span>
            </div>

            {/* Forks */}
            <div className="flex items-center gap-1 text-sm" style={{ color: '#CBD5E1' }}>
              <span>🍴</span>
              <span>{repository.forksCount.toLocaleString()}</span>
            </div>

            {/* Watchers */}
            <div className="flex items-center gap-1 text-sm" style={{ color: '#CBD5E1' }}>
              <span>👁</span>
              <span>{repository.watchersCount.toLocaleString()}</span>
            </div>
          </div>

          {/* Topics */}
          {repository.topics && repository.topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {repository.topics.map((topic) => (
                <span
                  key={topic}
                  style={{
                    backgroundColor: '#2D1B69',
                    color: '#C4B5FD',
                    border: '1px solid #4C1D95',
                  }}
                  className="text-xs px-3 py-1 rounded-full font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Follow button */}
          <FollowRepoButton owner={owner} name={name} />
        </div>

        {/* Tabs */}
        <TabSection
          owner={owner}
          name={name}
          readmePreview={readmePreview}
          hasMoreReadme={hasMoreReadme ?? false}
          posts={posts}
          stargazers={stargazers}
          forks={forks}
        />
      </div>
    </div>
  );
}

const CARD_STYLE = { backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' } as const;

function StateMessage({
  kind,
  emptyLabel,
  errorLabel,
}: {
  kind: 'empty' | 'error';
  emptyLabel: string;
  errorLabel: string;
}) {
  const isError = kind === 'error';
  return (
    <p
      style={{ color: isError ? '#F87171' : '#4B5563' }}
      className="text-sm italic"
    >
      {isError ? errorLabel : emptyLabel}
    </p>
  );
}

function GitHubUserRow({ user }: { user: GitHubUserLite }) {
  return (
    <a
      href={user.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
    >
      <Image
        src={user.avatar_url}
        alt={`${user.login} avatar`}
        width={32}
        height={32}
        className="rounded-full"
      />
      <span style={{ color: '#CBD5E1' }} className="text-sm font-medium">
        {user.login}
      </span>
    </a>
  );
}

function PostRow({ post }: { post: RepoPost }) {
  const author = post.user;
  const created = new Date(post.createdAt);
  const createdLabel = Number.isNaN(created.getTime())
    ? ''
    : created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div
      style={{ borderBottom: '1px solid #2D2D50' }}
      className="py-3 last:border-b-0"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {author?.avatar && (
          <Image
            src={author.avatar}
            alt={`${author.username} avatar`}
            width={24}
            height={24}
            className="rounded-full"
          />
        )}
        <span style={{ color: '#A78BFA' }} className="text-sm font-medium">
          {author?.username ?? 'Unknown'}
        </span>
        {createdLabel && (
          <span style={{ color: '#4B5563' }} className="text-xs">
            · {createdLabel}
          </span>
        )}
      </div>
      {post.content && (
        <p style={{ color: '#CBD5E1' }} className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {post.content}
        </p>
      )}
      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: '#64748B' }}>
        <span>❤ {post._count?.likes ?? 0}</span>
        <span>💬 {post._count?.comments ?? 0}</span>
      </div>
    </div>
  );
}

function ForkRow({ fork }: { fork: GitHubFork }) {
  return (
    <a
      href={fork.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Image
          src={fork.owner.avatar_url}
          alt={`${fork.owner.login} avatar`}
          width={32}
          height={32}
          className="rounded-full flex-shrink-0"
        />
        <span style={{ color: '#CBD5E1' }} className="text-sm font-medium truncate">
          {fork.full_name}
        </span>
      </div>
      <span style={{ color: '#94A3B8' }} className="text-xs flex-shrink-0">
        ⭐ {fork.stargazers_count.toLocaleString()}
      </span>
    </a>
  );
}

function TabSection({
  owner,
  name,
  readmePreview,
  hasMoreReadme,
  posts,
  stargazers,
  forks,
}: {
  owner: string;
  name: string;
  readmePreview: string | null;
  hasMoreReadme: boolean;
  posts: FetchResult<RepoPost[]>;
  stargazers: FetchResult<GitHubUserLite[]>;
  forks: FetchResult<GitHubFork[]>;
}) {
  return (
    <div>
      {/* Tab navigation */}
      <div
        style={{ borderBottom: '1px solid #2D2D50' }}
        className="flex gap-0 mb-6 overflow-x-auto"
      >
        {(['overview', 'posts', 'stargazers', 'forks'] as const).map((tab) => (
          <a
            key={tab}
            href={tab === 'overview' ? '#overview' : `#${tab}`}
            style={{ color: '#94A3B8', borderBottom: '2px solid transparent' }}
            className="px-4 py-3 text-sm font-medium capitalize whitespace-nowrap hover:text-white transition-colors"
          >
            {tab}
          </a>
        ))}
      </div>

      {/* Overview tab */}
      <div id="overview">
        <div
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          className="rounded-xl p-6 mb-4"
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            README
          </h2>
          {readmePreview ? (
            <div>
              <pre
                style={{ color: '#CBD5E1', fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                className="text-sm leading-relaxed"
              >
                {readmePreview}
                {hasMoreReadme && '…'}
              </pre>
              {hasMoreReadme && (
                <Link
                  href={`/${owner}/${name}/text/raw`}
                  style={{ color: '#7C3AED' }}
                  className="text-sm mt-3 inline-block hover:underline"
                >
                  View full README →
                </Link>
              )}
            </div>
          ) : (
            <p style={{ color: '#4B5563' }} className="text-sm italic">
              No README available.
            </p>
          )}
        </div>
      </div>

      {/* Posts tab */}
      <div id="posts">
        <div style={CARD_STYLE} className="rounded-xl p-6 mb-4">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Posts
          </h2>
          {posts.status === 'ok' ? (
            <div>
              {posts.data.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <StateMessage
              kind={posts.status}
              emptyLabel="No posts have been shared for this repository yet."
              errorLabel="Could not load posts right now. Please try again later."
            />
          )}
        </div>
      </div>

      {/* Stargazers tab */}
      <div id="stargazers">
        <div style={CARD_STYLE} className="rounded-xl p-6 mb-4">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Stargazers
          </h2>
          {stargazers.status === 'ok' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {stargazers.data.map((user) => (
                <GitHubUserRow key={user.id} user={user} />
              ))}
            </div>
          ) : (
            <StateMessage
              kind={stargazers.status}
              emptyLabel="This repository has no stargazers yet."
              errorLabel="Could not load stargazers from GitHub right now."
            />
          )}
        </div>
      </div>

      {/* Forks tab */}
      <div id="forks">
        <div style={CARD_STYLE} className="rounded-xl p-6 mb-4">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Forks
          </h2>
          {forks.status === 'ok' ? (
            <div className="grid grid-cols-1 gap-1">
              {forks.data.map((fork) => (
                <ForkRow key={fork.id} fork={fork} />
              ))}
            </div>
          ) : (
            <StateMessage
              kind={forks.status}
              emptyLabel="This repository has not been forked yet."
              errorLabel="Could not load forks from GitHub right now."
            />
          )}
        </div>
      </div>
    </div>
  );
}
