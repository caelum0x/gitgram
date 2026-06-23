/**
 * queryOptimizer.ts
 *
 * Utility functions for common database query patterns:
 * pagination parsing, safe ordering, full-text search conditions,
 * and cursor-based pagination — all returning parameterized SQL fragments.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PaginationOptions {
  page: number;
  limit: number;
  cursor: string | undefined;
}

export interface OrderByClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface SqlCondition {
  sql: string;
  params: string[];
}

// ---------------------------------------------------------------------------
// 1. paginationFromQuery
// ---------------------------------------------------------------------------

/**
 * Parses and validates pagination query parameters.
 *
 * @param query - Raw query params from the request (all values optional).
 * @returns Validated {@link PaginationOptions} with safe defaults.
 *
 * Rules:
 *  - `page`   defaults to 1, capped at 100
 *  - `limit`  defaults to 20, capped at 100
 *  - `cursor` must be a valid ISO 8601 string or is left undefined
 */
export function paginationFromQuery(query: {
  page?: string;
  limit?: string;
  cursor?: string;
}): PaginationOptions {
  const parsedPage = parseInt(query.page ?? '1', 10);
  const parsedLimit = parseInt(query.limit ?? '20', 10);

  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(1, parsedPage), 100) : 1;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(1, parsedLimit), 100) : 20;

  let cursor: string | undefined;
  if (query.cursor) {
    const date = new Date(query.cursor);
    cursor = isNaN(date.getTime()) ? undefined : query.cursor;
  }

  return { page, limit, cursor };
}

// ---------------------------------------------------------------------------
// 2. buildOrderBy
// ---------------------------------------------------------------------------

/**
 * Parses a sort string into a safe {@link OrderByClause}.
 *
 * Accepted formats:
 *  - `"field"`       → `{ field, direction: 'DESC' }`
 *  - `"field:asc"`  → `{ field, direction: 'ASC' }`
 *  - `"field:desc"` → `{ field, direction: 'DESC' }`
 *
 * Falls back to `{ field: 'created_at', direction: 'DESC' }` when the
 * requested field is not in `allowedFields`.
 *
 * @param sortBy        - Raw sort string from query params.
 * @param allowedFields - Whitelist of column names.
 */
export function buildOrderBy(
  sortBy: string,
  allowedFields: string[],
): OrderByClause {
  const fallback: OrderByClause = { field: 'created_at', direction: 'DESC' };

  if (!sortBy) return fallback;

  const [rawField, rawDir] = sortBy.split(':');
  const field = rawField.trim();

  if (!allowedFields.includes(field)) return fallback;

  const direction: 'ASC' | 'DESC' =
    rawDir?.trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return { field, direction };
}

// ---------------------------------------------------------------------------
// 3. buildSearchCondition
// ---------------------------------------------------------------------------

/**
 * Generates a parameterized ILIKE OR clause for multi-field full-text search.
 *
 * Returns an empty condition (`sql: '1=1'`, `params: []`) when `query` is blank
 * or `fields` is empty, so the result can always be safely appended with AND.
 *
 * @param query  - User-supplied search string.
 * @param fields - Column names to search across.
 *
 * @example
 *   const { sql, params } = buildSearchCondition('octocat', ['login', 'bio']);
 *   // sql    → "(login ILIKE $1 OR bio ILIKE $1)"
 *   // params → ['%octocat%']
 */
export function buildSearchCondition(query: string, fields: string[]): SqlCondition {
  const trimmed = query.trim();

  if (!trimmed || fields.length === 0) {
    return { sql: '1=1', params: [] };
  }

  const pattern = `%${trimmed}%`;
  const clauses = fields.map((field, index) => `${field} ILIKE $${index + 1}`);

  return {
    sql: `(${clauses.join(' OR ')})`,
    params: fields.map(() => pattern),
  };
}

// ---------------------------------------------------------------------------
// 4. buildCursorCondition
// ---------------------------------------------------------------------------

/**
 * Generates a parameterized WHERE clause for cursor-based pagination.
 *
 * Assumes descending order: the next page starts at rows *older than* the
 * cursor timestamp. Returns an empty condition when `cursor` is undefined so
 * the first page fetches without any extra WHERE predicate.
 *
 * @param cursor - ISO 8601 timestamp cursor (value of the last seen row's field).
 * @param field  - Column name used as the cursor (e.g. `'created_at'`).
 *
 * @example
 *   const { sql, params } = buildCursorCondition('2024-01-15T12:00:00Z', 'created_at');
 *   // sql    → "created_at < $1"
 *   // params → ['2024-01-15T12:00:00Z']
 */
export function buildCursorCondition(
  cursor: string | undefined,
  field: string,
): SqlCondition {
  if (!cursor) {
    return { sql: '1=1', params: [] };
  }

  return {
    sql: `${field} < $1`,
    params: [cursor],
  };
}
