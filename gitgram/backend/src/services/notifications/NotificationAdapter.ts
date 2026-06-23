/**
 * Multi-platform notification adapter interface.
 *
 * Each adapter wraps a single delivery channel (Telegram, Discord, Slack, Email)
 * and exposes a uniform send/bulk API so the dispatcher can fan-out without
 * knowing transport details.
 */

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'message'
  | 'system';

export interface NotificationPayload {
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly type: NotificationType;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly url?: string; // deep link
}

export interface AdapterCapabilities {
  readonly richFormatting: boolean;
  readonly threads: boolean;
  readonly reactions: boolean;
  readonly fileUpload: boolean;
}

export interface BulkResult {
  readonly sent: number;
  readonly failed: number;
}

export interface NotificationAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  /** One-time async setup (validate tokens, warm connections, etc.) */
  initialize(): Promise<void>;

  /** Send a single notification. Returns true on success. */
  sendNotification(payload: NotificationPayload): Promise<boolean>;

  /** Send many notifications. Returns aggregate counts. */
  sendBulk(payloads: readonly NotificationPayload[]): Promise<BulkResult>;

  /** Whether the required env vars / config are present. */
  isConfigured(): boolean;
}
