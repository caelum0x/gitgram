// Safe narrowing helpers for values caught in try/catch blocks. TypeScript
// types caught values as `unknown`, so these helpers extract common fields
// without resorting to unsafe casts.

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return 'Unexpected error';
};

export const getErrorName = (error: unknown): string => {
  if (error instanceof Error) {
    return error.name;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string'
  ) {
    return (error as { name: string }).name;
  }

  return '';
};
