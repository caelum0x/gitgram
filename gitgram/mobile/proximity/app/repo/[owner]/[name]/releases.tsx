import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
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
  warning: '#FBBF24',
  warningBg: '#2B2000',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Release {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  isPrerelease: boolean;
  isDraft: boolean;
  authorUsername: string;
  createdAt: string;
  publishedAt: string | null;
  downloadCount: number;
  assetsCount: number;
}

interface ReleasesResponse {
  items: Release[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function excerptBody(body: string | null, maxLen = 120): string {
  if (!body) return '';
  const cleaned = body.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// TypeBadge
// ---------------------------------------------------------------------------

interface TypeBadgeProps {
  isPrerelease: boolean;
  isDraft: boolean;
  isLatest?: boolean;
}

function TypeBadge({ isPrerelease, isDraft, isLatest }: TypeBadgeProps) {
  if (isDraft) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.draft]}>
        <Text style={[badgeStyles.text, badgeStyles.draftText]}>Draft</Text>
      </View>
    );
  }
  if (isPrerelease) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.pre]}>
        <Text style={[badgeStyles.text, badgeStyles.preText]}>Pre-release</Text>
      </View>
    );
  }
  if (isLatest) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.latest]}>
        <Text style={[badgeStyles.text, badgeStyles.latestText]}>Latest</Text>
      </View>
    );
  }
  return null;
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '700' },
  latest: { backgroundColor: C.successBg, borderColor: C.success },
  latestText: { color: C.success },
  pre: { backgroundColor: C.warningBg, borderColor: C.warning },
  preText: { color: C.warning },
  draft: { backgroundColor: C.elevated, borderColor: C.border },
  draftText: { color: C.textMuted },
});

// ---------------------------------------------------------------------------
// Featured (latest) release card
// ---------------------------------------------------------------------------

interface FeaturedCardProps {
  release: Release;
  onPress: () => void;
}

