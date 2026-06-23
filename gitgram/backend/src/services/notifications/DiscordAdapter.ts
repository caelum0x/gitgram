import logger from '../../utils/logger';
import type {
  NotificationAdapter,
  NotificationPayload,
  AdapterCapabilities,
  BulkResult,
  NotificationType,
} from './NotificationAdapter';

/** Discord embed colour per notification type (decimal format) */
const TYPE_COLOR: Record<NotificationType, number> = {
  like: 0xe74c3c,    // red
  comment: 0x3498db,  // blue
  follow: 0x2ecc71,   // green
  mention: 0xf39c12,  // orange
  message: 0x9b59b6,  // purple
  system: 0x95a5a6,   // grey
};

const TYPE_LABEL: Record<NotificationType, string> = {
  like: 'Like',
  comment: 'Comment',
  follow: 'Follow',
  mention: 'Mention',
  message: 'Message',
  system: 'System',
};

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  url?: string;
  footer: { text: string };
  timestamp: string;
}

interface DiscordWebhookBody {
  embeds: readonly DiscordEmbed[];
}

/**
 * Discord adapter — supports webhook-based and DM-based delivery.
 *
 * Env vars:
 *   - `DISCORD_WEBHOOK_URL`  — Incoming Webhook URL (channel notifications)
 *   - `DISCORD_BOT_TOKEN`    — Bot token for DMs (optional, uses `payload.data.discordUserId`)
 */
export class DiscordAdapter implements NotificationAdapter {
  readonly name = 'discord';
  readonly capabilities: AdapterCapabilities = {
    richFormatting: true,
    threads: true,
    reactions: true,
    fileUpload: true,
  };

  private webhookUrl: string | undefined;
  private botToken: string | undefined;

  isConfigured(): boolean {
    return Boolean(process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_TOKEN);
  }

  async initialize(): Promise<void> {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    this.botToken = process.env.DISCORD_BOT_TOKEN;

    if (!this.webhookUrl && !this.botToken) {
      logger.warn('DiscordAdapter: no DISCORD_WEBHOOK_URL or DISCORD_BOT_TOKEN — adapter disabled');
      return;
    }

    logger.info('DiscordAdapter initialized', {
      webhook: Boolean(this.webhookUrl),
      bot: Boolean(this.botToken),
    });
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    // Prefer DM via bot if the user has linked their Discord account
    const discordUserId = payload.data?.discordUserId;
    if (this.botToken && typeof discordUserId === 'string' && discordUserId.length > 0) {
      return this.sendDm(payload, discordUserId);
    }

    // Fall back to webhook (channel message)
    if (this.webhookUrl) {
      return this.sendWebhook(payload);
    }

    return false;
  }

  async sendBulk(payloads: readonly NotificationPayload[]): Promise<BulkResult> {
    let sent = 0;
    let failed = 0;

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

  private buildEmbed(payload: NotificationPayload): DiscordEmbed {
    const embed: DiscordEmbed = {
      title: payload.title,
      description: payload.body,
      color: TYPE_COLOR[payload.type],
      footer: { text: `Gitgram · ${TYPE_LABEL[payload.type]}` },
      timestamp: new Date().toISOString(),
    };

    if (payload.url) {
      embed.url = payload.url;
    }

    return embed;
  }

  private async sendWebhook(payload: NotificationPayload): Promise<boolean> {
    if (!this.webhookUrl) return false;

    try {
      const body: DiscordWebhookBody = { embeds: [this.buildEmbed(payload)] };

      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`DiscordAdapter: webhook error ${res.status}`, { response: text });
        return false;
      }

      logger.debug('DiscordAdapter: webhook notification sent');
      return true;
    } catch (error: unknown) {
      logger.error('DiscordAdapter: webhook send failed', error);
      return false;
    }
  }

  private async sendDm(payload: NotificationPayload, discordUserId: string): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      // Step 1: Open a DM channel
      const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient_id: discordUserId }),
      });

      if (!dmRes.ok) {
        const text = await dmRes.text();
        logger.error(`DiscordAdapter: DM channel creation failed ${dmRes.status}`, { response: text });
        return false;
      }

      const dmChannel = (await dmRes.json()) as { id: string };

      // Step 2: Send an embed into the DM channel
      const msgRes = await fetch(
        `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${this.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ embeds: [this.buildEmbed(payload)] }),
        },
      );

      if (!msgRes.ok) {
        const text = await msgRes.text();
        logger.error(`DiscordAdapter: DM send failed ${msgRes.status}`, { response: text });
        return false;
      }

      logger.debug(`DiscordAdapter: DM sent to Discord user ${discordUserId}`);
      return true;
    } catch (error: unknown) {
      logger.error('DiscordAdapter: DM send failed', error);
      return false;
    }
  }
}
