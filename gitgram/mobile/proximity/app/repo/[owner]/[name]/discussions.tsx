import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  elevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  success: '#34D399',
  successBg: '#0D2B22',
  successBorder: '#16533E',
  answered: '#34D399',
  answeredBg: '#0D2B22',
  closed: '#64748B',
  closedBg: '#1A1A2E',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DiscussionStatus = 'open' | 'closed' | 'answered';
type CategoryFilter =
  | 'all'
  | 'announcements'
  | 'q_and_a'
  | 'ideas'
  | 'show_and_tell'
  | 'general';

interface DiscussionAuthor {
  username: string;
  avatarUrl: string | null;
}

interface Discussion {
  number: number;
  title: string;
  status: DiscussionStatus;
  category: string;
  categorySlug: CategoryFilter;
  author: DiscussionAuthor;
  createdAt: string;
  replyCount: number;
  reactionCount: number;
  isAnswered: boolean;
}

interface DiscussionsResponse {
  items: Discussion[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string): string {
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s ago`;
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusIcon(status: DiscussionStatus): string {
  switch (status) {
    case 'open': return '◎';
    case 'closed': return '⊗';
    case 'answered': return '✓';
  }
}

function statusColor(status: DiscussionStatus): string {
  switch (status) {
    case 'open': return C.primary;
    case 'closed': return C.closed;
    case 'answered': return C.answered;
  }
}

function categoryColor(slug: CategoryFilter): string {
  switch (slug) {
    case 'announcements': return '#F59E0B';
    case 'q_and_a': return '#3B82F6';
    case 'ideas': return '#EC4899';
    case 'show_and_tell': return '#10B981';
    case 'general': return '#8B5CF6';
    default: return C.textMuted;
  }
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
interface AvatarProps {
  uri: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 28 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[av.img, circle]}
        onError={() => setFailed(true)}
        accessibilityLabel={`${username} avatar`}
      />
    );
  }
  return (
    <View style={[av.placeholder, circle]}>
      <Text style={[av.initial, { fontSize: size * 0.4 }]}>
        {(username[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const av = StyleSheet.create({
  img: { overflow: 'hidden', borderWidth: 1, borderColor: C.primaryDark },
  placeholder: {
    backgroundColor: C.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { color: C.white, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------
function CategoryBadge({ label, slug }: { label: string; slug: CategoryFilter }) {
  const color = categoryColor(slug);
  return (
    <View style={[cb.container, { borderColor: color }]}>
      <Text style={[cb.text, { color }]}>{label}</Text>
    </View>
  );
}

const cb = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

// ---------------------------------------------------------------------------
// Discussion row
// ---------------------------------------------------------------------------
interface DiscussionRowProps {
  discussion: Discussion;
  onPress: () => void;
}

function DiscussionRow({ discussion, onPress }: DiscussionRowProps) {
  const iconColor = statusColor(discussion.status);

  return (
    <Pressable
      style={({ pressed }) => [dr.row, pressed && dr.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Discussion #${discussion.number}: ${discussion.title}`}
    >
      {/* Status icon */}
      <View style={[dr.iconWrap, { borderColor: iconColor }]}>
        <Text style={[dr.iconText, { color: iconColor }]}>
          {statusIcon(discussion.status)}
        </Text>
      </View>

      {/* Body */}
      <View style={dr.body}>
        <Text style={dr.title} numberOfLines={2}>{discussion.title}</Text>

        {/* Category + answered indicator */}
        <View style={dr.tagsRow}>
          <CategoryBadge label={discussion.category} slug={discussion.categorySlug} />
          {discussion.isAnswered && (
            <View style={dr.answeredBadge}>
              <Text style={dr.answeredText}>✓ Answered</Text>
            </View>
          )}
        </View>

        {/* Meta row */}
        <View style={dr.metaRow}>
          <Avatar uri={discussion.author.avatarUrl} username={discussion.author.username} size={14} />
          <Text style={dr.metaText}>{discussion.author.username}</Text>
          <Text style={dr.metaDot}>·</Text>
          <Text style={dr.metaText}>{timeAgo(discussion.createdAt)}</Text>
        </View>

