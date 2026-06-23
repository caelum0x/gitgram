import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-community/async-storage';

import { apiClient, followUser, UserProfile } from '../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  white: '#FFFFFF',
  star: '#FBBF24',
  tagBg: '#2D1B69',
  tagBorder: '#4C1D95',
  snippetBg: '#1A2438',
  snippetBorder: '#2D3A55',
} as const;

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Java: '#B07219',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  Dart: '#00B4AB',
  Shell: '#89E051',
  CSS: '#563D7C',
  HTML: '#E34C26',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  Scala: '#DC322F',
  Elixir: '#6E4A7E',
};

function languageColor(lang: string | null): string {
  if (!lang) return Colors.textMuted;
  return LANGUAGE_COLORS[lang] ?? Colors.textSecondary;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Recent searches — persisted in AsyncStorage under "recent_searches"
// ---------------------------------------------------------------------------
const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT = 8;

async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

async function saveRecentSearch(query: string): Promise<void> {
  try {
    const existing = await loadRecentSearches();
    const deduped = [query, ...existing.filter((q) => q !== query)].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(deduped));
  } catch {
    // Non-fatal
  }
}

async function removeRecentSearch(query: string): Promise<void> {
  try {
    const existing = await loadRecentSearches();
    const updated = existing.filter((q) => q !== query);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal
  }
}

async function clearAllRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// useDebounce — 300ms per spec
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------
interface TrendingHashtag {
  tag: string;
  count: number;
}

interface TrendingHashtagsResponse {
  tags: TrendingHashtag[];
}

// "All" is the mixed-results tab; the others map to typed search
type SearchTab = 'All' | 'People' | 'Repos' | 'Posts' | 'Snippets';

// API type param values (minus "All")
type SearchType = 'users' | 'repositories' | 'posts' | 'snippets';

const TAB_TO_TYPE: Record<Exclude<SearchTab, 'All'>, SearchType> = {
  People: 'users',
  Repos: 'repositories',
  Posts: 'posts',
  Snippets: 'snippets',
};

interface PersonResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followersCount: number;
  bio: string | null;
}

