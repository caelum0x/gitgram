import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { logger } from './logger';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'message'
  | 'repost'
  | 'story_view'
  | 'reel_like'
  | 'reel_comment'
  | 'follow_request'
  | 'scheduled_post_published'
  | 'scheduled_post_failed';

interface NotificationData {
  type: NotificationType;
  postId?: string;
  commentId?: string;
  userId?: string;
  messageId?: string;
  conversationId?: string;
  storyId?: string;
  reelId?: string;
  scheduledPostId?: string;
}

/**
 * Handles deep linking from push notifications
 * Maps notification types to app routes
 */
export const handleNotificationDeepLink = (
  response: Notifications.NotificationResponse
): void => {
  try {
    const data = response.notification.request.content.data as unknown as NotificationData;

    if (!data || !data.type) {
      logger.warn('Notification data missing or no type specified');
      return;
    }

    const route = getRouteForNotification(data);

    if (route) {
      logger.log(`Navigating to ${route} from notification type: ${data.type}`);
      // Small delay to ensure app is ready
      setTimeout(() => {
        router.push(route);
      }, 100);
    }
  } catch (error) {
    logger.error('Error handling notification deep link:', error);
  }
};

/**
 * Maps notification data to app routes
 */
function getRouteForNotification(data: NotificationData): string | null {
  switch (data.type) {
    // Post interactions
    case 'like':
      if (data.postId) {
        return `/post/${data.postId}`;
      }
      break;

    case 'comment':
      if (data.postId) {
        // Navigate to post with comment section open
        return `/post/${data.postId}?showComments=true${data.commentId ? `&commentId=${data.commentId}` : ''}`;
      }
      break;

    case 'mention':
      if (data.postId) {
        return `/post/${data.postId}`;
      } else if (data.commentId && data.postId) {
        return `/post/${data.postId}?showComments=true&commentId=${data.commentId}`;
      }
      break;

    case 'repost':
      if (data.postId) {
        return `/post/${data.postId}`;
      }
      break;

    // User interactions
    case 'follow':
      if (data.userId) {
        return `/profile/${data.userId}`;
      }
      break;

    case 'follow_request':
      return '/follow-requests';

    // Messages
    case 'message':
      if (data.conversationId) {
        return `/chat/${data.conversationId}`;
      } else if (data.userId) {
        return `/chat/${data.userId}`;
      }
      break;

    // Stories
    case 'story_view':
      if (data.storyId) {
        return `/story/${data.storyId}`;
      }
      // Go to stories screen
      return '/stories';

    // Reels
    case 'reel_like':
    case 'reel_comment':
      if (data.reelId) {
        return `/reel/${data.reelId}`;
      }
      break;

    // Scheduled posts
    case 'scheduled_post_published':
      if (data.postId) {
        return `/post/${data.postId}`;
      }
      break;

    case 'scheduled_post_failed':
      if (data.scheduledPostId) {
        return `/scheduled/${data.scheduledPostId}/edit`;
      }
      return '/scheduled';

    default:
      logger.warn(`Unknown notification type: ${data.type}`);
      return null;
  }

  return null;
}

/**
 * Get the initial notification if app was opened via notification
 */
export const getInitialNotification = async (): Promise<NotificationData | null> => {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      return response.notification.request.content.data as unknown as NotificationData;
    }
    return null;
  } catch (error) {
    logger.error('Error getting initial notification:', error);
    return null;
  }
};

/**
 * Setup notification response handler
 * Returns cleanup function
 */
export const setupNotificationDeepLinkHandler = (): (() => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationDeepLink
  );

  // Check for initial notification (app opened via notification)
  getInitialNotification().then((data) => {
    if (data) {
      const route = getRouteForNotification(data);
      if (route) {
        // Delay to ensure navigation is ready
        setTimeout(() => {
          router.push(route);
        }, 500);
      }
    }
  });

  return () => {
    subscription.remove();
  };
};
