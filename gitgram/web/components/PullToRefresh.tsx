'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
    threshold?: number;
    maxPullDistance?: number;
    refreshingText?: string;
    pullText?: string;
    releaseText?: string;
    disabled?: boolean;
}

export default function PullToRefresh({
    onRefresh,
    children,
    threshold = 80,
    maxPullDistance = 120,
    refreshingText = 'Refreshing...',
    pullText = 'Pull to refresh',
    releaseText = 'Release to refresh',
    disabled = false,
}: PullToRefreshProps) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [startY, setStartY] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const getStatusText = () => {
        if (isRefreshing) return refreshingText;
        if (pullDistance >= threshold) return releaseText;
        return pullText;
    };

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // Only start if we're at the top of the page and not disabled
        if (window.scrollY === 0 && !disabled && !isRefreshing) {
            setStartY(e.touches[0].clientY);
        }
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (startY === 0 || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const distance = currentY - startY;

        // Only pull down
        if (distance > 0 && window.scrollY === 0) {
            // Prevent default scrolling when pulling
            e.preventDefault();

            // Apply resistance to pull distance
            const resistance = 0.5;
            const adjustedDistance = Math.min(distance * resistance, maxPullDistance);
            setPullDistance(adjustedDistance);
        }
    }, [startY, isRefreshing, maxPullDistance]);

    const handleTouchEnd = useCallback(async () => {
        if (pullDistance >= threshold && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(threshold);

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
        setStartY(0);
    }, [pullDistance, threshold, isRefreshing, onRefresh]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const rotation = (pullDistance / threshold) * 360;
    const opacity = Math.min(pullDistance / threshold, 1);

    return (
        <div ref={containerRef} className="relative">
            {/* Pull indicator */}
            <div
                className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center transition-all duration-200"
                style={{
                    height: `${pullDistance}px`,
                    opacity,
                }}
                role="status"
                aria-live="polite"
            >
                <div
                    className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: isRefreshing ? 'none' : 'transform 0.2s',
                        animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                    }}
                />
                {pullDistance > 20 && (
                    <span className="text-xs text-muted mt-1">{getStatusText()}</span>
                )}
            </div>

            {/* Content */}
            <div
                style={{
                    transform: `translateY(${pullDistance}px)`,
                    transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s' : 'none',
                }}
            >
                {children}
            </div>

            <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
        </div>
    );
}

// Hook for pull-to-refresh logic (can be used separately)
export function usePullToRefresh(onRefresh: () => Promise<void>) {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing, onRefresh]);

    return { isRefreshing, refresh };
}
