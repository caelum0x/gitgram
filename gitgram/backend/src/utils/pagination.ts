// Cursor-based pagination utilities

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  orderBy?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const createCursor = (id: string, createdAt: Date): string => {
  return Buffer.from(`${id}:${createdAt.getTime()}`).toString('base64');
};

export const parseCursor = (cursor: string): { id: string; timestamp: number } => {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  const [id, timestamp] = decoded.split(':');
  return { id, timestamp: parseInt(timestamp, 10) };
};

export const getPaginationParams = (params: CursorPaginationParams) => {
  const limit = Math.min(params.limit || 20, 50); // Max 50 items per page
  const orderBy = params.orderBy || 'desc';

  let cursor: { id: string; timestamp: number } | null = null;
  if (params.cursor) {
    try {
      cursor = parseCursor(params.cursor);
    } catch (error) {
      cursor = null;
    }
  }

  return { limit, orderBy, cursor };
};

