import { Response } from 'express';

/**
 * Standard API response helpers for consistent JSON envelope.
 */

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ ok: false, error: message });
}

export function sendPaginated<T>(
  res: Response,
  results: T[],
  total: number,
  limit: number,
  offset: number,
): void {
  res.json({
    ok: true,
    data: results,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    },
  });
}
