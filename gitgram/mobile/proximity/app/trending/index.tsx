import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';
import { EmptyState } from '../../components/EmptyState';
import TrendingRepoCard from '../../components/TrendingRepoCard';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette (matches proximity dark theme)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  white: '#FFFFFF',
} as const;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TrendingTab = 'repos' | 'developers' | 'snippets' | 'hashtags';
type TrendingPeriod = 'day' | 'week' | 'month';

interface PeriodConfig {
  key: TrendingPeriod;
  label: string;
}

interface TabConfig {
  key: TrendingTab;
  label: string;
}

const PERIODS: readonly PeriodConfig[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
] as const;

const TABS: readonly TabConfig[] = [
  { key: 'repos', label: 'Repos' },
  { key: 'developers', label: 'Developers' },
  { key: 'snippets', label: 'Snippets' },
  { key: 'hashtags', label: 'Hashtags' },
] as const;

interface TrendingRepo {
  fullName: string;
  description?: string | null;
  language?: string | null;
  stars: number;
  forks: number;
  htmlUrl: string;
  starsThisPeriod: number;
}

interface TrendingDeveloper {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  newFollowersThisPeriod: number;
  isFollowing: boolean;
}

interface TrendingSnippet {
  id: string;
  title: string;
  language: string | null;
  authorUsername: string;
  likesThisPeriod: number;
  code: string;
}

interface TrendingHashtag {
  tag: string;
  postCount: number;
}

interface TrendingReposResponse {
  items: TrendingRepo[];
  nextCursor: string | null;
}

interface TrendingDevelopersResponse {
  items: TrendingDeveloper[];
  nextCursor: string | null;
}

interface TrendingSnippetsResponse {
  items: TrendingSnippet[];
  nextCursor: string | null;
}

interface TrendingHashtagsResponse {
  items: TrendingHashtag[];
  nextCursor: string | null;
}

