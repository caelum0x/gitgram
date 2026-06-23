'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

interface VirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemHeight: number | ((index: number) => number)
  overscan?: number
  className?: string
  onEndReached?: () => void
  endReachedThreshold?: number
  keyExtractor?: (item: T, index: number) => string
  ListEmptyComponent?: React.ReactNode
  ListHeaderComponent?: React.ReactNode
  ListFooterComponent?: React.ReactNode
}

export default function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  overscan = 5,
  className = '',
  onEndReached,
  endReachedThreshold = 200,
  keyExtractor,
  ListEmptyComponent,
  ListHeaderComponent,
  ListFooterComponent,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const hasCalledEndReached = useRef(false)

  // Calculate item heights
  const getItemHeight = useCallback(
    (index: number) => {
      return typeof itemHeight === 'function' ? itemHeight(index) : itemHeight
    },
    [itemHeight]
  )

  // Calculate total height and item offsets
  const { totalHeight, itemOffsets } = useMemo(() => {
    const offsets: number[] = []
    let total = 0

    for (let i = 0; i < items.length; i++) {
      offsets.push(total)
      total += getItemHeight(i)
    }

    return { totalHeight: total, itemOffsets: offsets }
  }, [items.length, getItemHeight])

  // Find visible range
  const { startIndex, endIndex } = useMemo(() => {
    if (items.length === 0) {
      return { startIndex: 0, endIndex: 0 }
    }

    // Binary search for start index
    let start = 0
    let end = items.length - 1

    while (start < end) {
      const mid = Math.floor((start + end) / 2)
      if (itemOffsets[mid] + getItemHeight(mid) < scrollTop) {
        start = mid + 1
      } else {
        end = mid
      }
    }

    const startIdx = Math.max(0, start - overscan)

    // Find end index
    let endIdx = start
    let accumulatedHeight = itemOffsets[start]

    while (endIdx < items.length && accumulatedHeight < scrollTop + containerHeight) {
      accumulatedHeight += getItemHeight(endIdx)
      endIdx++
    }

    endIdx = Math.min(items.length, endIdx + overscan)

    return { startIndex: startIdx, endIndex: endIdx }
  }, [scrollTop, containerHeight, items.length, itemOffsets, getItemHeight, overscan])

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget
      setScrollTop(target.scrollTop)

      // Check if we're near the end
      if (onEndReached) {
        const distanceFromEnd = totalHeight - target.scrollTop - containerHeight
        if (distanceFromEnd < endReachedThreshold && !hasCalledEndReached.current) {
          hasCalledEndReached.current = true
          onEndReached()
        } else if (distanceFromEnd >= endReachedThreshold) {
          hasCalledEndReached.current = false
        }
      }
    },
    [totalHeight, containerHeight, onEndReached, endReachedThreshold]
  )

  // Measure container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)
    setContainerHeight(container.clientHeight)

    return () => resizeObserver.disconnect()
  }, [])

  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      item,
      index: startIndex + index,
      offset: itemOffsets[startIndex + index],
      height: getItemHeight(startIndex + index),
    }))
  }, [items, startIndex, endIndex, itemOffsets, getItemHeight])

  if (items.length === 0 && ListEmptyComponent) {
    return (
      <div ref={containerRef} className={`overflow-auto ${className}`}>
        {ListHeaderComponent}
        {ListEmptyComponent}
        {ListFooterComponent}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onScroll={handleScroll}
    >
      {ListHeaderComponent}

      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ item, index, offset, height }) => (
          <div
            key={keyExtractor ? keyExtractor(item, index) : index}
            style={{
              position: 'absolute',
              top: offset,
              left: 0,
              right: 0,
              height,
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>

      {ListFooterComponent}
    </div>
  )
}

// Simpler infinite scroll hook
export function useInfiniteScroll(
  callback: () => void,
  options?: {
    threshold?: number
    disabled?: boolean
  }
) {
  const observerRef = useRef<HTMLDivElement>(null)
  const { threshold = 100, disabled = false } = options || {}

  useEffect(() => {
    if (disabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          callback()
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    )

    const current = observerRef.current
    if (current) {
      observer.observe(current)
    }

    return () => {
      if (current) {
        observer.unobserve(current)
      }
    }
  }, [callback, threshold, disabled])

  return observerRef
}

// Load more trigger component
export function LoadMoreTrigger({
  onLoadMore,
  loading = false,
  hasMore = true,
  threshold = 100,
}: {
  onLoadMore: () => void
  loading?: boolean
  hasMore?: boolean
  threshold?: number
}) {
  const triggerRef = useInfiniteScroll(onLoadMore, {
    threshold,
    disabled: loading || !hasMore,
  })

  if (!hasMore) return null

  return (
    <div ref={triggerRef} className="flex justify-center py-4">
      {loading && (
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  )
}
