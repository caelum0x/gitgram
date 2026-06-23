import logger from '../../utils/logger';
import type {
  NotificationAdapter,
  NotificationPayload,
  AdapterCapabilities,
  BulkResult,
  NotificationType,
} from './NotificationAdapter';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Subject prefix per notification type */
const TYPE_SUBJECT: Record<NotificationType, string> = {
  like: 'New Like',
  comment: 'New Comment',
  follow: 'New Follower',
  mention: 'You were mentioned',
  message: 'New Message',
  system: 'Gitgram Update',
};

/** Accent colour for the notification banner */
const TYPE_COLOR: Record<NotificationType, string> = {
  like: '#e74c3c',
  comment: '#3498db',
  follow: '#2ecc71',
  mention: '#f39c12',
  message: '#9b59b6',
  system: '#95a5a6',
};

/**
 * Email adapter using the Resend HTTP API (no SDK import — plain fetch).
 *
 * Ideal for digest / batch notifications rather than real-time.
 *
 * Env vars:
 *   - `RESEND_API_KEY`
 *   - `EMAIL_FROM` (optional, defaults to `notifications@gitgram.com`)
 *
 * The recipient address is taken from `payload.data.email`.
 */
export class EmailAdapter implements NotificationAdapter {
  readonly name = 'email';
  readonly capabilities: AdapterCapabilities = {
    richFormatting: true,
    threads: false,
    reactions: false,
    fileUpload: false,
  };

  private apiKey: string | undefined;
  private from: string = 'Gitgram <notifications@gitgram.com>';

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async initialize(): Promise<void> {
    this.apiKey = process.env.RESEND_API_KEY;
    this.from = process.env.EMAIL_FROM ?? this.from;

    if (!this.apiKey) {
      logger.warn('EmailAdapter: RESEND_API_KEY not set — adapter disabled');
      return;
    }

    logger.info('EmailAdapter initialized');
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    if (!this.apiKey) return false;

    const email = payload.data?.email;
    if (typeof email !== 'string' || email.length === 0) {
      logger.debug(`EmailAdapter: no email for user ${payload.userId}, skipping`);
      return false;
    }

    try {
      const subject = `${TYPE_SUBJECT[payload.type]} — ${payload.title}`;
      const html = this.buildHtml(payload);

      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [email],
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`EmailAdapter: Resend API error ${res.status}`, { response: text });
        return false;
      }

      logger.debug(`EmailAdapter: email sent to ${email}`);
      return true;
    } catch (error: unknown) {
      logger.error('EmailAdapter: send failed', error);
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

  private buildHtml(payload: NotificationPayload): string {
    const color = TYPE_COLOR[payload.type];
    const ctaBlock = payload.url
      ? `<tr>
           <td style="padding: 24px 0 0;">
             <a href="${this.escapeHtml(payload.url)}"
                style="display:inline-block;padding:12px 24px;background:${color};
                       color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
               Open in Gitgram
             </a>
           </td>
         </tr>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#161b22;border-radius:8px;overflow:hidden;">
        <!-- Accent bar -->
        <tr><td style="height:4px;background:${color};"></td></tr>
        <!-- Header -->
        <tr><td style="padding:32px 32px 16px;">
          <h1 style="margin:0;font-size:20px;color:#c9d1d9;">${this.escapeHtml(payload.title)}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:16px;line-height:1.6;color:#8b949e;">
            ${this.escapeHtml(payload.body)}
          </p>
        </td></tr>
        <!-- CTA -->
        ${ctaBlock}
        <!-- Footer -->
        <tr><td style="padding:32px;border-top:1px solid #30363d;">
          <p style="margin:0;font-size:12px;color:#484f58;text-align:center;">
            Gitgram &mdash; The repository-first social network
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
