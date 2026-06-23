// Adapter interface & types
export type {
  NotificationAdapter,
  NotificationPayload,
  AdapterCapabilities,
  BulkResult,
  NotificationType,
} from './NotificationAdapter';

// Concrete adapters
export { TelegramAdapter } from './TelegramAdapter';
export { DiscordAdapter } from './DiscordAdapter';
export { SlackAdapter } from './SlackAdapter';
export { EmailAdapter } from './EmailAdapter';

// Dispatcher (class + singleton default)
export { NotificationDispatcher } from './NotificationDispatcher';
export { default as dispatcher } from './NotificationDispatcher';
