import { useState, useCallback } from 'react';
import { Alert } from 'react-native';

interface UseApiOptions {
  showErrorAlert?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

export function useApi<T = any>(
  apiCall: () => Promise<T>,
  options: UseApiOptions = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [data, setData] = useState<T | null>(null);

  const { showErrorAlert = true, onSuccess, onError } = options;

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || 'An error occurred';
      setError(err);

      if (showErrorAlert) {
        Alert.alert('Error', errorMessage);
      }

      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiCall, showErrorAlert, onSuccess, onError]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
}

