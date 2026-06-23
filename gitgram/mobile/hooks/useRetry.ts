import { useState, useCallback } from 'react';

interface UseRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  onRetry?: (attempt: number) => void;
}

export function useRetry<T>(
  fn: () => Promise<T>,
  options: UseRetryOptions = {}
) {
  const { maxRetries = 3, retryDelay = 1000, onRetry } = options;
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (): Promise<T> => {
    setLoading(true);
    let lastError: any;

    for (let i = 0; i <= maxRetries; i++) {
      setAttempt(i);
      try {
        const result = await fn();
        setLoading(false);
        return result;
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          onRetry?.(i + 1);
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (i + 1)));
        }
      }
    }

    setLoading(false);
    throw lastError;
  }, [fn, maxRetries, retryDelay, onRetry]);

  return { execute, loading, attempt };
}

