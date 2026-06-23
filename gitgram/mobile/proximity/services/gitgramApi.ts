import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  'https://api.gitgram.app';

const AUTH_TOKEN_KEY = 'gitgram_auth_token';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface ApiError {
  error: {
    type: string;
    code: string;
    message: string;
  };
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  authorId: string;
  author: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  content: string;
  repositoryUrl: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor: string | null;
}

export interface LikeResponse {
  postId: string;
  likesCount: number;
}

export interface Notification {
  id: string;
  type: string;
  actorId: string;
  actor: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  entityId: string | null;
  entityType: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationGroup {
  type: string;
  latestActor: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  count: number;
  entityId: string | null;
  entityType: string | null;
  read: boolean;
  latestAt: string;
}

export interface NotificationsResponse {
  groups: NotificationGroup[];
  unreadCount: number;
}

export interface MarkAllReadResponse {
  updatedCount: number;
}

export interface UserSearchResult {
  users: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>[];
}

export interface FollowResponse {
  followerId: string;
  followingId: string;
  followersCount: number;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export interface ApiClientOptions extends RequestInit {
  /** Skip attaching the Authorization header (e.g. for login/signup). */
  skipAuth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { skipAuth = false, headers: extraHeaders, ...restOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...restOptions,
    headers,
  });

  if (response.status === 401) {
    await clearAuthToken();
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as ApiError)?.error?.message ?? 'Unauthorized — please log in again.',
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as ApiError)?.error?.message ??
        `Request failed with status ${response.status}`,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Authenticate with username + password.
 * Persists the returned token to AsyncStorage.
 */
export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiClient<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuth: true,
  });

  await setAuthToken(data.token);
  return data;
}

/**
 * Create a new account.
 * Persists the returned token to AsyncStorage.
 */
export async function signup(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiClient<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
    skipAuth: true,
  });

  await setAuthToken(data.token);
  return data;
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

/** Fetch the authenticated user's own profile. */
export async function getMyProfile(): Promise<UserProfile> {
  return apiClient<UserProfile>('/v1/users/me');
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's home feed.
 * Pass `cursor` to page through older results.
 */
export async function getFeed(cursor?: string): Promise<FeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient<FeedResponse>(`/v1/posts/feed${query}`);
}

// ---------------------------------------------------------------------------
// Post reactions
// ---------------------------------------------------------------------------

/** Like a post by its id. */
export async function likePost(id: string): Promise<LikeResponse> {
  return apiClient<LikeResponse>(`/v1/posts/${encodeURIComponent(id)}/like`, {
    method: 'POST',
  });
}

/** Remove a like from a post. */
export async function unlikePost(id: string): Promise<LikeResponse> {
  return apiClient<LikeResponse>(`/v1/posts/${encodeURIComponent(id)}/like`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Fetch grouped notifications for the authenticated user (latest 20 groups). */
export async function getNotifications(): Promise<NotificationsResponse> {
  return apiClient<NotificationsResponse>(
    '/v1/notifications/grouped?limit=20',
  );
}

/** Mark every unread notification as read. */
export async function markAllRead(): Promise<MarkAllReadResponse> {
  return apiClient<MarkAllReadResponse>('/v1/notifications/mark-all-read', {
    method: 'POST',
  });
}

/** Shape returned by unread-count endpoints. */
export interface UnreadCountResponse {
  count: number;
}

/** Fetch the unread notification count for the authenticated user. */
export async function getNotificationsUnreadCount(): Promise<number> {
  const { count } = await apiClient<UnreadCountResponse>(
    '/v1/notifications/unread-count',
  );
  return count;
}

/** Fetch the unread direct-message count for the authenticated user. */
export async function getMessagesUnreadCount(): Promise<number> {
  const { count } = await apiClient<UnreadCountResponse>(
    '/v1/messages/unread-count',
  );
  return count;
}

// ---------------------------------------------------------------------------
// User discovery
// ---------------------------------------------------------------------------

/** Search for users by username or display name. */
export async function searchUsers(q: string): Promise<UserSearchResult> {
  return apiClient<UserSearchResult>(
    `/v1/users/search?q=${encodeURIComponent(q)}`,
  );
}

/** Fetch a public profile by username. */
export async function getProfile(username: string): Promise<UserProfile> {
  return apiClient<UserProfile>(
    `/v1/users/${encodeURIComponent(username)}/profile`,
  );
}

/** Follow a user by username. */
export async function followUser(username: string): Promise<FollowResponse> {
  return apiClient<FollowResponse>(
    `/v1/users/${encodeURIComponent(username)}/follow`,
    { method: 'POST' },
  );
}
