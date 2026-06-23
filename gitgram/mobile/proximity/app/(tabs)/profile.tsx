import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette (matches index.tsx)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  accent: '#4F46E5',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  success: '#34D399',
  white: '#FFFFFF',
  danger: '#EF4444',
  github: '#6E40C9',
} as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 4) / GRID_COLUMNS; // 2px gaps

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

const AUTH_TOKEN_KEY = 'accessToken';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function clearToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function authedFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  githubUsername?: string | null;
}

interface UserPost {
  id: string;
  content: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnailUrl?: string | null;
}

interface UserPostsResponse {
  posts: UserPost[];
  nextCursor?: string | null;
}

interface Snippet {
  id: string;
  title: string;
  language: string;
  code: string;
  likesCount: number;
  createdAt: string;
}

interface SnippetsResponse {
  snippets: Snippet[];
  nextCursor?: string | null;
}

interface Repository {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  htmlUrl?: string | null;
}

interface RepositoriesResponse {
  repositories?: Repository[];
  projects?: Repository[];
  data?: Repository[];
}

interface StarredPost {
  id: string;
  content: string;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  likesCount: number;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface StarredResponse {
  posts: StarredPost[];
  nextCursor?: string | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  coverThumbnails: string[];
  createdAt: string;
}

interface CollectionsResponse {
  collections: Collection[];
  nextCursor?: string | null;
}

type ProfileTab = 'posts' | 'snippets' | 'repos' | 'starred' | 'collections';

// ---------------------------------------------------------------------------
// Language dot colors
// ---------------------------------------------------------------------------
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Rust: '#DEA584',
  Go: '#00ADD8',
  Java: '#B07219',
  Swift: '#FA7343',
  Kotlin: '#A97BFF',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Dart: '#00B4AB',
  Scala: '#C22D40',
  Haskell: '#5E5086',
};

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 80 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[
          avatarStyles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: {
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  placeholder: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Stat pill — tappable
// ---------------------------------------------------------------------------
interface StatPillProps {
  value: number;
  label: string;
  onPress?: () => void;
}

function StatPill({ value, label, onPress }: StatPillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [statStyles.container, pressed && statStyles.pressed]}
      disabled={!onPress}
    >
      <Text style={statStyles.value}>{formatCount(value)}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </Pressable>
  );
}

const statStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minWidth: 64,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  pressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  value: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 22,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ---------------------------------------------------------------------------
// Post thumbnail grid item
// ---------------------------------------------------------------------------
interface PostThumbProps {
  post: UserPost | StarredPost;
  onPress: (id: string) => void;
}

