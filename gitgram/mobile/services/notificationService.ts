import api from './api';

// ---------------------------------------------------------------------------
// Notification types + grouping
// ---------------------------------------------------------------------------

/** A single notification as returned by GET /notifications. */
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

/**
 * A notification row after grouping. `additional` holds same-reason,
 * same-subject events that were collapsed into this row (newest-first base
 * notification, oldest collapsed events appended). `actorCount` is the total
 * number of distinct events represented (1 + additional.length).
 */
export interface GroupedNotification {
  /** Stable key for list rendering. */
  key: string;
  /** The representative (most recent) notification for this group. */
  notification: Notification;
  /** Other notifications merged into this group, if any. */
  additional: Notification[];
  /** Total number of events represented by this row. */
  actorCount: number;
}

/**
 * Reasons whose events are safe to collapse into a single row. Ported from
 * Bluesky's GROUPABLE_REASONS (src/state/queries/notifications/util.ts) and
 * mapped to the product's notification `type` vocabulary. Comment/mention-style
 * events are intentionally excluded so each carries its own context.
 */
const GROUPABLE_TYPES = new Set(['like', 'follow', 'star', 'repost', 'fork']);

/** 48h window (in ms) within which same-subject events are grouped. */
const GROUP_WINDOW_MS = 1000 * 60 * 60 * 48;

const getStringField = (
  data: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * The subject a notification refers to (post/repo/etc). Two events group only
 * when they share a type AND a subject, so we derive a stable subject key from
 * the notification payload.
 */
function getSubjectKey(notif: Notification): string | undefined {
  const data = notif.data;
  return (
    getStringField(data, 'postId') ??
    getStringField(data, 'repoFullName') ??
    (getStringField(data, 'repoOwner') && getStringField(data, 'repoName')
      ? `${getStringField(data, 'repoOwner')}/${getStringField(data, 'repoName')}`
      : undefined) ??
    getStringField(data, 'targetId')
  );
}

/** The actor (user) responsible for a notification, if identifiable. */
function getActorKey(notif: Notification): string | undefined {
  return getStringField(notif.data, 'userId');
}

/**
 * Collapses same-type, same-subject notifications that occur within a 48h
 * window into single grouped rows ("Alice and 5 others liked your post").
 *
 * Pure function, ported from Bluesky's `groupNotifications` and adapted to the
 * product's flat Notification shape (no atproto dependency). Input order is
 * preserved for the resulting representative rows; distinct actors only are
 * grouped (an actor never groups with themselves on the same subject).
 */
export function groupNotifications(
  notifs: Notification[],
): GroupedNotification[] {
  const grouped: GroupedNotification[] = [];

  for (const notif of notifs) {
    const ts = new Date(notif.createdAt).getTime();
    let didGroup = false;

    if (GROUPABLE_TYPES.has(notif.type)) {
      const subject = getSubjectKey(notif);
      const actor = getActorKey(notif);

      for (const group of grouped) {
        const base = group.notification;
        if (base.type !== notif.type) continue;
        if (getSubjectKey(base) !== subject) continue;

        const baseTs = new Date(base.createdAt).getTime();
        if (Math.abs(baseTs - ts) >= GROUP_WINDOW_MS) continue;

        // Don't group an actor with themselves (avoids "Alice and Alice").
        const baseActor = getActorKey(base);
        const groupActors = new Set(
          [baseActor, ...group.additional.map(getActorKey)].filter(
            (a): a is string => typeof a === 'string',
          ),
        );
        if (actor && groupActors.has(actor)) continue;

        group.additional.push(notif);
        group.actorCount += 1;
        didGroup = true;
        break;
      }
    }

    if (!didGroup) {
      grouped.push({
        key: `notif-${notif.id}-${notif.type}`,
        notification: notif,
        additional: [],
        actorCount: 1,
      });
    }
  }

  return grouped;
}

export const notificationService = {
  getNotifications: async (page = 1, limit = 20, unreadOnly = false) => {
    const response = await api.get('/notifications', {
      params: { page, limit, unreadOnly },
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread/count');
    return response.data;
  },

  markAsRead: async (notificationIds?: string[]) => {
    const response = await api.put('/notifications/read', {
      notificationIds,
    });
    return response.data;
  },

  deleteNotification: async (notificationId: string) => {
    const response = await api.delete(`/notifications/${notificationId}`);
    return response.data;
  },

  getNotification: async (notificationId: string) => {
    const response = await api.get(`/notifications/${notificationId}`);
    return response.data;
  },

  getPreferences: async () => {
    const response = await api.get('/notifications/preferences');
    return response.data;
  },

  updatePreferences: async (preferences: any) => {
    const response = await api.put('/notifications/preferences', preferences);
    return response.data;
  },
};

