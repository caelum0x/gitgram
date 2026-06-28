/**
 * E2E global teardown.
 *
 * Disconnects the shared Prisma client so the Jest process can exit cleanly.
 * The database itself is ephemeral (tmpfs / CI service container) and is
 * discarded when the harness is torn down, so no data cleanup is required here.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    // Lazy require so this file has no import-time side effects.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  } catch {
    // Best-effort — nothing to clean up if the client never connected.
  }
}