interface RepoResult {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  starsCount: number;
  forksCount: number;
  isPrivate: boolean;
  owner: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

interface PostResult {
  id: string;
  content: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface SnippetResult {
  id: string;
  title: string;
  language: string | null;
  viewsCount: number;
  likesCount: number;
  authorUsername: string;
  createdAt: string;
}

// Unified search response — GET /v1/search?q=:query&type=:type
interface SearchResponse {
  users: PersonResult[];
  repositories: RepoResult[];
  posts: PostResult[];
  snippets: SnippetResult[];
  nextCursor: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function fetchTrendingHashtags(): Promise<TrendingHashtagsResponse> {
  return apiClient<TrendingHashtagsResponse>('/v1/hashtags/trending?limit=8');
}

async function searchAll(query: string, cursor?: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set('cursor', cursor);
  return apiClient<SearchResponse>(`/v1/search?${params}`);
}

async function searchByType(
  query: string,
  type: SearchType,
  cursor?: string,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, type });
  if (cursor) params.set('cursor', cursor);
  return apiClient<SearchResponse>(`/v1/search?${params}`);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
interface AvatarProps {
  username: string;
  size?: number;
}

function Avatar({ username, size = 40 }: AvatarProps) {
  const initial = username.slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>
        {initial}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Person result row
// ---------------------------------------------------------------------------
interface PersonRowProps {
  person: PersonResult;
  isFollowing: boolean;
  isLoading: boolean;
  onFollow: (username: string) => void;
  onPress: (username: string) => void;
}

function PersonRow({ person, isFollowing, isLoading, onFollow, onPress }: PersonRowProps) {
  return (
    <TouchableOpacity
      style={personRowStyles.container}
      onPress={() => onPress(person.username)}
      activeOpacity={0.75}
    >
      <Avatar username={person.username} size={46} />
      <View style={personRowStyles.info}>
        {person.displayName ? (
          <Text style={personRowStyles.displayName} numberOfLines={1}>
            {person.displayName}
          </Text>
        ) : null}
        <Text style={personRowStyles.username} numberOfLines={1}>
          @{person.username}
        </Text>
        {person.bio ? (
          <Text style={personRowStyles.bio} numberOfLines={1}>
            {person.bio}
          </Text>
        ) : null}
        <Text style={personRowStyles.followers}>
          {formatCount(person.followersCount)} followers
        </Text>
      </View>
      <TouchableOpacity
        style={[
          personRowStyles.followBtn,
          isFollowing && personRowStyles.followingBtn,
        ]}
        onPress={() => onFollow(person.username)}
        disabled={isLoading || isFollowing}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text
            style={[
              personRowStyles.followBtnText,
              isFollowing && personRowStyles.followingBtnText,
            ]}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const personRowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },
  bio: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  followers: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  followingBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  followingBtnText: {
    color: Colors.textSecondary,
  },
});

// ---------------------------------------------------------------------------
// Repo result row
// ---------------------------------------------------------------------------
interface RepoRowProps {
  repo: RepoResult;
  onPress: (repo: RepoResult) => void;
}

function RepoRow({ repo, onPress }: RepoRowProps) {
  return (
    <TouchableOpacity
      style={repoRowStyles.container}
      onPress={() => onPress(repo)}
      activeOpacity={0.75}
    >
      <View style={repoRowStyles.topRow}>
        <Text style={repoRowStyles.name} numberOfLines={1}>
          {repo.fullName}
        </Text>
        {repo.isPrivate && (
          <View style={repoRowStyles.privateBadge}>
            <Text style={repoRowStyles.privateBadgeText}>private</Text>
          </View>
        )}
      </View>
      {repo.description ? (
        <Text style={repoRowStyles.description} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}
      <View style={repoRowStyles.metaRow}>
        {repo.language ? (
          <View style={repoRowStyles.langGroup}>
            <View
              style={[
                repoRowStyles.langDot,
                { backgroundColor: languageColor(repo.language) },
              ]}
            />
            <Text style={repoRowStyles.langText}>{repo.language}</Text>
          </View>
        ) : null}
        <View style={repoRowStyles.starsGroup}>
          <Text style={repoRowStyles.starIcon}>{'★'}</Text>
          <Text style={repoRowStyles.starsText}>{formatCount(repo.starsCount)}</Text>
        </View>
        <View style={repoRowStyles.forksGroup}>
          <Text style={repoRowStyles.forkIcon}>{'⑂'}</Text>
          <Text style={repoRowStyles.forksText}>{formatCount(repo.forksCount)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const repoRowStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  privateBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privateBadgeText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  langGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  langText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  starsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    color: Colors.star,
    fontSize: 13,
  },
  starsText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  forksGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  forkIcon: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  forksText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Post result row
// ---------------------------------------------------------------------------
interface PostRowProps {
  post: PostResult;
  onPress: (postId: string) => void;
}

function PostRow({ post, onPress }: PostRowProps) {
  const relativeTime = React.useMemo(() => {
    const diff = Date.now() - new Date(post.createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }, [post.createdAt]);

  return (
    <TouchableOpacity
      style={postRowStyles.container}
      onPress={() => onPress(post.id)}
      activeOpacity={0.75}
    >
      <View style={postRowStyles.authorRow}>
        <Avatar username={post.authorUsername} size={32} />
        <Text style={postRowStyles.authorName}>
          {post.authorDisplayName ?? `@${post.authorUsername}`}
        </Text>
        <Text style={postRowStyles.username}>@{post.authorUsername}</Text>
        <Text style={postRowStyles.time}>{relativeTime}</Text>
      </View>
      <Text style={postRowStyles.content} numberOfLines={4}>
        {post.content}
      </Text>
      <View style={postRowStyles.metaRow}>
        <Text style={postRowStyles.metaItem}>{'♥'} {formatCount(post.likesCount)}</Text>
        <Text style={postRowStyles.metaItem}>{'💬'} {formatCount(post.commentsCount)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const postRowStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 12,
  },
  time: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  content: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Snippet result row
// ---------------------------------------------------------------------------
interface SnippetRowProps {
  snippet: SnippetResult;
  onPress: (id: string) => void;
}

function SnippetRow({ snippet, onPress }: SnippetRowProps) {
  return (
    <TouchableOpacity
      style={snippetRowStyles.container}
      onPress={() => onPress(snippet.id)}
      activeOpacity={0.75}
    >
      <View style={snippetRowStyles.topRow}>
        {snippet.language ? (
          <View
            style={[
              snippetRowStyles.langChip,
              { borderColor: languageColor(snippet.language) },
            ]}
          >
            <View
              style={[
                snippetRowStyles.langDot,
                { backgroundColor: languageColor(snippet.language) },
              ]}
            />
            <Text
              style={[
                snippetRowStyles.langText,
                { color: languageColor(snippet.language) },
              ]}
            >
              {snippet.language}
            </Text>
          </View>
        ) : null}
        <View style={snippetRowStyles.viewsGroup}>
          <Text style={snippetRowStyles.viewsIcon}>{'👁'}</Text>
          <Text style={snippetRowStyles.viewsText}>{formatCount(snippet.viewsCount)}</Text>
        </View>
        <View style={snippetRowStyles.likesGroup}>
          <Text style={snippetRowStyles.likesIcon}>{'♥'}</Text>
          <Text style={snippetRowStyles.likesText}>{formatCount(snippet.likesCount)}</Text>
        </View>
      </View>
      <Text style={snippetRowStyles.title} numberOfLines={2}>
        {snippet.title}
      </Text>
      <Text style={snippetRowStyles.author}>by @{snippet.authorUsername}</Text>
    </TouchableOpacity>
  );
}

const snippetRowStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.snippetBg,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.snippetBorder,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.surface,
  },
  langDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  langText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewsIcon: {
    fontSize: 12,
  },
  viewsText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  likesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likesIcon: {
    color: '#F87171',
    fontSize: 12,
  },
  likesText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  author: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Section heading used inside the "All" tab
// ---------------------------------------------------------------------------
interface SectionHeadingProps {
  label: string;
  onSeeAll: () => void;
}

function SectionHeading({ label, onSeeAll }: SectionHeadingProps) {
  return (
    <View style={sectionHeadingStyles.container}>
      <Text style={sectionHeadingStyles.label}>{label}</Text>
      <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7}>
        <Text style={sectionHeadingStyles.seeAll}>See all</Text>
      </TouchableOpacity>
    </View>
  );
}

const sectionHeadingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundColor: Colors.background,
  },
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  seeAll: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Generic list state
// ---------------------------------------------------------------------------
interface ListState<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

function emptyListState<T>(): ListState<T> {
  return {
    items: [],
    nextCursor: null,
    total: 0,
    isLoading: false,
    isLoadingMore: false,
    error: null,
  };
}

// "All" tab aggregates all four result types
interface AllResults {
  users: PersonResult[];
  repositories: RepoResult[];
  posts: PostResult[];
  snippets: SnippetResult[];
  isLoading: boolean;
  error: string | null;
}

function emptyAllResults(): AllResults {
  return {
    users: [],
    repositories: [],
    posts: [],
    snippets: [],
    isLoading: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Horizontal tab bar — All / People / Repos / Posts / Snippets
// ---------------------------------------------------------------------------
const TABS: SearchTab[] = ['All', 'People', 'Repos', 'Posts', 'Snippets'];

interface TabBarProps {
  activeTab: SearchTab;
  onTabPress: (tab: SearchTab) => void;
}

function TabBar({ activeTab, onTabPress }: TabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={tabBarStyles.scroll}
      contentContainerStyle={tabBarStyles.content}
    >
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[tabBarStyles.tab, activeTab === tab && tabBarStyles.activeTab]}
          onPress={() => onTabPress(tab)}
          activeOpacity={0.7}
        >
          <Text
            style={[tabBarStyles.label, activeTab === tab && tabBarStyles.activeLabel]}
          >
            {tab}
          </Text>
          {activeTab === tab && <View style={tabBarStyles.indicator} />}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const tabBarStyles = StyleSheet.create({
  scroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 4,
  },
  tab: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    position: 'relative',
  },
  activeTab: {},
  label: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  activeLabel: {
    color: Colors.primaryLight,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
});

// ---------------------------------------------------------------------------
// Empty state per tab
// ---------------------------------------------------------------------------
function EmptyState({ query, tab }: { query: string; tab: SearchTab }) {
  const descriptions: Record<SearchTab, string> = {
    All: 'Try different keywords, usernames, or hashtags.',
    People: 'Try a different username or display name.',
    Repos: 'Try a different repository name or owner.',
    Posts: 'Try different keywords or hashtags.',
    Snippets: 'Try different keywords or a language name.',
  };
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{'🔍'}</Text>
      <Text style={emptyStyles.heading}>
        No {tab === 'All' ? 'results' : tab} for "{query}"
      </Text>
      <Text style={emptyStyles.body}>{descriptions[tab]}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  heading: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Load-more footer + searching spinner
// ---------------------------------------------------------------------------
function LoadMoreFooter({ isLoadingMore }: { isLoadingMore: boolean }) {
  if (!isLoadingMore) return null;
  return (
    <View style={footerStyles.container}>
      <ActivityIndicator size="small" color={Colors.primary} />
    </View>
  );
}

const footerStyles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

function SearchingView() {
  return (
    <View style={spinnerStyles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={spinnerStyles.label}>Searching...</Text>
    </View>
  );
}

const spinnerStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
});

// ---------------------------------------------------------------------------
// Pre-search view — recent searches + trending hashtags
// ---------------------------------------------------------------------------
interface PreSearchViewProps {
  recentSearches: string[];
  trendingHashtags: TrendingHashtag[];
  onQuerySelect: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearAll: () => void;
}

function PreSearchView({
  recentSearches,
  trendingHashtags,
  onQuerySelect,
  onRemoveRecent,
  onClearAll,
}: PreSearchViewProps) {
  return (
    <ScrollView
      style={preStyles.scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={preStyles.content}
    >
      {recentSearches.length > 0 && (
        <View style={preStyles.section}>
          <View style={preStyles.sectionHeader}>
            <Text style={preStyles.sectionTitle}>Recent</Text>
            <TouchableOpacity onPress={onClearAll} activeOpacity={0.7}>
              <Text style={preStyles.clearAll}>Clear all</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((q) => (
            <TouchableOpacity
              key={q}
              style={preStyles.recentRow}
              onPress={() => onQuerySelect(q)}
              activeOpacity={0.75}
            >
              <Text style={preStyles.recentIcon}>{'🕐'}</Text>
              <Text style={preStyles.recentText} numberOfLines={1}>
                {q}
              </Text>
              <TouchableOpacity
                onPress={() => onRemoveRecent(q)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={preStyles.removeIcon}>{'✕'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {trendingHashtags.length > 0 && (
        <View style={preStyles.section}>
          <Text style={[preStyles.sectionTitle, { marginBottom: 12 }]}>Trending</Text>
          {trendingHashtags.map((item, index) => (
            <TouchableOpacity
              key={item.tag}
              style={preStyles.trendingRow}
              onPress={() => onQuerySelect(`#${item.tag}`)}
              activeOpacity={0.75}
            >
              <Text style={preStyles.trendingRank}>{index + 1}</Text>
              <View style={preStyles.trendingInfo}>
                <Text style={preStyles.trendingTag}>#{item.tag}</Text>
                <Text style={preStyles.trendingCount}>
                  {formatCount(item.count)} posts
                </Text>
              </View>
              <Text style={preStyles.trendingArrow}>{'›'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const preStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 32,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  clearAll: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  recentIcon: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  recentText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
  },
  removeIcon: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 14,
  },
  trendingRank: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  trendingInfo: {
    flex: 1,
    gap: 2,
  },
  trendingTag: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  trendingCount: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  trendingArrow: {
    color: Colors.textMuted,
    fontSize: 20,
    fontWeight: '300',
  },
});

// ---------------------------------------------------------------------------
// Main SearchScreen
// ---------------------------------------------------------------------------
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();

  const inputRef = useRef<TextInput>(null);

  // Query — debounced at 300ms per spec
  const [query, setQuery] = useState(params.q ?? '');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const isQueryActive = debouncedQuery.length > 0;

  // Active tab
  const [activeTab, setActiveTab] = useState<SearchTab>('All');

  // Pre-search data
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);

  // "All" tab aggregated results
  const [allResults, setAllResults] = useState<AllResults>(emptyAllResults());

  // Per typed-tab result state
  const [people, setPeople] = useState<ListState<PersonResult>>(emptyListState());
  const [repos, setRepos] = useState<ListState<RepoResult>>(emptyListState());
  const [posts, setPosts] = useState<ListState<PostResult>>(emptyListState());
  const [snippets, setSnippets] = useState<ListState<SnippetResult>>(emptyListState());

  // Follow state
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followLoadingSet, setFollowLoadingSet] = useState<Set<string>>(new Set());

  // Per-tab sequence counters to guard race conditions
  const seqRef = useRef<Record<SearchTab, number>>({
    All: 0,
    People: 0,
    Repos: 0,
    Posts: 0,
    Snippets: 0,
  });

  // ---------------------------------------------------------------------------
  // Load pre-search data on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadRecentSearches().then(setRecentSearches);
    fetchTrendingHashtags()
      .then((res) => setTrendingHashtags(res.tags))
      .catch(() => {});
  }, []);

  // Auto-focus input on mount — keyboard shows immediately
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Search execution
  // ---------------------------------------------------------------------------
  const runAllSearch = useCallback(async (q: string) => {
    const seq = ++seqRef.current.All;
    setAllResults((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await searchAll(q);
      if (seq !== seqRef.current.All) return;
      setAllResults({
        users: res.users,
        repositories: res.repositories,
        posts: res.posts,
        snippets: res.snippets,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      if (seq !== seqRef.current.All) return;
      setAllResults((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Search failed.',
      }));
    }
  }, []);

  const runTypedSearch = useCallback(
    async (q: string, tab: Exclude<SearchTab, 'All'>, cursor?: string) => {
      const seq = ++seqRef.current[tab];
      const isLoadingMore = !!cursor;
      const type = TAB_TO_TYPE[tab];

      if (tab === 'People') {
        setPeople((prev) => ({ ...prev, isLoading: !isLoadingMore, isLoadingMore, error: null }));
      } else if (tab === 'Repos') {
        setRepos((prev) => ({ ...prev, isLoading: !isLoadingMore, isLoadingMore, error: null }));
      } else if (tab === 'Posts') {
        setPosts((prev) => ({ ...prev, isLoading: !isLoadingMore, isLoadingMore, error: null }));
      } else {
        setSnippets((prev) => ({ ...prev, isLoading: !isLoadingMore, isLoadingMore, error: null }));
      }

      try {
        const res = await searchByType(q, type, cursor);
        if (seq !== seqRef.current[tab]) return;

        if (tab === 'People') {
          setPeople((prev) => ({
            items: isLoadingMore ? [...prev.items, ...res.users] : res.users,
            nextCursor: res.nextCursor,
            total: res.total,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          }));
        } else if (tab === 'Repos') {
          setRepos((prev) => ({
            items: isLoadingMore ? [...prev.items, ...res.repositories] : res.repositories,
            nextCursor: res.nextCursor,
            total: res.total,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          }));
        } else if (tab === 'Posts') {
          setPosts((prev) => ({
            items: isLoadingMore ? [...prev.items, ...res.posts] : res.posts,
            nextCursor: res.nextCursor,
            total: res.total,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          }));
        } else {
          setSnippets((prev) => ({
            items: isLoadingMore ? [...prev.items, ...res.snippets] : res.snippets,
            nextCursor: res.nextCursor,
            total: res.total,
            isLoading: false,
            isLoadingMore: false,
            error: null,
          }));
        }
      } catch (err: unknown) {
        if (seq !== seqRef.current[tab]) return;
        const msg = err instanceof Error ? err.message : 'Search failed.';
        if (tab === 'People') {
          setPeople((prev) => ({ ...prev, isLoading: false, isLoadingMore: false, error: msg }));
        } else if (tab === 'Repos') {
          setRepos((prev) => ({ ...prev, isLoading: false, isLoadingMore: false, error: msg }));
        } else if (tab === 'Posts') {
          setPosts((prev) => ({ ...prev, isLoading: false, isLoadingMore: false, error: msg }));
        } else {
          setSnippets((prev) => ({ ...prev, isLoading: false, isLoadingMore: false, error: msg }));
        }
      }
    },
    [],
  );

  // Trigger search when debounced query or active tab changes
  useEffect(() => {
    if (!debouncedQuery) {
      setAllResults(emptyAllResults());
      setPeople(emptyListState());
      setRepos(emptyListState());
      setPosts(emptyListState());
      setSnippets(emptyListState());
      return;
    }
    if (activeTab === 'All') {
      runAllSearch(debouncedQuery);
    } else {
      const state = { People: people, Repos: repos, Posts: posts, Snippets: snippets }[activeTab];
      if (state.items.length === 0 && !state.isLoading && !state.error) {
        runTypedSearch(debouncedQuery, activeTab);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, activeTab]);

  // ---------------------------------------------------------------------------
  // Infinite scroll (typed tabs only — All tab uses ScrollView)
  // ---------------------------------------------------------------------------
  const handleLoadMore = useCallback(() => {
    if (activeTab === 'All') return;
    const state = { People: people, Repos: repos, Posts: posts, Snippets: snippets }[activeTab];
    if (!debouncedQuery || state.isLoadingMore || !state.nextCursor) return;
    runTypedSearch(debouncedQuery, activeTab, state.nextCursor);
  }, [activeTab, debouncedQuery, people, repos, posts, snippets, runTypedSearch]);

  // ---------------------------------------------------------------------------
  // Commit search — save to recent history
  // ---------------------------------------------------------------------------
  const commitSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    await saveRecentSearch(q.trim());
    const updated = await loadRecentSearches();
    setRecentSearches(updated);
  }, []);

  const handleSubmitEditing = useCallback(() => {
    if (query.trim()) commitSearch(query.trim());
  }, [query, commitSearch]);

  // ---------------------------------------------------------------------------
  // Recent search helpers
  // ---------------------------------------------------------------------------
  const handleQuerySelect = useCallback(
    (q: string) => {
      setQuery(q);
      commitSearch(q);
      inputRef.current?.blur();
    },
    [commitSearch],
  );

  const handleRemoveRecent = useCallback(async (q: string) => {
    await removeRecentSearch(q);
    setRecentSearches((prev) => prev.filter((r) => r !== q));
  }, []);

  const handleClearAll = useCallback(async () => {
    await clearAllRecentSearches();
    setRecentSearches([]);
  }, []);

  // ---------------------------------------------------------------------------
  // Follow
  // ---------------------------------------------------------------------------
  const handleFollow = useCallback(
    async (username: string) => {
      if (followLoadingSet.has(username) || followingSet.has(username)) return;
      setFollowLoadingSet((prev) => new Set(prev).add(username));
      try {
        await followUser(username);
        setFollowingSet((prev) => new Set(prev).add(username));
      } catch {
        // Silently ignore — user can retry
      } finally {
        setFollowLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(username);
          return next;
        });
      }
    },
    [followLoadingSet, followingSet],
  );

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const handlePersonPress = useCallback(
    (username: string) => router.push(`/profile/${username}`),
    [router],
  );

  const handleRepoPress = useCallback(
    (repo: RepoResult) => {
      const [owner, repoName] = repo.fullName.split('/');
      if (owner && repoName) router.push(`/repo/${owner}/${repoName}`);
    },
    [router],
  );

  const handlePostPress = useCallback(
    (postId: string) => router.push(`/post/${postId}`),
    [router],
  );

  const handleSnippetPress = useCallback(
    (id: string) => router.push(`/snippet/${id}`),
    [router],
  );

  const handleBack = useCallback(() => router.back(), [router]);

  // "See all" buttons in the All tab switch to that typed tab
  const handleSeeAllPeople = useCallback(() => setActiveTab('People'), []);
  const handleSeeAllRepos = useCallback(() => setActiveTab('Repos'), []);
  const handleSeeAllPosts = useCallback(() => setActiveTab('Posts'), []);
  const handleSeeAllSnippets = useCallback(() => setActiveTab('Snippets'), []);

  // ---------------------------------------------------------------------------
  // "All" tab — mixed sections, first 3 items per type, with See all links
  // ---------------------------------------------------------------------------
  function renderAllContent(): React.ReactNode {
    if (allResults.isLoading) return <SearchingView />;
    if (allResults.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.text}>{allResults.error}</Text>
        </View>
      );
    }

    const hasAny =
      allResults.users.length > 0 ||
      allResults.repositories.length > 0 ||
      allResults.posts.length > 0 ||
      allResults.snippets.length > 0;

    if (!hasAny && debouncedQuery) {
      return <EmptyState query={debouncedQuery} tab="All" />;
    }

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={allResultsStyles.content}
      >
        {allResults.users.length > 0 && (
          <View>
            <SectionHeading label="People" onSeeAll={handleSeeAllPeople} />
            {allResults.users.slice(0, 3).map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                isFollowing={followingSet.has(person.username)}
                isLoading={followLoadingSet.has(person.username)}
                onFollow={handleFollow}
                onPress={handlePersonPress}
              />
            ))}
          </View>
        )}

        {allResults.repositories.length > 0 && (
          <View>
            <SectionHeading label="Repositories" onSeeAll={handleSeeAllRepos} />
            {allResults.repositories.slice(0, 3).map((repo) => (
              <RepoRow key={repo.id} repo={repo} onPress={handleRepoPress} />
            ))}
          </View>
        )}

        {allResults.posts.length > 0 && (
          <View>
            <SectionHeading label="Posts" onSeeAll={handleSeeAllPosts} />
            {allResults.posts.slice(0, 3).map((post) => (
              <PostRow key={post.id} post={post} onPress={handlePostPress} />
            ))}
          </View>
        )}

        {allResults.snippets.length > 0 && (
          <View>
            <SectionHeading label="Snippets" onSeeAll={handleSeeAllSnippets} />
            {allResults.snippets.slice(0, 3).map((snippet) => (
              <SnippetRow key={snippet.id} snippet={snippet} onPress={handleSnippetPress} />
            ))}
          </View>
        )}

        <View style={allResultsStyles.bottomPad} />
      </ScrollView>
    );
  }

  const allResultsStyles = StyleSheet.create({
    content: {
      backgroundColor: Colors.background,
    },
    bottomPad: {
      height: 32,
    },
  });

  // ---------------------------------------------------------------------------
  // Typed tab content renderers
  // ---------------------------------------------------------------------------
  function renderPeopleContent(): React.ReactNode {
    if (people.isLoading) return <SearchingView />;
    if (people.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.text}>{people.error}</Text>
        </View>
      );
    }
    if (people.items.length === 0 && debouncedQuery) {
      return <EmptyState query={debouncedQuery} tab="People" />;
    }
    return (
      <FlatList
        data={people.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PersonRow
            person={item}
            isFollowing={followingSet.has(item.username)}
            isLoading={followLoadingSet.has(item.username)}
            onFollow={handleFollow}
            onPress={handlePersonPress}
          />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<LoadMoreFooter isLoadingMore={people.isLoadingMore} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listStyles.content}
      />
    );
  }

  function renderReposContent(): React.ReactNode {
    if (repos.isLoading) return <SearchingView />;
    if (repos.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.text}>{repos.error}</Text>
        </View>
      );
    }
    if (repos.items.length === 0 && debouncedQuery) {
      return <EmptyState query={debouncedQuery} tab="Repos" />;
    }
    return (
      <FlatList
        data={repos.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RepoRow repo={item} onPress={handleRepoPress} />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<LoadMoreFooter isLoadingMore={repos.isLoadingMore} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listStyles.content}
      />
    );
  }

  function renderPostsContent(): React.ReactNode {
    if (posts.isLoading) return <SearchingView />;
    if (posts.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.text}>{posts.error}</Text>
        </View>
      );
    }
    if (posts.items.length === 0 && debouncedQuery) {
      return <EmptyState query={debouncedQuery} tab="Posts" />;
    }
    return (
      <FlatList
        data={posts.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostRow post={item} onPress={handlePostPress} />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<LoadMoreFooter isLoadingMore={posts.isLoadingMore} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listStyles.content}
      />
    );
  }

