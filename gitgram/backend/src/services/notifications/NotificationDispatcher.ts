import logger from '../../utils/logger';
import type { NotificationAdapter, NotificationPayload, BulkResult } from './NotificationAdapter';

/**
 * Fan-out dispatcher that forwards every notification to all registered
 * (and configured) adapters.
 *
 * Adapters that are not configured (`isConfigured() === false`) are silently
 * skipped. Adapter failures are logged but never propagate — the existing
 * WebSocket + push notification path is unaffected.
 */
export class NotificationDispatcher {
  private readonly adapters: NotificationAdapter[] = [];

  /** Register an adapter. Unconfigured adapters are accepted but skipped at dispatch time. */
  registerAdapter(adapter: NotificationAdapter): void {
    this.adapters.push(adapter);
    logger.info(`NotificationDispatcher: registered adapter "${adapter.name}"`, {
      configured: adapter.isConfigured(),
    });
  }

  /** Initialize all registered adapters that are configured. */
  async initializeAll(): Promise<void> {
    const configured = this.adapters.filter((a) => a.isConfigured());

    await Promise.all(
      configured.map(async (adapter) => {
        try {
          await adapter.initialize();
        } catch (error: unknown) {
          logger.error(`NotificationDispatcher: failed to initialize "${adapter.name}"`, error);
        }
      }),
    );

    logger.info(`NotificationDispatcher: ${configured.length}/${this.adapters.length} adapters initialized`);
  }

  /**
   * Dispatch a notification to every configured adapter in parallel.
   * Failures are logged but never thrown.
   */
  async dispatch(payload: NotificationPayload): Promise<void> {
    const configured = this.adapters.filter((a) => a.isConfigured());

    if (configured.length === 0) return;

    const results = await Promise.allSettled(
      configured.map((adapter) => adapter.sendNotification(payload)),
    );

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        logger.error(
          `NotificationDispatcher: adapter "${configured[idx].name}" threw unexpectedly`,
          result.reason,
        );
      }
    });
  }

  /**
   * Dispatch many notifications (e.g. digest batch) to every configured adapter.
   */
  async dispatchBulk(payloads: readonly NotificationPayload[]): Promise<BulkResult> {
    const configured = this.adapters.filter((a) => a.isConfigured());

    if (configured.length === 0) return { sent: 0, failed: 0 };

    let totalSent = 0;
    let totalFailed = 0;

    const results = await Promise.allSettled(
      configured.map((adapter) => adapter.sendBulk(payloads)),
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        totalSent += result.value.sent;
        totalFailed += result.value.failed;
      } else {
        totalFailed += payloads.length;
        logger.error(
          `NotificationDispatcher: bulk send failed for "${configured[idx].name}"`,
          result.reason,
        );
      }
    });

    return { sent: totalSent, failed: totalFailed };
  }

  /** Returns the names of all adapters currently registered and configured. */
  getActiveAdapters(): readonly string[] {
    return this.adapters
      .filter((a) => a.isConfigured())
      .map((a) => a.name);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance with all four adapters pre-registered
// ---------------------------------------------------------------------------

import { TelegramAdapter } from './TelegramAdapter';
import { DiscordAdapter } from './DiscordAdapter';
import { SlackAdapter } from './SlackAdapter';
import { EmailAdapter } from './EmailAdapter';

const dispatcher = new NotificationDispatcher();
dispatcher.registerAdapter(new TelegramAdapter());
dispatcher.registerAdapter(new DiscordAdapter());
dispatcher.registerAdapter(new SlackAdapter());
dispatcher.registerAdapter(new EmailAdapter());

export default dispatcher;