        {/* Stats row */}
        <View style={dr.statsRow}>
          {discussion.replyCount > 0 && (
            <View style={dr.statChip}>
              <Text style={dr.statText}>💬 {discussion.replyCount}</Text>
            </View>
          )}
          {discussion.reactionCount > 0 && (
            <View style={dr.statChip}>
              <Text style={dr.statText}>🎉 {discussion.reactionCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.bg,
  },
  rowPressed: { backgroundColor: C.surface },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  iconText: { fontSize: 13, fontWeight: '700' },
  body: { flex: 1, gap: 6 },
  title: { color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  answeredBadge: {
    backgroundColor: C.answeredBg,
    borderWidth: 1,
    borderColor: C.successBorder,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  answeredText: { color: C.answered, fontSize: 10, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { color: C.textMuted, fontSize: 11 },
  metaDot: { color: C.textMuted, fontSize: 11 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statText: { color: C.textMuted, fontSize: 11 },
});

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------
const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'q_and_a', label: 'Q&A' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'show_and_tell', label: 'Show & Tell' },
  { key: 'general', label: 'General' },
];

interface FilterTabsProps {
  active: CategoryFilter;
  onSelect: (f: CategoryFilter) => void;
}

function FilterTabs({ active, onSelect }: FilterTabsProps) {
  return (
    <View style={ft.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ft.content}
        style={ft.scroll}
      >
        {CATEGORY_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[ft.tab, active === tab.key && ft.tabActive]}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active === tab.key }}
          >
            <Text style={[ft.label, active === tab.key && ft.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const ft = StyleSheet.create({
  wrapper: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  scroll: {},
  content: { paddingHorizontal: 12, gap: 4 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.primary },
  label: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  labelActive: { color: C.primary },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyDiscussions({ category }: { category: CategoryFilter }) {
  const label = CATEGORY_TABS.find((t) => t.key === category)?.label ?? 'Discussions';
  return (
    <View style={em.container}>
      <Text style={em.icon}>💬</Text>
      <Text style={em.text}>No {category === 'all' ? 'discussions' : label.toLowerCase()} yet</Text>
    </View>
  );
}

const em = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 60 },
  icon: { fontSize: 40, marginBottom: 12 },
  text: { color: C.textMuted, fontSize: 15 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DiscussionsScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');

  const loadingRef = useRef(false);

  const buildUrl = useCallback(
    (nextCursor?: string | null): string => {
      const params = new URLSearchParams({ limit: '20' });
      if (category !== 'all') params.set('category', category);
      if (nextCursor) params.set('cursor', nextCursor);
      const enc = encodeURIComponent;
      return `/v1/repositories/${enc(owner ?? '')}/${enc(name ?? '')}/discussions?${params}`;
    },
    [owner, name, category],
  );

  const fetchDiscussions = useCallback(
    async (opts: { reset?: boolean } = {}) => {
      if (!owner || !name || loadingRef.current) return;
      loadingRef.current = true;
      const isReset = opts.reset !== false;
      if (isReset) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const nextCursor = isReset ? null : cursor;
        const data = await apiClient<DiscussionsResponse>(buildUrl(nextCursor));
        const incoming = data.items ?? [];

        if (isReset) {
          setDiscussions(incoming);
        } else {
          setDiscussions((prev) => [...prev, ...incoming]);
        }

        setCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load discussions');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [owner, name, cursor, buildUrl],
  );

  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    setDiscussions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    fetchDiscussions({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursor(null);
    setHasMore(true);
    setDiscussions([]);
    loadingRef.current = false;
    await fetchDiscussions({ reset: true });
    setRefreshing(false);
  }, [fetchDiscussions]);

  const handleEndReached = useCallback(() => {
    if (!hasMore || loadingRef.current || loadingMore) return;
    fetchDiscussions({ reset: false });
  }, [hasMore, loadingMore, fetchDiscussions]);

  const handlePressDiscussion = useCallback(
    (d: Discussion) => {
      const enc = encodeURIComponent;
      router.push(
        `/repo/${enc(owner ?? '')}/${enc(name ?? '')}/discussion/${d.number}` as never,
      );
    },
    [router, owner, name],
  );

  const keyExtractor = useCallback((item: Discussion) => String(item.number), []);

  const renderItem = useCallback(
    ({ item }: { item: Discussion }) => (
      <DiscussionRow discussion={item} onPress={() => handlePressDiscussion(item)} />
    ),
    [handlePressDiscussion],
  );

  const ListFooter = loadingMore ? (
    <ActivityIndicator size="small" color={C.primary} style={s.footerLoader} />
  ) : null;

  return (
    <SafeAreaView style={s.safeArea}>
      {/* Nav bar */}
      <View style={s.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <View style={s.navCenter}>
          <Text style={s.navTitle} numberOfLines={1}>{owner}/{name}</Text>
          <Text style={s.navSubtitle}>Discussions</Text>
        </View>

        <TouchableOpacity
          style={s.newBtn}
          onPress={() => {
            const enc = encodeURIComponent;
            router.push(
              `/repo/${enc(owner ?? '')}/${enc(name ?? '')}/discussions/new` as never,
            );
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="New discussion"
        >
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter tabs */}
      <FilterTabs active={category} onSelect={setCategory} />

      {/* List */}
      {loading && discussions.length === 0 ? (
        <View style={s.centerLoader}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error !== null ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchDiscussions({ reset: true })}
            style={s.retryBtn}
            accessibilityRole="button"
          >
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<Discussion>
          data={discussions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={<EmptyDiscussions category={category} />}
          contentContainerStyle={discussions.length === 0 ? s.emptyContainer : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },

  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: C.primaryLight,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  navSubtitle: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.primary,
  },
  newBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },

  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footerLoader: { paddingVertical: 20 },
  emptyContainer: { flexGrow: 1 },

  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: {
    color: C.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 20,
  },
  retryText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
