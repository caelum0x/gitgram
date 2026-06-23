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
        />
      </div>
    </div>
  );
}

function TabSection({
  owner,
  name,
  readmePreview,
  hasMoreReadme,
}: {
  owner: string;
  name: string;
  readmePreview: string | null;
  hasMoreReadme: boolean;
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

      {/* Posts tab placeholder */}
      <div id="posts">
        <div
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          className="rounded-xl p-6 mb-4"
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Posts
          </h2>
          <p style={{ color: '#4B5563' }} className="text-sm">
            Loading posts...
          </p>
        </div>
      </div>

      {/* Stargazers tab placeholder */}
      <div id="stargazers">
        <div
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          className="rounded-xl p-6 mb-4"
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Stargazers
          </h2>
          <p style={{ color: '#4B5563' }} className="text-sm">
            Stargazers list coming soon.
          </p>
        </div>
      </div>

      {/* Forks tab placeholder */}
      <div id="forks">
        <div
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          className="rounded-xl p-6 mb-4"
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#E2E8F0' }}>
            Forks
          </h2>
          <p style={{ color: '#4B5563' }} className="text-sm">
            Forks list coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
