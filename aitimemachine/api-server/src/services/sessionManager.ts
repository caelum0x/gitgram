import { Request } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, lt, or, desc } from "drizzle-orm";
import { DeviceInfo } from "../db/schema.js";
import { logger } from "../lib/monitoring.js";

// Session configuration
const SESSION_EXPIRY_DAYS = 30;
const SESSION_CLEANUP_BATCH_SIZE = 100;

// Types
export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: DeviceInfo | null;
  lastActiveAt: Date | null;
  expiresAt: Date;
  createdAt: Date | null;
  isCurrent?: boolean;
}

export interface CreateSessionResult {
  sessionId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Parse user agent to extract device information
 */
function parseUserAgent(userAgent: string | undefined): DeviceInfo {
  if (!userAgent) {
    return {};
  }

  const info: DeviceInfo = {};

  // Detect browser
  if (userAgent.includes("Firefox")) {
    info.browser = "Firefox";
  } else if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    info.browser = "Chrome";
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    info.browser = "Safari";
  } else if (userAgent.includes("Edg")) {
    info.browser = "Edge";
  } else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
    info.browser = "Opera";
  }

  // Detect OS
  if (userAgent.includes("Windows")) {
    info.os = "Windows";
  } else if (userAgent.includes("Mac OS")) {
    info.os = "macOS";
  } else if (userAgent.includes("Linux")) {
    info.os = "Linux";
  } else if (userAgent.includes("Android")) {
    info.os = "Android";
  } else if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    info.os = "iOS";
  }

  // Detect device type
  const mobileIndicators = ["Mobile", "Android", "iPhone", "iPad", "iPod"];
  info.isMobile = mobileIndicators.some((indicator) => userAgent.includes(indicator));

  if (info.isMobile) {
    if (userAgent.includes("iPad")) {
      info.device = "iPad";
    } else if (userAgent.includes("iPhone")) {
      info.device = "iPhone";
    } else if (userAgent.includes("Android")) {
      info.device = "Android Device";
    } else {
      info.device = "Mobile Device";
    }
  } else {
    info.device = "Desktop";
  }

  return info;
}

/**
 * Get client IP from request (handles proxies)
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
  return `sess_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Hash a session token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: string,
  req: Request
): Promise<CreateSessionResult> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const sessionId = generateSessionId();
  const userAgent = req.headers["user-agent"];
  const ipAddress = getClientIp(req);
  const deviceInfo = parseUserAgent(userAgent);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    tokenHash,
    ipAddress,
    userAgent: userAgent || null,
    deviceInfo,
    expiresAt,
    lastActiveAt: new Date(),
  });

  return {
    sessionId,
    token,
    expiresAt,
  };
}

/**
 * Validate a session token and return session info
 */
export async function validateSession(
  token: string
): Promise<SessionInfo | null> {
  if (!token || !token.startsWith("sess_")) {
    return null;
  }

  const tokenHash = hashToken(token);

  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        eq(schema.sessions.revoked, false)
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    // Mark as revoked since it's expired
    await db
      .update(schema.sessions)
      .set({ revoked: true, revokedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    deviceInfo: session.deviceInfo,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(schema.sessions)
    .set({ revoked: true, revokedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.userId, userId),
        eq(schema.sessions.revoked, false)
      )
    );

  // Drizzle returns the result, but for neon-http we check rowCount
  // Since we're using neon-http, we just return true if no error was thrown
  return true;
}

/**
 * Revoke all sessions for a user, optionally except the current one
 */
export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string
): Promise<number> {
  const now = new Date();

  if (exceptSessionId) {
    // Get sessions to revoke (excluding current)
    const sessionsToRevoke = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, userId),
          eq(schema.sessions.revoked, false)
        )
      );

    const idsToRevoke = sessionsToRevoke
      .filter((s: { id: string }) => s.id !== exceptSessionId)
      .map((s: { id: string }) => s.id);

    if (idsToRevoke.length === 0) {
      return 0;
    }

    // Revoke each session individually (neon-http doesn't support IN clause easily)
    for (const id of idsToRevoke) {
      await db
        .update(schema.sessions)
        .set({ revoked: true, revokedAt: now })
        .where(eq(schema.sessions.id, id));
    }

    return idsToRevoke.length;
  } else {
    // Revoke all sessions
    const sessionsToRevoke = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, userId),
          eq(schema.sessions.revoked, false)
        )
      );

    for (const session of sessionsToRevoke) {
      await db
        .update(schema.sessions)
        .set({ revoked: true, revokedAt: now })
        .where(eq(schema.sessions.id, session.id));
    }

    return sessionsToRevoke.length;
  }
}

/**
 * Update the last activity timestamp for a session
 */