  function renderSnippetsContent(): React.ReactNode {
    if (snippets.isLoading) return <SearchingView />;
    if (snippets.error) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.text}>{snippets.error}</Text>
        </View>
      );
    }
    if (snippets.items.length === 0 && debouncedQuery) {
      return <EmptyState query={debouncedQuery} tab="Snippets" />;
    }
    return (
      <FlatList
        data={snippets.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SnippetRow snippet={item} onPress={handleSnippetPress} />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<LoadMoreFooter isLoadingMore={snippets.isLoadingMore} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listStyles.content}
      />
    );
  }

  const tabRenderers: Record<SearchTab, () => React.ReactNode> = {
    All: renderAllContent,
    People: renderPeopleContent,
    Repos: renderReposContent,
    Posts: renderPostsContent,
    Snippets: renderSnippetsContent,
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={screenStyles.safeArea}>
      {/* Search bar header */}
      <View style={screenStyles.header}>
        <TouchableOpacity
          style={screenStyles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={screenStyles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={screenStyles.inputWrapper}>
          <Text style={screenStyles.inputIcon}>{'🔍'}</Text>
          <TextInput
            ref={inputRef}
            style={screenStyles.input}
            placeholder="Search developers, repos, posts..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSubmitEditing}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Text style={screenStyles.clearIcon}>{'✕'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content — pre-search state or tabbed results */}
      {!isQueryActive ? (
        <PreSearchView
          recentSearches={recentSearches}
          trendingHashtags={trendingHashtags}
          onQuerySelect={handleQuerySelect}
          onRemoveRecent={handleRemoveRecent}
          onClearAll={handleClearAll}
        />
      ) : (
        <View style={screenStyles.resultsContainer}>
          <TabBar activeTab={activeTab} onTabPress={setActiveTab} />
          <View style={screenStyles.tabContent}>
            {tabRenderers[activeTab]()}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  backIcon: {
    color: Colors.primaryLight,
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  inputIcon: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  clearIcon: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  resultsContainer: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
});

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  text: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

const listStyles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
});
