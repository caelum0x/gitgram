import { Router, Response } from 'express';
import { EventEmitter } from 'events';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// ── Internal event bus ────────────────────────────────────────────────────────

const eventBus = new EventEmitter();
// Increase max listeners to accommodate many concurrent connections
eventBus.setMaxListeners(500);

// ── Client registry ───────────────────────────────────────────────────────────

interface SseClient {
  userId: string
  res: Response
}

const clients = new Map<string, SseClient>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendEvent(res: Response, eventType: string, data: unknown): void {
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function removeClient(userId: string): void {
  clients.delete(userId);
  eventBus.emit('clientDisconnected', userId);
}

// ── Public broadcast API ──────────────────────────────────────────────────────

/**
 * Send a real-time event to a specific user.
 * Safe to call even when the user has no active SSE connection.
 */
export function broadcastToUser(
  userId: string,
  eventType: string,
  data: unknown,
): void {
  const client = clients.get(userId);
  if (client) {
    try {
      sendEvent(client.res, eventType, data);
    } catch {
      removeClient(userId);
    }
  }
}

/**
 * Send a real-time event to all connected clients.
 */
export function broadcastToAll(eventType: string, data: unknown): void {
  for (const [userId, client] of clients) {
    try {
      sendEvent(client.res, eventType, data);
    } catch {
      removeClient(userId);
    }
  }
}

/**
 * Returns the number of currently connected SSE clients.
 */
export function connectedClientCount(): number {
  return clients.size;
}

// ── SSE route ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/events:
 *   get:
 *     summary: Subscribe to real-time server-sent events
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SSE stream opened
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  // Close any existing connection for this user (single active stream per user)
  const existing = clients.get(userId);
  if (existing) {
    try {
      existing.res.end();
    } catch {
      // already closed
    }
    clients.delete(userId);
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
  res.flushHeaders();

  clients.set(userId, { userId, res });

  // Send initial connected confirmation
  sendEvent(res, 'connected', { userId, timestamp: new Date().toISOString() });

  // Heartbeat every 30 s to keep the connection alive through proxies
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeatInterval);
      removeClient(userId);
    }
  }, 30_000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    removeClient(userId);
  });

  req.on('error', () => {
    clearInterval(heartbeatInterval);
    removeClient(userId);
  });
});

export default router;
