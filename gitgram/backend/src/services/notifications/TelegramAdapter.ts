import logger from '../../utils/logger';
import type {
  NotificationAdapter,
  NotificationPayload,
  AdapterCapabilities,
  BulkResult,
  NotificationType,
} from './NotificationAdapter';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Emoji prefix per notification type */
const TYPE_EMOJI: Record<NotificationType, string> = {
  like: '\u2764\ufe0f',
  comment: '\ud83d\udcac',
  follow: '\ud83d\udc65',
  mention: '\ud83d\udce2',
  message: '\u2709\ufe0f',
  system: '\u2699\ufe0f',
};

interface TelegramSendMessageBody {
  chat_id: string;
  text: string;
  parse_mode: 'HTML';
  reply_markup?: {
    inline_keyboard: ReadonlyArray<
      ReadonlyArray<{ text: string; url: string }>
    >;
  };
}

/**
 * Telegram Bot API adapter.
 *
 * Requires:
 *   - `TELEGRAM_BOT_TOKEN` env var
 *   - Each user must have a linked Telegram chat ID (passed via `payload.data.telegramChatId`)
 */
export class TelegramAdapter implements NotificationAdapter {
  readonly name = 'telegram';
  readonly capabilities: AdapterCapabilities = {
    richFormatting: true,
    threads: false,
    reactions: false,
    fileUpload: true,
  };

  private token: string | undefined;

  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }

  async initialize(): Promise<void> {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    if (!this.token) {
      logger.warn('TelegramAdapter: TELEGRAM_BOT_TOKEN not set — adapter disabled');
      return;
    }
    logger.info('TelegramAdapter initialized');
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    if (!this.token) return false;

    const chatId = payload.data?.telegramChatId;
    if (typeof chatId !== 'string' || chatId.length === 0) {
      logger.debug(`TelegramAdapter: no chatId for user ${payload.userId}, skipping`);
      return false;
    }

    try {
      const body = this.buildMessage(payload, chatId);

      const res = await fetch(`${TELEGRAM_API_BASE}/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`TelegramAdapter: API error ${res.status}`, { response: text });
        return false;
      }

      logger.debug(`TelegramAdapter: notification sent to chat ${chatId}`);
      return true;
    } catch (error: unknown) {
      logger.error('TelegramAdapter: send failed', error);
      return false;
    }
  }

  async sendBulk(payloads: readonly NotificationPayload[]): Promise<BulkResult> {
    let sent = 0;
    let failed = 0;

    // Telegram Bot API doesn't support batch — serial send with rate awareness
    for (const payload of payloads) {
      const ok = await this.sendNotification(payload);
      if (ok) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildMessage(
    payload: NotificationPayload,
    chatId: string,
  ): TelegramSendMessageBody {
    const emoji = TYPE_EMOJI[payload.type];
    const text = `${emoji} <b>${this.escapeHtml(payload.title)}</b>\n\n${this.escapeHtml(payload.body)}`;

    const message: TelegramSendMessageBody = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };

    if (payload.url) {
      message.reply_markup = {
        inline_keyboard: [[{ text: 'Open in Gitgram', url: payload.url }]],
      };
    }

    return message;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
