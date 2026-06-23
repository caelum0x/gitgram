import { useState, useCallback, useEffect, useRef } from 'react';
import { apiCache, cacheKeys, cacheTTL } from '../utils/apiCache';
import { logger } from '../utils/logger';

interface UseRefreshableDataOptions<T> {
  fetchFn: () => Promise<T>;
  cacheKey?: string;
  cacheTtl?: number;
  initialData?: T | null;
  autoFetch?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseRefreshableDataResult<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setData: (data: T | null) => void;
}

export function useRefreshableData<T>({
  fetchFn,
  cacheKey,
  cacheTtl = cacheTTL.medium,
  initialData = null,
  autoFetch = true,
  onSuccess,
  onError,
}: UseRefreshableDataOptions<T>): UseRefreshableDataResult<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
          // Invalidate cache on refresh
          if (cacheKey) {
            apiCache.invalidate(cacheKey);
          }
        } else {
          setLoading(true);
        }

        setError(null);

        let result: T;

        if (cacheKey && !isRefresh) {
          result = await apiCache.getOrFetch(cacheKey, fetchFn, cacheTtl);
        } else {
          result = await fetchFn();
          if (cacheKey) {
            apiCache.set(cacheKey, result, cacheTtl);
          }
        }

        if (isMounted.current) {
          setData(result);
          onSuccess?.(result);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (isMounted.current) {
          setError(error);
          onError?.(error);
          logger.error('Data fetch error:', error);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [fetchFn, cacheKey, cacheTtl, onSuccess, onError]
  );

  useEffect(() => {
    isMounted.current = true;
    if (autoFetch) {
      fetchData();
    }
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);
  const reload = useCallback(() => fetchData(false), [fetchData]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    reload,
    setData,
  };
}

// Hook for paginated data with pull-to-refresh
interface UsePaginatedDataOptions<T> {
  fetchFn: (page: number, limit: number) => Promise<{ items: T[]; hasMore: boolean }>;
  limit?: number;
  cacheKeyPrefix?: string;
  cacheTtl?: number;
}

interface UsePaginatedDataResult<T> {
  data: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function usePaginatedData<T>({
  fetchFn,
  limit = 20,
  cacheKeyPrefix,
  cacheTtl = cacheTTL.short,
}: UsePaginatedDataOptions<T>): UsePaginatedDataResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  const fetchPage = useCallback(
    async (pageNum: number, isRefresh = false, isLoadMore = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
          if (cacheKeyPrefix) {
            apiCache.invalidatePattern(`${cacheKeyPrefix}:`);
          }
        } else if (isLoadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const cacheKey = cacheKeyPrefix ? `${cacheKeyPrefix}:${pageNum}` : undefined;
        let result: { items: T[]; hasMore: boolean };

        if (cacheKey && !isRefresh) {
          result = await apiCache.getOrFetch(cacheKey, () => fetchFn(pageNum, limit), cacheTtl);
        } else {
          result = await fetchFn(pageNum, limit);
          if (cacheKey) {
            apiCache.set(cacheKey, result, cacheTtl);
          }
        }

        if (isMounted.current) {
          if (isRefresh || pageNum === 1) {
            setData(result.items);
            setPage(1);
          } else {
            setData((prev) => [...prev, ...result.items]);
          }
          setHasMore(result.hasMore);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (isMounted.current) {
          setError(error);
          logger.error('Paginated data fetch error:', error);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [fetchFn, limit, cacheKeyPrefix, cacheTtl]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchPage(1);
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      await fetchPage(nextPage, false, true);
    }
  }, [fetchPage, loadingMore, hasMore, page]);

  return {
    data,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}
