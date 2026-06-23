import logger from '../../utils/logger';
import type {
  NotificationAdapter,
  NotificationPayload,
  AdapterCapabilities,
  BulkResult,
  NotificationType,
} from './NotificationAdapter';

/** Slack Block Kit colour bar per notification type */
const TYPE_COLOR: Record<NotificationType, string> = {
  like: '#e74c3c',
  comment: '#3498db',
  follow: '#2ecc71',
  mention: '#f39c12',
  message: '#9b59b6',
  system: '#95a5a6',
};

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: ReadonlyArray<{ type: string; text: string }>;
}

interface SlackAttachment {
  color: string;
  blocks: readonly SlackBlock[];
}

interface SlackWebhookBody {
  attachments: readonly SlackAttachment[];
}

/**
 * Slack Incoming Webhook adapter.
 *
 * Env vars:
 *   - `SLACK_WEBHOOK_URL` — Slack Incoming Webhook URL
 */
export class SlackAdapter implements NotificationAdapter {
  readonly name = 'slack';
  readonly capabilities: AdapterCapabilities = {
    richFormatting: true,
    threads: true,
    reactions: true,
    fileUpload: true,
  };

  private webhookUrl: string | undefined;

  isConfigured(): boolean {
    return Boolean(process.env.SLACK_WEBHOOK_URL);
  }

  async initialize(): Promise<void> {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!this.webhookUrl) {
      logger.warn('SlackAdapter: SLACK_WEBHOOK_URL not set — adapter disabled');
      return;
    }

    logger.info('SlackAdapter initialized');
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    if (!this.webhookUrl) return false;

    try {
      const body = this.buildSlackMessage(payload);

      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`SlackAdapter: webhook error ${res.status}`, { response: text });
        return false;
      }

      logger.debug('SlackAdapter: notification sent');
      return true;
    } catch (error: unknown) {
      logger.error('SlackAdapter: send failed', error);
      return false;
    }
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

  private buildSlackMessage(payload: NotificationPayload): SlackWebhookBody {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: payload.title, emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: payload.body },
      },
    ];

    if (payload.url) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open in Gitgram', emoji: true },
            url: payload.url,
          } as unknown as { type: string; text: string },
        ],
      });
    }

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Gitgram \u00b7 ${payload.type}` }],
    });

    return {
      attachments: [
        {
          color: TYPE_COLOR[payload.type],
          blocks,
        },
      ],
    };
  }
}
