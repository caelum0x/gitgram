/**
 * useOptimisticMutation — a reusable React Query hook that:
 *   1. Immediately updates local cache state (optimistic update)
 *   2. Sends the API request in the background
 *   3. Rolls back on error
 *
 * Adapted from munia's per-action mutation hooks (usePostLikesMutations,
 * useFollowsMutations, etc.) into a single generic helper that works with
 * Gitgram's existing like/comment/follow actions.
 *
 * Usage:
 *   const { mutate } = useOptimisticMutation({
 *     queryKey: ['posts', postId],
 *     mutationFn: () => postService.likePost(postId),
 *     updater: (old) => ({ ...old, isLiked: true, likesCount: old.likesCount + 1 }),
 *   })
 */

import { useMutation, useQueryClient, QueryKey } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

/** Type guard for Axios-style 409 errors */
function isAxios409(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const obj = err as { response?: { status?: number } }
  return obj.response?.status === 409
}

/** Configuration for a single optimistic mutation. */
interface UseOptimisticMutationOptions<TData, TVariables = void> {
  /** The React Query cache key that holds the data to optimistically update. */
  queryKey: QueryKey

  /** The actual API call to execute in the background. */
  mutationFn: (variables: TVariables) => Promise<unknown>

  /**
   * A pure function that returns the *new* cache value given the previous one.
   * Must be side-effect free (no mutation of `prev`).
   */
  updater: (prev: TData, variables: TVariables) => TData

  /** Optional callback when the mutation succeeds (after the API responds). */
  onSuccess?: (data: unknown, variables: TVariables) => void

  /** Optional callback when the mutation fails (rollback already happened). */
  onError?: (error: Error, variables: TVariables) => void

  /**
   * If true, 409 Conflict responses are treated as success (idempotent
   * actions like liking an already-liked post should not roll back).
   * Default: false.
   */
  ignore409?: boolean
}

export function useOptimisticMutation<TData, TVariables = void>({
  queryKey,
  mutationFn,
  updater,
  onSuccess,
  onError,
  ignore409 = false,
}: UseOptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient()

  // Ref to hold the snapshot for rollback (avoids stale closure issues)
  const snapshotRef = useRef<TData | undefined>(undefined)

  const mutation = useMutation<unknown, Error, TVariables, { previousData: TData | undefined }>({
    mutationFn: async (variables: TVariables) => {
      try {
        return await mutationFn(variables)
      } catch (err: unknown) {
        // Treat 409 as success when configured (adapted from munia's like mutation)
        if (ignore409 && isAxios409(err)) {
          return undefined
        }
        throw err
      }
    },

    onMutate: async (variables: TVariables) => {
      // Cancel in-flight queries to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey })

      // Snapshot current value for potential rollback
      const previousData = queryClient.getQueryData<TData>(queryKey)
      snapshotRef.current = previousData

      // Apply optimistic update immutably
      if (previousData !== undefined) {
        queryClient.setQueryData<TData>(queryKey, updater(previousData, variables))
      }

      return { previousData }
    },

    onError: (error: Error, variables: TVariables, context) => {
      // Rollback to the snapshot
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData)
      }
      onError?.(error, variables)
    },

    onSuccess: (data: unknown, variables: TVariables) => {
      onSuccess?.(data, variables)
    },

    onSettled: () => {
      // Refetch to ensure server state consistency
      queryClient.invalidateQueries({ queryKey })
    },
  })

  // Convenience wrapper that preserves the same API surface
  const mutate = useCallback(
    (variables: TVariables) => mutation.mutate(variables),
    [mutation]
  )

  return {
    mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
