/**
 * Extract a user-friendly error message from an unknown error.
 * Works with Axios errors, standard Errors, and unknown values.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const axiosError = error as Error & {
      response?: { data?: { message?: string; error?: string } }
    }
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message
    }
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error
    }
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unexpected error occurred'
}