type TrendingItem =
  | TrendingRepo
  | TrendingDeveloper
  | TrendingSnippet
  | TrendingHashtag;

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------
function buildQuery(period: TrendingPeriod, cursor?: string | null): string {
  const params = new URLSearchParams({
    period,
    limit: String(PAGE_SIZE),
  });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

async function fetchRepos(
  period: TrendingPeriod,
  cursor?: string | null,
): Promise<TrendingReposResponse> {
  return apiClient<TrendingReposResponse>(
    `/v1/trending/repos?${buildQuery(period, cursor)}`,
  );
}

async function fetchDevelopers(
  period: TrendingPeriod,
  cursor?: string | null,
): Promise<TrendingDevelopersResponse> {
  return apiClient<TrendingDevelopersResponse>(
    `/v1/trending/developers?${buildQuery(period, cursor)}`,
  );
}

async function fetchSnippets(
  period: TrendingPeriod,
  cursor?: string | null,
): Promise<TrendingSnippetsResponse> {
  return apiClient<TrendingSnippetsResponse>(
    `/v1/trending/snippets?${buildQuery(period, cursor)}`,
  );
}

async function fetchHashtags(
  cursor?: string | null,
): Promise<TrendingHashtagsResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return apiClient<TrendingHashtagsResponse>(
    `/v1/hashtags/trending?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function rankColor(rank: number): string {
  if (rank === 1) return Colors.gold;
  if (rank === 2) return Colors.silver;
  if (rank === 3) return Colors.bronze;
  return Colors.surfaceElevated;
}

function rankTextColor(rank: number): string {
  return rank <= 3 ? '#0F0F1A' : Colors.textSecondary;
}

// ---------------------------------------------------------------------------
// Rank badge
// ---------------------------------------------------------------------------
function RankBadge({ rank }: { rank: number }) {
  return (
    <View style={[styles.rankBadge, { backgroundColor: rankColor(rank) }]}>
      <Text style={[styles.rankText, { color: rankTextColor(rank) }]}>
        {rank}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Repo row — rank badge + TrendingRepoCard + stars-gained pill
// ---------------------------------------------------------------------------
function RepoRow({ repo, rank }: { repo: TrendingRepo; rank: number }) {
  return (
    <View style={styles.rankRow}>
      <RankBadge rank={rank} />
      <View style={styles.rankRowBody}>
        <TrendingRepoCard
          repo={{
            fullName: repo.fullName,
            description: repo.description ?? undefined,
            language: repo.language ?? undefined,
            stars: repo.stars,
            forks: repo.forks,
            htmlUrl: repo.htmlUrl,
          }}
        />
        <View style={styles.gainPillWrap}>
          <Text style={styles.gainPill}>
            ⭐ +{formatCount(repo.starsThisPeriod)} this period
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Developer row — avatar + new followers + Follow button
// ---------------------------------------------------------------------------
interface DeveloperRowProps {
  dev: TrendingDeveloper;
  rank: number;
  onToggleFollow: (dev: TrendingDeveloper) => void;
  onPress: (username: string) => void;
}

function DeveloperRow({ dev, rank, onToggleFollow, onPress }: DeveloperRowProps) {
  return (
    <Pressable
      style={styles.devCard}
      onPress={() => onPress(dev.username)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${dev.username}'s profile`}
    >
      <RankBadge rank={rank} />
      {dev.avatarUrl ? (
        <Image source={{ uri: dev.avatarUrl }} style={styles.devAvatar} />
      ) : (
        <View style={[styles.devAvatar, styles.devAvatarFallback]}>
          <Text style={styles.devAvatarInitial}>
            {(dev.displayName ?? dev.username).charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.devInfo}>
        <Text style={styles.devName} numberOfLines={1}>
          {dev.displayName ?? dev.username}
        </Text>
        <Text style={styles.devMeta} numberOfLines={1}>
          @{dev.username} · +{formatCount(dev.newFollowersThisPeriod)} followers
        </Text>
      </View>
      <Pressable
        style={[styles.followBtn, dev.isFollowing && styles.followingBtn]}
        onPress={() => onToggleFollow(dev)}
        accessibilityRole="button"
        accessibilityLabel={dev.isFollowing ? 'Unfollow' : 'Follow'}
        hitSlop={8}
      >
        <Text
          style={[
            styles.followBtnText,
            dev.isFollowing && styles.followingBtnText,
          ]}
        >
          {dev.isFollowing ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Snippet row
// ---------------------------------------------------------------------------
function SnippetRow({
  snippet,
  rank,
  onPress,
}: {
  snippet: TrendingSnippet;
  rank: number;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable
      style={styles.snippetCard}
      onPress={() => onPress(snippet.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open snippet ${snippet.title}`}
    >
      <View style={styles.snippetHeader}>
        <RankBadge rank={rank} />
        <Text style={styles.snippetTitle} numberOfLines={1}>
          {snippet.title}
        </Text>
      </View>
      <View style={styles.snippetCodeBox}>
        <Text style={styles.snippetCode} numberOfLines={4}>
          {snippet.code}
        </Text>
      </View>
      <View style={styles.snippetMeta}>
        {snippet.language ? (
          <Text style={styles.snippetLang}>{snippet.language}</Text>
        ) : null}
        <Text style={styles.snippetAuthor} numberOfLines={1}>
          @{snippet.authorUsername}
        </Text>
        <Text style={styles.snippetLikes}>
          ❤️ +{formatCount(snippet.likesThisPeriod)}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Hashtag pill
// ---------------------------------------------------------------------------
function HashtagPill({
  hashtag,
  rank,
  onPress,
}: {
  hashtag: TrendingHashtag;
  rank: number;
  onPress: (tag: string) => void;
}) {
  return (
    <Pressable
      style={styles.hashtagPill}
      onPress={() => onPress(hashtag.tag)}
      accessibilityRole="button"
      accessibilityLabel={`Open #${hashtag.tag}`}
    >
      <Text style={styles.hashtagRank}>#{rank}</Text>
      <Text style={styles.hashtagTag} numberOfLines={1}>
        #{hashtag.tag}
      </Text>
      <Text style={styles.hashtagCount}>{formatCount(hashtag.postCount)} posts</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function TrendingScreen() {
  const router = useRouter();

  const [period, setPeriod] = useState<TrendingPeriod>('day');
  const [tab, setTab] = useState<TrendingTab>('repos');

  const [items, setItems] = useState<TrendingItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (
      nextCursor: string | null,
      activeTab: TrendingTab,
      activePeriod: TrendingPeriod,
    ): Promise<{ items: TrendingItem[]; nextCursor: string | null }> => {
      switch (activeTab) {
        case 'repos': {
          const res = await fetchRepos(activePeriod, nextCursor);
          return { items: res.items, nextCursor: res.nextCursor };
        }
        case 'developers': {
          const res = await fetchDevelopers(activePeriod, nextCursor);
          return { items: res.items, nextCursor: res.nextCursor };
        }
        case 'snippets': {
          const res = await fetchSnippets(activePeriod, nextCursor);
          return { items: res.items, nextCursor: res.nextCursor };
        }
        case 'hashtags': {
          const res = await fetchHashtags(nextCursor);
          return { items: res.items, nextCursor: res.nextCursor };
        }
        default:
          return { items: [], nextCursor: null };
      }
    },
    [],
  );

  const loadInitial = useCallback(
    async (activeTab: TrendingTab, activePeriod: TrendingPeriod) => {
      setLoading(true);
      setError(null);
      try {
        const res = await loadPage(null, activeTab, activePeriod);
        setItems(res.items);
        setCursor(res.nextCursor);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load trending.');
        setItems([]);
        setCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [loadPage],
  );

  useEffect(() => {
    loadInitial(tab, period);
  }, [tab, period, loadInitial]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await loadPage(null, tab, period);
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to refresh.');
    } finally {
      setRefreshing(false);
    }
  }, [loadPage, tab, period]);

  const handleEndReached = useCallback(async () => {
    if (loadingMore || loading || refreshing || !cursor) return;
    setLoadingMore(true);
    try {
      const res = await loadPage(cursor, tab, period);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch {
      // Pagination failures are non-fatal; keep what we have.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, cursor, loadPage, tab, period]);

  const handleToggleFollow = useCallback((dev: TrendingDeveloper) => {
    // Optimistic toggle; a full implementation calls followUser/unfollowUser.
    setItems((prev) =>
      prev.map((it) =>
        'username' in it && it.id === dev.id
          ? {
              ...it,
              isFollowing: !dev.isFollowing,
              newFollowersThisPeriod:
                dev.newFollowersThisPeriod + (dev.isFollowing ? -1 : 1),
            }
          : it,
      ),
    );
  }, []);

  const openProfile = useCallback(
    (username: string) => router.push(`/profile/${username}`),
    [router],
  );
  const openSnippet = useCallback(
    (id: string) => router.push(`/snippet/${id}`),
    [router],
  );
  const openHashtag = useCallback(
    (t: string) => router.push(`/hashtag/${t}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: TrendingItem; index: number }) => {
      const rank = index + 1;
      switch (tab) {
        case 'repos':
          return <RepoRow repo={item as TrendingRepo} rank={rank} />;
        case 'developers':
          return (
            <DeveloperRow
              dev={item as TrendingDeveloper}
              rank={rank}
              onToggleFollow={handleToggleFollow}
              onPress={openProfile}
            />
          );
        case 'snippets':
          return (
            <SnippetRow
              snippet={item as TrendingSnippet}
              rank={rank}
              onPress={openSnippet}
            />
          );
        case 'hashtags':
          return (
            <HashtagPill
              hashtag={item as TrendingHashtag}
              rank={rank}
              onPress={openHashtag}
            />
          );
        default:
          return null;
      }
    },
    [tab, handleToggleFollow, openProfile, openSnippet, openHashtag],
  );

  const keyExtractor = useCallback(
    (item: TrendingItem, index: number): string => {
      if ('fullName' in item) return `repo-${item.fullName}`;
      if ('username' in item) return `dev-${item.id}`;
      if ('code' in item) return `snippet-${item.id}`;
      if ('tag' in item) return `tag-${item.tag}`;
      return String(index);
    },
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trending</Text>
      </View>

      {/* Time period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              style={[styles.periodChip, active && styles.periodChipActive]}
              onPress={() => setPeriod(p.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.periodChipText,
                  active && styles.periodChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState
            icon="⚠️"
            title="Couldn't load trending"
            subtitle={error}
            actionLabel="Retry"
            onAction={() => loadInitial(tab, period)}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={
            items.length === 0 ? styles.emptyContent : styles.listContent
          }
          numColumns={tab === 'hashtags' ? 2 : 1}
          key={tab === 'hashtags' ? 'grid' : 'list'}
          columnWrapperStyle={tab === 'hashtags' ? styles.hashtagColumn : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primaryLight}
              colors={[Colors.primary]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="📈"
              title="Nothing trending yet"
              subtitle="Check back soon to see what's hot."
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={Colors.primaryLight} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  periodChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: Colors.white,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.text,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    width: '60%',
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 32,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  // Rank
  rankRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 12,
  },
  rankRowBody: {
    flex: 1,
  },
  rankBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: 12,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '800',
  },
  gainPillWrap: {
    paddingLeft: 16,
    paddingBottom: 6,
    marginTop: -2,
  },
  gainPill: {
    alignSelf: 'flex-start',
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  // Developer
  devCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  devAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
  },
  devAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  devAvatarInitial: {
    color: Colors.primaryLight,
    fontSize: 18,
    fontWeight: '700',
  },
  devInfo: {
    flex: 1,
  },
  devName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  devMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  followingBtnText: {
    color: Colors.textSecondary,
  },
  // Snippet
  snippetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  snippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  snippetTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  snippetCodeBox: {
    backgroundColor: '#0B0B14',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  snippetCode: {
    color: '#A5B4FC',
    fontSize: 12,
    fontFamily: 'Courier',
    lineHeight: 18,
  },
  snippetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  snippetLang: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  snippetAuthor: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  snippetLikes: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  // Hashtag
  hashtagColumn: {
    paddingHorizontal: 12,
    gap: 12,
  },
  hashtagPill: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  hashtagRank: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  hashtagTag: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  hashtagCount: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
});
