'use client';

import { useState } from 'react';
import Link from 'next/link';
import { repoService } from '@/services/repoService';
import { buildRepoPath } from '@/utils/repositoryRouting';
import RepoTextQuickActions from '@/components/repo/RepoTextQuickActions';

interface RepoCardProps {
  repo: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    description?: string;
    stars: number;
    forks: number;
    language?: string;
    isFollowing?: boolean;
  };
}

export default function RepoCard({ repo }: RepoCardProps) {
  const [isFollowing, setIsFollowing] = useState(repo.isFollowing || false);

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (isFollowing) {
        await repoService.unfollow(repo.owner, repo.name);
      } else {
        await repoService.follow(repo.owner, repo.name);
      }
      setIsFollowing(!isFollowing);
    } catch (err) {
      console.error('Follow error', err);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await repoService.shareRepo(repo.owner, repo.name);
    } catch (err) {
      console.error('Share error', err);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-300 transition">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-purple-500 flex items-center justify-center text-xl">
          📦
        </div>
        <div className="flex-1 min-w-0">
          <Link href={buildRepoPath(repo.owner, repo.name)} className="font-semibold hover:underline">
            {repo.fullName}
          </Link>
          {repo.description && (
            <p className="text-sm text-gray-500 truncate">{repo.description}</p>
          )}
        </div>
        <button
          onClick={handleFollow}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            isFollowing
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500">
        <span>⭐ {repo.stars >= 1000 ? `${(repo.stars/1000).toFixed(0)}k` : repo.stars}</span>
        <span>🍴 {repo.forks >= 1000 ? `${(repo.forks/1000).toFixed(0)}k` : repo.forks}</span>
        {repo.language && <span>💻 {repo.language}</span>}
        <RepoTextQuickActions
          owner={repo.owner}
          name={repo.name}
          className="ml-auto"
          buttonClassName="border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:text-blue-300"
        />
        <button 
          onClick={handleShare}
          className="hover:text-blue-500"
        >
          📤
        </button>
      </div>
    </div>
  );
}
