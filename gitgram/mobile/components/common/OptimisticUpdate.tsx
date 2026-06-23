import React from 'react';

// Hook for optimistic UI updates
export function useOptimisticUpdate<T>(
  initialData: T,
  updateFn: (data: T) => Promise<T>
) {
  const [data, setData] = React.useState<T>(initialData);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const update = React.useCallback(
    async (optimisticData: T) => {
      // Optimistically update UI
      setData(optimisticData);
      setIsUpdating(true);

      try {
        // Perform actual update
        const result = await updateFn(optimisticData);
        setData(result);
        return result;
      } catch (error) {
        // Revert on error
        setData(initialData);
        throw error;
      } finally {
        setIsUpdating(false);
      }
    },
    [updateFn, initialData]
  );

  return { data, update, isUpdating };
}

