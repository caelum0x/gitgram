'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface StoryUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  hasUnread: boolean;
}

interface StoriesRingProps {
  onUserClick?: (userId: string) => void;
}

async function fetchStoriesFeed(): Promise<StoryUser[]> {
  const { data } = await api.get<StoryUser[]>('/api/v1/stories/feed');
  return Array.isArray(data) ? data : [];
}

function AvatarFallback({ username }: { username: string }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  return (
    <div
      className="w-full h-full flex items-center justify-center bg-gray-700 text-white text-xl font-semibold rounded-full select-none"
      aria-label={username}
    >
      {initial}
    </div>
  );
}

interface StoryAvatarProps {
  user: StoryUser;
  onClick: (userId: string) => void;
}

function StoryAvatar({ user, onClick }: StoryAvatarProps) {
  const { userId, username, avatarUrl, hasUnread } = user;

  return (
    <button
      type="button"
      onClick={() => onClick(userId)}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 focus:outline-none"
      aria-label={`View ${username}'s story`}
    >
      <div
        className="p-[2.5px] rounded-full"
        style={
          hasUnread
            ? {
                background:
                  'linear-gradient(to bottom right, #7C3AED, #4F46E5)',
              }
            : { background: '#374151' }
        }
      >
        <div className="bg-black p-[2px] rounded-full">
          <div className="relative w-16 h-16 rounded-full overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={username}
                fill
                sizes="64px"
                className="object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-full h-full"
              style={{ display: avatarUrl ? 'none' : 'flex' }}
            >
              <AvatarFallback username={username} />
            </div>
          </div>
        </div>
      </div>
      <span
        className="text-xs max-w-[72px] truncate leading-tight"
        style={{ color: '#94A3B8' }}
      >
        {username}
      </span>
    </button>
  );
}

function YourStoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 focus:outline-none"
      aria-label="Add to your story"
    >
      <div className="relative">
        <div className="p-[2.5px] rounded-full" style={{ background: '#374151' }}>
          <div className="bg-black p-[2px] rounded-full">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center">
              <span className="text-gray-500 text-2xl select-none">&#9679;</span>
            </div>
          </div>
        </div>
        <span
          className="absolute bottom-0 right-0 w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-white text-xs font-bold leading-none"
          style={{ background: '#4F46E5' }}
          aria-hidden="true"
        >
          +
        </span>
      </div>
      <span
        className="text-xs max-w-[72px] truncate leading-tight"
        style={{ color: '#94A3B8' }}
      >
        Your Story
      </span>
    </button>
  );
}

function StoriesRingSkeletons() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="w-[75px] h-[75px] rounded-full bg-gray-800 animate-pulse" />
          <div className="w-12 h-3 rounded bg-gray-800 animate-pulse" />
        </div>
      ))}
    </>
  );
}

export default function StoriesRing({ onUserClick }: StoriesRingProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: stories, isLoading } = useQuery<StoryUser[], Error>({
    queryKey: ['stories', 'feed'],
    queryFn: fetchStoriesFeed,
    refetchInterval: 30_000,
    staleTime: 30_000,
    retry: 1,
  });

  function handleStoryClick(userId: string) {
    onUserClick?.(userId);
  }

  function handleYourStoryClick() {
    // no-op: parent handles navigation if needed
  }

  return (
    <div className="w-full overflow-hidden" style={{ background: 'transparent' }}>
      <div
        ref={scrollRef}
        className="flex items-start gap-4 overflow-x-auto py-3 px-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <YourStoryButton onClick={handleYourStoryClick} />

        {isLoading && <StoriesRingSkeletons />}

        {!isLoading &&
          stories?.map((user) => (
            <StoryAvatar
              key={user.userId}
              user={user}
              onClick={handleStoryClick}
            />
          ))}
      </div>
    </div>
  );
}