function PostThumb({ post, onPress }: PostThumbProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUri = post.thumbnailUrl ?? post.mediaUrls?.[0] ?? null;
  const hasImage = imageUri && !imgFailed;

  return (
    <Pressable
      onPress={() => onPress(post.id)}
      style={({ pressed }) => [
        thumbStyles.cell,
        { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE },
        pressed && thumbStyles.pressed,
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: imageUri! }}
          style={thumbStyles.image}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={thumbStyles.textFallback}>
          <Text style={thumbStyles.fallbackText} numberOfLines={3}>
            {post.content}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const thumbStyles = StyleSheet.create({
  cell: {
    backgroundColor: Colors.surfaceElevated,
    margin: 1,
    overflow: 'hidden',
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.75,
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  textFallback: {
    flex: 1,
    padding: 6,
    justifyContent: 'center',
  },
  fallbackText: {
    color: Colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
});

// ---------------------------------------------------------------------------
// Snippet card
// ---------------------------------------------------------------------------
interface SnippetCardProps {
  snippet: Snippet;
  onPress: (id: string) => void;
}

function SnippetCard({ snippet, onPress }: SnippetCardProps) {
  const langColor = LANGUAGE_COLORS[snippet.language] ?? Colors.textMuted;
  const preview = snippet.code.split('\n').slice(0, 4).join('\n');

  return (
    <Pressable
      onPress={() => onPress(snippet.id)}
      style={({ pressed }) => [snippetCardStyles.container, pressed && snippetCardStyles.pressed]}
    >
      <View style={snippetCardStyles.header}>
        <Text style={snippetCardStyles.title} numberOfLines={1}>
          {snippet.title}
        </Text>
        <View style={[snippetCardStyles.langBadge, { borderColor: langColor }]}>
          <View style={[snippetCardStyles.langDot, { backgroundColor: langColor }]} />
          <Text style={[snippetCardStyles.langText, { color: langColor }]}>
            {snippet.language}
          </Text>
        </View>
      </View>
      <View style={snippetCardStyles.codeBlock}>
        <Text style={snippetCardStyles.code} numberOfLines={4}>
          {preview}
        </Text>
      </View>
      <View style={snippetCardStyles.footer}>
        <Text style={snippetCardStyles.likes}>{'♥'} {formatCount(snippet.likesCount)}</Text>
      </View>
    </Pressable>
  );
}

const snippetCardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  langDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeBlock: {
    backgroundColor: Colors.surfaceElevated,
    marginHorizontal: 14,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  code: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  likes: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Repository list item
// ---------------------------------------------------------------------------
interface RepoItemProps {
  repo: Repository;
}

function RepoItem({ repo }: RepoItemProps) {
  const langColor = repo.language ? (LANGUAGE_COLORS[repo.language] ?? Colors.textMuted) : null;

  return (
    <View style={repoStyles.container}>
      <View style={repoStyles.header}>
        <Text style={repoStyles.name} numberOfLines={1}>
          {repo.name}
        </Text>
      </View>
      {repo.description ? (
        <Text style={repoStyles.description} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}
      <View style={repoStyles.meta}>
        {repo.language ? (
          <View style={repoStyles.langRow}>
            <View style={[repoStyles.langDot, { backgroundColor: langColor ?? Colors.textMuted }]} />
            <Text style={repoStyles.metaText}>{repo.language}</Text>
          </View>
        ) : null}
        <View style={repoStyles.statRow}>
          <Text style={repoStyles.metaIcon}>{'★'}</Text>
          <Text style={repoStyles.metaText}>{formatCount(repo.stars)}</Text>
        </View>
        <View style={repoStyles.statRow}>
          <Text style={repoStyles.metaIcon}>{'⑂'}</Text>
          <Text style={repoStyles.metaText}>{formatCount(repo.forks)}</Text>
        </View>
      </View>
    </View>
  );
}

const repoStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    color: Colors.primaryLight,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Collection card
// ---------------------------------------------------------------------------
const COLLECTION_THUMB_SIZE = (SCREEN_WIDTH - 48) / 2; // half of card content width
const COLLECTION_GRADIENTS = [
  ['#7C3AED', '#4F46E5'],
  ['#0EA5E9', '#2563EB'],
  ['#10B981', '#0891B2'],
  ['#F59E0B', '#EF4444'],
  ['#EC4899', '#8B5CF6'],
];

interface CollectionCardProps {
  collection: Collection;
  onPress: (id: string) => void;
}

function CollectionCover({ thumbnails, seed }: { thumbnails: string[]; seed: number }) {
  const gradient = COLLECTION_GRADIENTS[seed % COLLECTION_GRADIENTS.length]!;
  const slots = [0, 1, 2, 3];

  return (
    <View style={collectionCardStyles.cover}>
      {slots.map((i) => {
        const uri = thumbnails[i];
        return (
          <View
            key={i}
            style={[
              collectionCardStyles.coverCell,
              { backgroundColor: gradient[i % 2] },
            ]}
          >
            {uri ? (
              <Image source={{ uri }} style={collectionCardStyles.coverImage} resizeMode="cover" />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function CollectionCard({ collection, onPress }: CollectionCardProps) {
  // deterministic colour seed from id string
  const seed = collection.id.charCodeAt(0) ?? 0;

  return (
    <Pressable
      onPress={() => onPress(collection.id)}
      style={({ pressed }) => [collectionCardStyles.container, pressed && collectionCardStyles.pressed]}
    >
      <CollectionCover thumbnails={collection.coverThumbnails} seed={seed} />
      <View style={collectionCardStyles.info}>
        <View style={collectionCardStyles.nameRow}>
          <Text style={collectionCardStyles.name} numberOfLines={1}>
            {collection.name}
          </Text>
          <View
            style={[
              collectionCardStyles.privacyBadge,
              collection.isPublic
                ? collectionCardStyles.publicBadge
                : collectionCardStyles.privateBadge,
            ]}
          >
            <Text style={collectionCardStyles.privacyText}>
              {collection.isPublic ? 'Public' : 'Private'}
            </Text>
          </View>
        </View>
        <Text style={collectionCardStyles.count}>
          {formatCount(collection.itemCount)} {collection.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>
    </Pressable>
  );
}

const collectionCardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.75 },
  cover: {
    width: '100%',
    aspectRatio: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coverCell: {
    width: COLLECTION_THUMB_SIZE,
    height: COLLECTION_THUMB_SIZE,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  info: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  privacyBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  publicBadge: { backgroundColor: Colors.primaryDark },
  privateBadge: { backgroundColor: Colors.surfaceElevated },
  privacyText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  count: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------
function ProfileSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.avatarRow}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={skeletonStyles.stat} />
          ))}
        </View>
      </View>
      <View style={skeletonStyles.nameLine} />
      <View style={skeletonStyles.handleLine} />
      <View style={skeletonStyles.bioLine} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: { padding: 20 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surfaceElevated,
    marginRight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
  },
  stat: {
    width: 48,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  nameLine: {
    width: 160,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  handleLine: {
    width: 100,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  bioLine: {
    width: '85%',
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Profile screen
// ---------------------------------------------------------------------------
export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  // Posts
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const postsLoadingMoreRef = useRef(false);

  // Snippets
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [snippetsNextCursor, setSnippetsNextCursor] = useState<string | null>(null);
  const [snippetsHasMore, setSnippetsHasMore] = useState(true);
  const snippetsLoadingMoreRef = useRef(false);

  // Repos
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);

  // Starred
  const [starred, setStarred] = useState<StarredPost[]>([]);
  const [starredLoading, setStarredLoading] = useState(false);
  const [starredNextCursor, setStarredNextCursor] = useState<string | null>(null);
  const [starredHasMore, setStarredHasMore] = useState(true);
  const starredLoadingMoreRef = useRef(false);

  // Collections
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsNextCursor, setCollectionsNextCursor] = useState<string | null>(null);
  const [collectionsHasMore, setCollectionsHasMore] = useState(true);
  const collectionsLoadingMoreRef = useRef(false);

  // ----- Fetch profile -----
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data = await authedFetch<UserProfile>('/v1/users/me');
      setProfile(data);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ----- Pull-to-refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    // Reset active tab data so it reloads
    if (activeTab === 'posts') {
      setPosts([]);
      setPostsNextCursor(null);
      setPostsHasMore(true);
    } else if (activeTab === 'snippets') {
      setSnippets([]);
      setSnippetsNextCursor(null);
      setSnippetsHasMore(true);
    } else if (activeTab === 'repos') {
      setReposLoaded(false);
      setRepos([]);
    } else if (activeTab === 'starred') {
      setStarred([]);
      setStarredNextCursor(null);
      setStarredHasMore(true);
    } else if (activeTab === 'collections') {
      setCollections([]);
      setCollectionsNextCursor(null);
      setCollectionsHasMore(true);
    }
    setRefreshing(false);
  }, [activeTab, loadProfile]);

  // ----- Posts -----
  const loadPosts = useCallback(async (cursor?: string | null) => {
    if (postsLoadingMoreRef.current) return;
    postsLoadingMoreRef.current = true;
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '18' });
      if (cursor) params.set('cursor', cursor);
      const data = await authedFetch<UserPostsResponse>(
        `/v1/posts/feed?${params.toString()}`,
      );
      const incoming = data.posts ?? [];
      setPosts((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setPostsNextCursor(data.nextCursor ?? null);
      setPostsHasMore(!!data.nextCursor);
    } catch {
      // Non-fatal — grid shows empty state
    } finally {
      setPostsLoading(false);
      postsLoadingMoreRef.current = false;
    }
  }, []);

  // ----- Snippets -----
  const loadSnippets = useCallback(async (cursor?: string | null) => {
    if (snippetsLoadingMoreRef.current) return;
    snippetsLoadingMoreRef.current = true;
    setSnippetsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10' });
      if (cursor) params.set('cursor', cursor);
      const data = await authedFetch<SnippetsResponse>(
        `/v1/snippets/my?${params.toString()}`,
      );
      const incoming = data.snippets ?? [];
      setSnippets((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setSnippetsNextCursor(data.nextCursor ?? null);
      setSnippetsHasMore(!!data.nextCursor);
    } catch {
      setSnippetsHasMore(false);
    } finally {
      setSnippetsLoading(false);
      snippetsLoadingMoreRef.current = false;
    }
  }, []);

  // ----- Repos -----
  const loadRepos = useCallback(async () => {
    if (reposLoaded) return;
    setReposLoading(true);
    try {
      const data = await authedFetch<RepositoriesResponse>('/v1/github/projects');
      const list: Repository[] =
        data.repositories ?? data.projects ?? (data as unknown as Repository[]) ?? [];
      setRepos(list);
      setReposLoaded(true);
    } catch {
      setRepos([]);
      setReposLoaded(true);
    } finally {
      setReposLoading(false);
    }
  }, [reposLoaded]);

  // ----- Starred -----
  const loadStarred = useCallback(async (cursor?: string | null) => {
    if (starredLoadingMoreRef.current) return;
    starredLoadingMoreRef.current = true;
    setStarredLoading(true);
    try {
      const params = new URLSearchParams({ limit: '18' });
      if (cursor) params.set('cursor', cursor);
      const data = await authedFetch<StarredResponse>(
        `/v1/posts/starred?${params.toString()}`,
      );
      const incoming = data.posts ?? [];
      setStarred((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setStarredNextCursor(data.nextCursor ?? null);
      setStarredHasMore(!!data.nextCursor);
    } catch {
      setStarredHasMore(false);
    } finally {
      setStarredLoading(false);
      starredLoadingMoreRef.current = false;
    }
  }, []);

  // ----- Collections -----
  const loadCollections = useCallback(async (cursor?: string | null) => {
    if (collectionsLoadingMoreRef.current) return;
    collectionsLoadingMoreRef.current = true;
    setCollectionsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10' });
      if (cursor) params.set('cursor', cursor);
      const userId = profile?.id;
      if (!userId) return;
      const data = await authedFetch<CollectionsResponse>(
        `/v1/users/${userId}/collections?${params.toString()}`,
      );
      const incoming = data.collections ?? [];
      setCollections((prev) => (cursor ? [...prev, ...incoming] : incoming));
      setCollectionsNextCursor(data.nextCursor ?? null);
      setCollectionsHasMore(!!data.nextCursor);
    } catch {
      setCollectionsHasMore(false);
    } finally {
      setCollectionsLoading(false);
      collectionsLoadingMoreRef.current = false;
    }
  }, [profile?.id]);

  // Load tab content on tab switch
  useEffect(() => {
    if (activeTab === 'posts' && posts.length === 0) {
      loadPosts();
    } else if (activeTab === 'snippets' && snippets.length === 0) {
      loadSnippets();
    } else if (activeTab === 'repos') {
      loadRepos();
    } else if (activeTab === 'starred' && starred.length === 0) {
      loadStarred();
    } else if (activeTab === 'collections' && collections.length === 0) {
      loadCollections();
    }
  }, [activeTab, loadPosts, loadSnippets, loadRepos, loadStarred, loadCollections, posts.length, snippets.length, starred.length, collections.length]);

  // Initial posts load
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // ----- Sign out -----
  const handleSignOut = useCallback(async () => {
    await clearToken();
    setProfile(null);
    setPosts([]);
    setRepos([]);
    setSnippets([]);
    setStarred([]);
    setCollections([]);
  }, []);

  // ----- Navigation stubs -----
  const handleNavigateFollowers = useCallback(() => {
    // Wire to router.push('/followers') or navigation.navigate('Followers')
  }, []);

  const handleNavigateFollowing = useCallback(() => {
    // Wire to router.push('/following') or navigation.navigate('Following')
  }, []);

  const handleNavigateEditProfile = useCallback(() => {
    // Wire to router.push('/profile/edit')
  }, []);

  const handleNavigateSettings = useCallback(() => {
    // Wire to router.push('/settings')
  }, []);

  const handlePostPress = useCallback((_id: string) => {
    // Wire to router.push(`/post/${id}`)
  }, []);

  const handleSnippetPress = useCallback((_id: string) => {
    // Wire to router.push(`/snippet/${id}`)
  }, []);

  const handleCollectionPress = useCallback((_id: string) => {
    // Wire to router.push(`/collection/${id}`)
  }, []);

  // ----- Render helpers -----
  const renderPostItem = useCallback(
    ({ item }: { item: UserPost }) => <PostThumb post={item} onPress={handlePostPress} />,
    [handlePostPress],
  );

  const renderStarredItem = useCallback(
    ({ item }: { item: StarredPost }) => <PostThumb post={item} onPress={handlePostPress} />,
    [handlePostPress],
  );

  const renderSnippetItem = useCallback(
    ({ item }: { item: Snippet }) => <SnippetCard snippet={item} onPress={handleSnippetPress} />,
    [handleSnippetPress],
  );

  const renderRepoItem = useCallback(
    ({ item }: { item: Repository }) => <RepoItem repo={item} />,
    [],
  );

  const renderCollectionItem = useCallback(
    ({ item }: { item: Collection }) => (
      <CollectionCard collection={item} onPress={handleCollectionPress} />
    ),
    [handleCollectionPress],
  );

  const postKeyExtractor = useCallback((item: UserPost) => item.id, []);
  const snippetKeyExtractor = useCallback((item: Snippet) => item.id, []);
  const repoKeyExtractor = useCallback((item: Repository) => item.id, []);
  const starredKeyExtractor = useCallback((item: StarredPost) => item.id, []);
  const collectionKeyExtractor = useCallback((item: Collection) => item.id, []);

  // ----- Profile header (ListHeaderComponent) -----
  const renderProfileHeader = useCallback(() => {
    if (profileLoading) return <ProfileSkeleton />;

    if (profileError) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{profileError}</Text>
          <Pressable onPress={loadProfile} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!profile) return null;

    return (
      <View style={styles.profileHeader}>
        {/* Avatar row */}
        <View style={styles.avatarRow}>
          <Avatar uri={profile.avatarUrl} username={profile.username} size={88} />
          <View style={styles.statsRow}>
            <StatPill value={profile.postsCount} label="Posts" />
            <StatPill
              value={profile.followersCount}
              label="Followers"
              onPress={handleNavigateFollowers}
            />
            <StatPill
              value={profile.followingCount}
              label="Following"
              onPress={handleNavigateFollowing}
            />
          </View>
        </View>

        {/* Name / handle / bio */}
        <View style={styles.nameBlock}>
          {profile.displayName ? (
            <Text style={styles.displayName}>{profile.displayName}</Text>
          ) : null}
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio ? (
            <Text style={styles.bio} numberOfLines={4}>
              {profile.bio}
            </Text>
          ) : null}

          {/* GitHub badge */}
          {profile.githubUsername ? (
            <View style={styles.githubBadge}>
              <View style={styles.githubIconCircle}>
                <Text style={styles.githubIconText}>{'gh'}</Text>
              </View>
              <Text style={styles.githubUsername}>{profile.githubUsername}</Text>
            </View>
          ) : null}
        </View>

        {/* Action row */}
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.editBtn, pressed && styles.btnPressed]}
            onPress={handleNavigateEditProfile}
          >
            <Text style={styles.actionBtnText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Five-tab bar */}
        <View style={styles.tabBar}>
          {(['posts', 'snippets', 'repos', 'starred', 'collections'] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'posts'
                  ? 'Posts'
                  : tab === 'snippets'
                  ? 'Snippets'
                  : tab === 'repos'
                  ? 'Repos'
                  : tab === 'starred'
                  ? 'Starred'
                  : 'Collections'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [
    profile,
    profileLoading,
    profileError,
    activeTab,
    handleNavigateFollowers,
    handleNavigateFollowing,
    handleNavigateEditProfile,
    loadProfile,
  ]);

  // ----- Pick the right data / render for current tab -----
  type TabConfig =
    | { tab: 'posts'; data: UserPost[]; renderItem: typeof renderPostItem; keyExtractor: typeof postKeyExtractor; numColumns: number; onEndReached: () => void; loading: boolean; hasMore: boolean }
    | { tab: 'snippets'; data: Snippet[]; renderItem: typeof renderSnippetItem; keyExtractor: typeof snippetKeyExtractor; numColumns: 1; onEndReached: () => void; loading: boolean; hasMore: boolean }
    | { tab: 'repos'; data: Repository[]; renderItem: typeof renderRepoItem; keyExtractor: typeof repoKeyExtractor; numColumns: 1; onEndReached: () => void; loading: boolean; hasMore: false }
    | { tab: 'starred'; data: StarredPost[]; renderItem: typeof renderStarredItem; keyExtractor: typeof starredKeyExtractor; numColumns: number; onEndReached: () => void; loading: boolean; hasMore: boolean }
    | { tab: 'collections'; data: Collection[]; renderItem: typeof renderCollectionItem; keyExtractor: typeof collectionKeyExtractor; numColumns: 1; onEndReached: () => void; loading: boolean; hasMore: boolean };

  const tabConfig: TabConfig = (() => {
    if (activeTab === 'snippets') {
      return {
        tab: 'snippets' as const,
        data: snippets,
        renderItem: renderSnippetItem,
        keyExtractor: snippetKeyExtractor,
        numColumns: 1,
        loading: snippetsLoading,
        hasMore: snippetsHasMore,
        onEndReached: () => {
          if (snippetsHasMore && snippetsNextCursor && !snippetsLoadingMoreRef.current) {
            loadSnippets(snippetsNextCursor);
          }
        },
      };
    }
    if (activeTab === 'repos') {
      return {
        tab: 'repos' as const,
        data: repos,
        renderItem: renderRepoItem,
        keyExtractor: repoKeyExtractor,
        numColumns: 1,
        loading: reposLoading,
        hasMore: false as false,
        onEndReached: () => {},
      };
    }
    if (activeTab === 'starred') {
      return {
        tab: 'starred' as const,
        data: starred,
        renderItem: renderStarredItem,
        keyExtractor: starredKeyExtractor,
        numColumns: GRID_COLUMNS,
        loading: starredLoading,
        hasMore: starredHasMore,
        onEndReached: () => {
          if (starredHasMore && starredNextCursor && !starredLoadingMoreRef.current) {
            loadStarred(starredNextCursor);
          }
        },
      };
    }
    if (activeTab === 'collections') {
      return {
        tab: 'collections' as const,
        data: collections,
        renderItem: renderCollectionItem,
        keyExtractor: collectionKeyExtractor,
        numColumns: 1,
        loading: collectionsLoading,
        hasMore: collectionsHasMore,
        onEndReached: () => {
          if (collectionsHasMore && collectionsNextCursor && !collectionsLoadingMoreRef.current) {
            loadCollections(collectionsNextCursor);
          }
        },
      };
    }
    // default: posts
    return {
      tab: 'posts' as const,
      data: posts,
      renderItem: renderPostItem,
      keyExtractor: postKeyExtractor,
      numColumns: GRID_COLUMNS,
      loading: postsLoading,
      hasMore: postsHasMore,
      onEndReached: () => {
        if (postsHasMore && postsNextCursor && !postsLoadingMoreRef.current) {
          loadPosts(postsNextCursor);
        }
      },
    };
  })();

  const isGridTab = tabConfig.numColumns === GRID_COLUMNS;

  const emptyLabels: Record<ProfileTab, { icon: string; primary: string; secondary?: string }> = {
    posts: { icon: '[img]', primary: 'No posts yet' },
    snippets: { icon: '[</>]', primary: 'No snippets yet', secondary: 'Share your first code snippet' },
    repos: { icon: '[box]', primary: 'No repositories', secondary: 'Tap GitHub Sync to import repos' },
    starred: { icon: '[star]', primary: 'Nothing starred yet', secondary: 'Star posts to save them here' },
    collections: { icon: '[col]', primary: 'No collections yet', secondary: 'Create a collection to organize your posts' },
  };

  const renderListEmpty = () => {
    if (tabConfig.loading) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }
    const { icon, primary, secondary } = emptyLabels[activeTab];
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyIcon}>{icon}</Text>
        <Text style={styles.emptyText}>{primary}</Text>
        {secondary ? <Text style={styles.emptySubText}>{secondary}</Text> : null}
      </View>
    );
  };

  const renderListFooter = () =>
    tabConfig.loading && tabConfig.data.length > 0 ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable
          style={({ pressed }) => [styles.gearBtn, pressed && styles.btnPressed]}
          onPress={handleNavigateSettings}
          hitSlop={8}
          accessibilityLabel="Settings"
        >
          <Text style={styles.gearIcon}>{'[gear]'}</Text>
        </Pressable>
      </View>

      {/* Single FlatList — header carries the full profile section */}
      <FlatList
        data={tabConfig.data as unknown[]}
        renderItem={tabConfig.renderItem as ({ item }: { item: unknown }) => React.ReactElement}
        keyExtractor={tabConfig.keyExtractor as (item: unknown) => string}
        numColumns={isGridTab ? GRID_COLUMNS : 1}
        key={`${activeTab}-${isGridTab ? 'grid' : 'list'}`}
        ListHeaderComponent={renderProfileHeader}
        ListEmptyComponent={renderListEmpty}
        ListFooterComponent={renderListFooter}
        onEndReached={tabConfig.onEndReached}
        onEndReachedThreshold={0.5}
        columnWrapperStyle={isGridTab ? styles.gridRow : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Append sign-out at bottom via footer when profile is loaded
        ListFooterComponentStyle={styles.listFooterStyle}
      />

      {/* Sign out — fixed at bottom only after profile loads */}
      {!profileLoading && !profileError && profile ? (
        <View style={styles.signOutContainer}>
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.btnPressed]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Top header bar
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  gearBtn: { padding: 4 },
  gearIcon: { fontSize: 22, color: Colors.textSecondary },

  // List
  listContent: {
    paddingBottom: 80,
    backgroundColor: Colors.background,
  },
  listFooterStyle: {},

  // Profile header section
  profileHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 0,
    backgroundColor: Colors.background,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: 12,
  },
  nameBlock: {
    marginBottom: 16,
  },
  displayName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  bio: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },

  // GitHub badge
  githubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  githubIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.github,
    justifyContent: 'center',
    alignItems: 'center',
  },
  githubIconText: {
    color: Colors.white,
    fontSize: 8,
    fontWeight: '800',
  },
  githubUsername: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  btnPressed: { opacity: 0.65 },

  // Four-tab bar
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginHorizontal: -16,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: {
    color: Colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  tabTextActive: { color: Colors.primary },

  // Grid
  gridRow: { justifyContent: 'flex-start' },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  // Tab states
  tabLoading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    color: Colors.textMuted,
    fontSize: 32,
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },

  // Error
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },

  // Sign out
  signOutContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  signOutBtn: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  signOutText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 15,
  },
});
