'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

// --- Types ---

interface TrendingRepository {
  id: string;
  owner: string;
  name: string;
  description?: string;
  language?: string;
  stars: number;
  starsToday: number;
}

type LanguageFilter = 'All' | 'TypeScript' | 'Python' | 'JavaScript' | 'Go' | 'Rust';

// --- Constants ---

const LANGUAGE_FILTERS: LanguageFilter[] = [
  'All',
  'TypeScript',
  'Python',
  'JavaScript',
  'Go',
  'Rust',
];

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  Python: '#3776AB',
  JavaScript: '#F7DF1E',
  Go: '#00ADD8',
  Rust: '#CE422B',
  Ruby: '#CC342D',
  Java: '#B07219',
  'C++': '#F34B7D',
  C: '#555555',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  Shell: '#89E051',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Dart: '#00B4AB',
  Scala: '#C22D40',
  Elixir: '#6E4A7E',
  Haskell: '#5E5086',
  Lua: '#000080',
};

function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? '#8B949E';
}

// --- Rank Badge ---

interface RankBadgeProps {
  rank: number;
}

function RankBadge({ rank }: RankBadgeProps) {
  const styles: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: '#FFD700', text: '#1A1A2E', border: '#FFD700' },
    2: { bg: '#C0C0C0', text: '#1A1A2E', border: '#C0C0C0' },
    3: { bg: '#CD7F32', text: '#1A1A2E', border: '#CD7F32' },
  };

  const style = styles[rank] ?? { bg: '#2D2D50', text: '#8892A4', border: '#3D3D60' };

  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {rank}
    </span>
  );
}

// --- Skeleton Row ---

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 p-4 border-b border-[#2D2D50] last:border-b-0 animate-pulse">
      <div className="w-7 h-7 rounded-full bg-[#2D2D50] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-[#2D2D50] rounded w-40" />
        <div className="h-3 bg-[#2D2D50] rounded w-64" />
        <div className="flex items-center gap-4">
          <div className="h-3 bg-[#2D2D50] rounded w-20" />
          <div className="h-3 bg-[#2D2D50] rounded w-16" />
          <div className="h-3 bg-[#2D2D50] rounded w-24" />
        </div>
      </div>
    </div>
  );
}

// --- Repo Row ---

interface RepoRowProps {
  repo: TrendingRepository;
  rank: number;
}

function RepoRow({ repo, rank }: RepoRowProps) {
  const langColor = repo.language ? getLanguageColor(repo.language) : null;
  const formattedStars =
    repo.stars >= 1000
      ? `${(repo.stars / 1000).toFixed(1)}k`
      : repo.stars.toLocaleString();

  return (
    <Link
      href={`/${repo.owner}/${repo.name}`}
      className="flex items-start gap-3 p-4 border-b border-[#2D2D50] last:border-b-0 hover:bg-[#22223A] transition-colors duration-150 group"
    >
      <RankBadge rank={rank} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[#E2E8F0] text-sm truncate group-hover:text-blue-400 transition-colors">
            {repo.owner}
            <span className="text-[#8892A4]">/</span>
            {repo.name}
          </span>
          <span className="text-xs text-emerald-400 font-medium flex-shrink-0">
            +{repo.starsToday.toLocaleString()} today
          </span>
        </div>

        {repo.description && (
          <p className="text-xs text-[#8892A4] mt-1 line-clamp-2 leading-relaxed">
            {repo.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-2 text-xs text-[#8892A4]">
          {langColor && repo.language && (
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: langColor }}
              />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            {formattedStars}
          </span>
        </div>
      </div>
    </Link>
  );
}

// --- Language Filter Tabs ---

interface LanguageTabsProps {
  selected: LanguageFilter;
  onChange: (lang: LanguageFilter) => void;
}

function LanguageTabs({ selected, onChange }: LanguageTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-4 pb-3 border-b border-[#2D2D50]">
      {LANGUAGE_FILTERS.map((lang) => {
        const isActive = lang === selected;
        const color = lang !== 'All' ? getLanguageColor(lang) : null;

        return (
          <button
            key={lang}
            onClick={() => onChange(lang)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors duration-150 ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-[#8892A4] hover:text-[#E2E8F0] hover:bg-[#2D2D50]'
            }`}
          >
            {color && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            {lang}
          </button>
        );
      })}
    </div>
  );
}

// --- Main Component ---

export default function TrendingRepos() {
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageFilter>('All');

  const queryKey = ['trending-repos', selectedLanguage] as const;

  const { data: repos, isLoading, isError } = useQuery<TrendingRepository[]>({
    queryKey,
    queryFn: async () => {
      const params: Record<string, string> = { limit: '10' };
      if (selectedLanguage !== 'All') {
        params.language = selectedLanguage;
      }
      const response = await api.get<TrendingRepository[]>(
        '/repositories/trending',
        { params }
      );
      return response.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: '#1A1A2E',
        border: '1px solid #2D2D50',
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#2D2D50]">
        <h2 className="text-sm font-semibold text-[#E2E8F0] flex items-center gap-2">
          <svg
            className="w-4 h-4 text-orange-400"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.454 1.675 1.56 3.134L9.647 15.42a1.516 1.516 0 0 1-2.438-1.713l1.526-3.357H6.612c-1.57 0-2.453-1.674-1.56-3.132L9.504.43Z" />
          </svg>
          Trending Repositories
        </h2>
      </div>

      {/* Language Filter */}
      <div className="pt-3">
        <LanguageTabs selected={selectedLanguage} onChange={setSelectedLanguage} />
      </div>

      {/* Content */}
      <div>
        {isLoading &&
          Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}

        {isError && (
          <div className="px-4 py-8 text-center text-sm text-[#8892A4]">
            Failed to load trending repositories. Please try again.
          </div>
        )}

        {!isLoading && !isError && repos && repos.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[#8892A4]">
            No trending repositories found
            {selectedLanguage !== 'All' ? ` for ${selectedLanguage}` : ''}.
          </div>
        )}

        {!isLoading &&
          !isError &&
          repos &&
          repos.length > 0 &&
          repos.map((repo, index) => (
            <RepoRow key={repo.id} repo={repo} rank={index + 1} />
          ))}
      </div>
    </div>
  );
}
