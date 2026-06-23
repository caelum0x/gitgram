'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface StoryItem {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  text?: string;
  duration: number;
  createdAt: string;
}

interface StoryViewerProps {
  stories: StoryItem[];
  startIndex: number;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function StoryViewer({ stories, startIndex, onClose }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(
    Math.max(0, Math.min(startIndex, stories.length - 1))
  );
  const [progress, setProgress] = useState<number>(0);
  const [paused, setPaused] = useState<boolean>(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentStory = stories[currentIndex];

  const clearProgressInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < stories.length - 1) return prev + 1;
      onClose();
      return prev;
    });
    setProgress(0);
  }, [stories.length, onClose]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setProgress(0);
  }, []);

  // Start/restart progress animation
  useEffect(() => {
    clearProgressInterval();
    setProgress(0);

    if (paused) return;

    const tickMs = 50;
    const totalTicks = (currentStory.duration * 1000) / tickMs;

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 100 / totalTicks;
        if (next >= 100) {
          clearProgressInterval();
          goToNext();
          return 100;
        }
        return next;
      });
    }, tickMs);

    return () => clearProgressInterval();
  }, [currentIndex, paused, currentStory.duration, clearProgressInterval, goToNext]);

  // Pause/resume video when paused state changes
  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => undefined);
    }
  }, [paused]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNext, goToPrev]);

  // Tap navigation (left half = prev, right half = next)
  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 2) {
        goToPrev();
      } else {
        goToNext();
      }
    },
    [goToPrev, goToNext]
  );

  // Long press handlers
  const handlePointerDown = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setPaused(true);
    }, 200);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPaused(false);
  }, []);

  // Touch swipe (left/right)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    longPressTimerRef.current = setTimeout(() => {
      setPaused(true);
    }, 200);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setPaused(false);

      if (touchStartXRef.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;

      if (Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    },
    [goToNext, goToPrev]
  );

  if (!currentStory) return null;

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Story by @${currentStory.username}`}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
        {stories.map((story, i) => (
          <div
            key={story.id}
            className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-white rounded-full"
              style={{
                width:
                  i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? `${progress}%`
                    : '0%',
                transition: i === currentIndex ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-4 left-0 right-0 flex items-center gap-3 px-4 pt-4 z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentStory.avatar}
          alt={currentStory.username}
          className="w-9 h-9 rounded-full border-2 border-white object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              `https://ui-avatars.com/api/?name=${encodeURIComponent(currentStory.username)}&background=6366f1&color=fff`;
          }}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-white text-sm font-semibold">@{currentStory.username}</span>
          <span className="text-white/70 text-xs">{timeAgo(currentStory.createdAt)}</span>
        </div>
        <button
          className="ml-auto text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          onClick={onClose}
          aria-label="Close story viewer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Media + tap/swipe layer */}
      <div
        className="relative w-full h-full flex items-center justify-center cursor-pointer"
        onClick={handleTap}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {currentStory.mediaType === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentStory.mediaUrl}
            alt="Story media"
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <video
            ref={videoRef}
            src={currentStory.mediaUrl}
            className="w-full h-full object-contain"
            autoPlay
            muted
            playsInline
            loop={false}
            onEnded={goToNext}
          />
        )}
      </div>

      {/* Text overlay */}
      {currentStory.text ? (
        <div className="absolute bottom-16 left-0 right-0 px-4 pointer-events-none z-10">
          <p className="text-white text-center text-base font-medium drop-shadow-lg bg-black/30 rounded-xl px-4 py-2 backdrop-blur-sm">
            {currentStory.text}
          </p>
        </div>
      ) : null}

      {/* Paused indicator */}
      {paused ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="bg-black/40 rounded-full p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </div>
        </div>
      ) : null}
    </div>
  );
}