function FeaturedCard({ release, onPress }: FeaturedCardProps) {
  const date = release.publishedAt
    ? formatDate(release.publishedAt)
    : formatDate(release.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [featStyles.card, pressed && featStyles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Latest release ${release.tagName}`}
    >
      {/* Header row */}
      <View style={featStyles.headerRow}>
        <Text style={featStyles.tagIcon}>🏷</Text>
        <Text style={featStyles.tag}>{release.tagName}</Text>
        <TypeBadge
          isPrerelease={release.isPrerelease}
          isDraft={release.isDraft}
          isLatest={!release.isPrerelease && !release.isDraft}
        />
      </View>

      {/* Title */}
      {release.name ? (
        <Text style={featStyles.title} numberOfLines={2}>
          {release.name}
        </Text>
      ) : null}

      {/* Changelog excerpt */}
      {release.body ? (
        <Text style={featStyles.excerpt} numberOfLines={3}>
          {excerptBody(release.body, 200)}
        </Text>
      ) : null}

      {/* Stats row */}
      <View style={featStyles.statsRow}>
        <View style={featStyles.statChip}>
          <Text style={featStyles.statIcon}>📅</Text>
          <Text style={featStyles.statText}>{date}</Text>
        </View>
        {release.downloadCount > 0 && (
          <View style={featStyles.statChip}>
            <Text style={featStyles.statIcon}>⬇</Text>
            <Text style={featStyles.statText}>
              {formatDownloads(release.downloadCount)} downloads
            </Text>
          </View>
        )}
        {release.assetsCount > 0 && (
          <View style={featStyles.statChip}>
            <Text style={featStyles.statIcon}>📦</Text>
            <Text style={featStyles.statText}>
              {release.assetsCount} {release.assetsCount === 1 ? 'asset' : 'assets'}
            </Text>
          </View>
        )}
      </View>

      <View style={featStyles.viewBtn}>
        <Text style={featStyles.viewBtnText}>View release →</Text>
      </View>
    </Pressable>
  );
}

const featStyles = StyleSheet.create({
  card: {
    margin: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.primary,
    gap: 10,
  },
  cardPressed: { opacity: 0.85 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tagIcon: { fontSize: 14 },
  tag: {
    color: C.primaryLight,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  title: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  excerpt: {
    color: C.textSec,
    fontSize: 13,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.elevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statIcon: { fontSize: 11 },
  statText: { color: C.textSec, fontSize: 12 },
  viewBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  viewBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },
});

// ---------------------------------------------------------------------------
// Release row (list item)
// ---------------------------------------------------------------------------

interface ReleaseRowProps {
  release: Release;
  onPress: () => void;
}

function ReleaseRow({ release, onPress }: ReleaseRowProps) {
  const date = release.publishedAt ?? release.createdAt;
  const excerpt = excerptBody(release.body);

  return (
    <Pressable
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Release ${release.tagName}`}
    >
      {/* Left: icon column */}
      <View style={rowStyles.iconCol}>
        <Text style={rowStyles.icon}>🔖</Text>
      </View>

      {/* Body */}
      <View style={rowStyles.body}>
        {/* Tag + badge */}
        <View style={rowStyles.topRow}>
          <Text style={rowStyles.tag}>{release.tagName}</Text>
          <TypeBadge isPrerelease={release.isPrerelease} isDraft={release.isDraft} />
        </View>

        {/* Title */}
        {release.name ? (
          <Text style={rowStyles.title} numberOfLines={1}>
            {release.name}
          </Text>
        ) : null}

        {/* Changelog excerpt */}
        {excerpt ? (
          <Text style={rowStyles.excerpt} numberOfLines={2}>
            {excerpt}
          </Text>
        ) : null}

        {/* Meta */}
        <View style={rowStyles.metaRow}>
          <Text style={rowStyles.metaText}>{timeAgo(date)}</Text>
          {release.downloadCount > 0 && (
            <Text style={rowStyles.metaText}>
              ⬇ {formatDownloads(release.downloadCount)}
            </Text>
          )}
          {release.assetsCount > 0 && (
            <Text style={rowStyles.metaText}>📦 {release.assetsCount}</Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      <Text style={rowStyles.chevron}>›</Text>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
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
  iconCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
    flexShrink: 0,
  },
  icon: { fontSize: 16 },
  body: { flex: 1, gap: 5 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    color: C.primaryLight,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  title: { color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  excerpt: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaText: { color: C.textMuted, fontSize: 11 },
  chevron: { color: C.textMuted, fontSize: 22, alignSelf: 'center' },
});

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { color: C.textSec, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyReleases() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>🔖</Text>
      <Text style={emptyStyles.text}>No releases yet</Text>
      <Text style={emptyStyles.sub}>Releases will appear here when published</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  icon: { fontSize: 40, marginBottom: 12 },
  text: { color: C.textSec, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sub: { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ReleasesScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const fetchReleases = useCallback(
    async (opts: { reset?: boolean } = {}) => {
      if (!owner || !name) return;
      if (loadingRef.current) return;
      loadingRef.current = true;

      const isReset = opts.reset !== false;
      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ limit: '20' });
        if (!isReset && cursor) params.set('cursor', cursor);

        const data = await apiClient<ReleasesResponse>(
          `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?${params}`,
        );

        const incoming = data.items ?? [];

        if (isReset) {
          setReleases(incoming);
        } else {
          setReleases((prev) => [...prev, ...incoming]);
        }

        setCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load releases');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [owner, name, cursor],
  );

  useEffect(() => {
    fetchReleases({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, name]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursor(null);
    setHasMore(true);
    setReleases([]);
    loadingRef.current = false;
    await fetchReleases({ reset: true });
    setRefreshing(false);
  }, [fetchReleases]);

  const handleEndReached = useCallback(() => {
    if (!hasMore || loadingRef.current || loadingMore) return;
    fetchReleases({ reset: false });
  }, [hasMore, loadingMore, fetchReleases]);

  const navigateTo = useCallback(
    (tagName: string) => {
      router.push(
        `/repo/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/release/${encodeURIComponent(tagName)}` as never,
      );
    },
    [router, owner, name],
  );

  const latestRelease = releases.find((r) => !r.isDraft);
  const otherReleases = latestRelease ? releases.filter((r) => r.id !== latestRelease.id) : releases;

  const keyExtractor = useCallback((item: Release) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Release }) => (
      <ReleaseRow release={item} onPress={() => navigateTo(item.tagName)} />
    ),
    [navigateTo],
  );

  const ListHeader = latestRelease ? (
    <>
      <SectionHeader title="Latest release" />
      <FeaturedCard release={latestRelease} onPress={() => navigateTo(latestRelease.tagName)} />
      {otherReleases.length > 0 && <SectionHeader title="All releases" />}
    </>
  ) : null;

  const ListFooter = loadingMore ? (
    <ActivityIndicator size="small" color={C.primary} style={styles.footerLoader} />
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {owner}/{name}
          </Text>
          <Text style={styles.navSubtitle}>Releases</Text>
        </View>

        {/* Spacer to balance back button */}
        <View style={styles.backBtn} />
      </View>

      {/* Content */}
      {loading && releases.length === 0 ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchReleases({ reset: true })}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<Release>
          data={otherReleases}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={!latestRelease ? <EmptyReleases /> : null}
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
          contentContainerStyle={releases.length === 0 ? styles.emptyContainer : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },

  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
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

  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footerLoader: { paddingVertical: 20 },
  emptyContainer: { flexGrow: 1 },

  errorBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
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