export async function updateActivity(sessionId: string): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(
  userId: string,
  currentSessionId?: string
): Promise<SessionInfo[]> {
  const userSessions = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        eq(schema.sessions.revoked, false)
      )
    )
    .orderBy(desc(schema.sessions.lastActiveAt));

  const now = new Date();

  // Filter out expired sessions and map to SessionInfo
  return userSessions
    .filter((session: typeof schema.sessions.$inferSelect) => session.expiresAt > now)
    .map((session: typeof schema.sessions.$inferSelect) => ({
      id: session.id,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceInfo: session.deviceInfo,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      isCurrent: session.id === currentSessionId,
    }));
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpired(): Promise<number> {
  const now = new Date();

  // Find expired sessions
  const expiredSessions = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(
      or(
        lt(schema.sessions.expiresAt, now),
        and(
          eq(schema.sessions.revoked, true),
          lt(schema.sessions.revokedAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) // Revoked more than 7 days ago
        )
      )
    )
    .limit(SESSION_CLEANUP_BATCH_SIZE);

  if (expiredSessions.length === 0) {
    return 0;
  }

  // Delete expired sessions
  for (const session of expiredSessions) {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, session.id));
  }

  return expiredSessions.length;
}

/**
 * Get session by ID (for internal use)
 */
export async function getSessionById(sessionId: string): Promise<SessionInfo | null> {
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    deviceInfo: session.deviceInfo,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
}

// ============================================================================
// Geo-IP Location Service
// ============================================================================

interface GeoIPResponse {
  status: string;
  country?: string;
  regionName?: string;
  city?: string;
  message?: string;
}

interface GeoIPCache {
  location: string;
  timestamp: number;
}

const geoIPCache = new Map<string, GeoIPCache>();
const GEO_IP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const GEO_IP_TIMEOUT = 2000; // 2 seconds

/**
 * Get location from IP address using ip-api.com (free tier, 45 requests/minute)
 * Falls back to ipapi.co if ip-api.com fails
 */
export async function getLocationFromIp(ipAddress: string | null): Promise<string> {
  if (!ipAddress || ipAddress === "unknown" || ipAddress === "::1" || ipAddress === "127.0.0.1") {
    return "Local";
  }

  // Check cache first
  const cached = geoIPCache.get(ipAddress);
  if (cached && Date.now() - cached.timestamp < GEO_IP_CACHE_TTL) {
    return cached.location;
  }

  try {
    // Try ip-api.com first (free, no API key needed, 45 req/min)
    const location = await fetchFromIpApi(ipAddress);
    if (location) {
      geoIPCache.set(ipAddress, { location, timestamp: Date.now() });
      return location;
    }

    // Fallback to ipapi.co (free tier, 1000 req/day)
    const fallbackLocation = await fetchFromIpapiCo(ipAddress);
    if (fallbackLocation) {
      geoIPCache.set(ipAddress, { location: fallbackLocation, timestamp: Date.now() });
      return fallbackLocation;
    }
  } catch (error) {
    logger.error("GeoIP lookup failed", error instanceof Error ? error : undefined, { details: String(error) });
  }

  return "Unknown Location";
}

/**
 * Fetch location from ip-api.com
 */
async function fetchFromIpApi(ip: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEO_IP_TIMEOUT);

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,message`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data: GeoIPResponse = await response.json();
    if (data.status !== "success") return null;

    // Build location string
    const parts: string[] = [];
    if (data.city) parts.push(data.city);
    if (data.regionName && data.regionName !== data.city) parts.push(data.regionName);
    if (data.country) parts.push(data.country);

    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

/**
 * Fetch location from ipapi.co (fallback)
 */
async function fetchFromIpapiCo(ip: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEO_IP_TIMEOUT);

    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = (await response.json()) as {
      city?: string;
      region?: string;
      country_name?: string;
      error?: boolean;
    };
    if (data.error) return null;

    const parts: string[] = [];
    if (data.city) parts.push(data.city);
    if (data.region && data.region !== data.city) parts.push(data.region);
    if (data.country_name) parts.push(data.country_name);

    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous version for backwards compatibility
 * Returns cached value or "Unknown Location" if not cached
 */
export function getLocationFromIpSync(ipAddress: string | null): string {
  if (!ipAddress || ipAddress === "unknown" || ipAddress === "::1" || ipAddress === "127.0.0.1") {
    return "Local";
  }

  const cached = geoIPCache.get(ipAddress);
  if (cached && Date.now() - cached.timestamp < GEO_IP_CACHE_TTL) {
    return cached.location;
  }

  // Trigger async lookup for next time
  getLocationFromIp(ipAddress).catch(() => {});

  return "Unknown Location";
}

/**
 * Clear the geo-IP cache
 */
export function clearGeoIPCache(): void {
  geoIPCache.clear();
}

/**
 * Get cache statistics
 */
export function getGeoIPCacheStats(): { size: number; entries: string[] } {
  return {
    size: geoIPCache.size,
    entries: Array.from(geoIPCache.keys()),
  };
}
