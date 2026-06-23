import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';
import { EmptyState } from '../../components/EmptyState';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette (matches snippet/[id].tsx)
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
  like: '#EF4444',
  likeInactive: '#475569',
  success: '#34D399',
  white: '#FFFFFF',
} as const;

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

const PAGE_SIZE = 20;
const CODE_PREVIEW_LINES = 5;

/** Languages offered as quick-filter pills (in display order). */
const LANGUAGE_FILTERS: readonly string[] = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Rust',
  'Go',
  'Java',
  'Swift',
  'Kotlin',
  'C++',
  'Ruby',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SnippetTab = 'trending' | 'latest' | 'mine' | 'saved';

interface SnippetAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SnippetListItem {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string | null;
  likesCount: number;
  isLiked: boolean;
  createdAt: string;
  author: SnippetAuthor;
}

interface SnippetListResponse {
  items: SnippetListItem[];
  nextCursor: string | null;
}

/** Shape returned by GET /v1/users/saved?type=snippet. */
interface SavedSnippetEntry {
  entityId: string;
  snippet?: SnippetListItem | null;
}

interface SavedSnippetResponse {
  items: SavedSnippetEntry[];
  nextCursor: string | null;
}

interface TabConfig {
  key: SnippetTab;
  label: string;
}

const TABS: readonly TabConfig[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'latest', label: 'Latest' },
  { key: 'mine', label: 'Mine' },
  { key: 'saved', label: 'Saved' },
] as const;

const EMPTY_COPY: Record<SnippetTab, { icon: string; title: string; subtitle: string }> = {
  trending: {
    icon: '🔥',
    title: 'Nothing trending yet',
    subtitle: 'Be the first to share a snippet the community loves.',
  },
  latest: {
    icon: '✂️',
    title: 'No snippets yet',
    subtitle: 'Fresh snippets will appear here as people post them.',
  },
  mine: {
    icon: '📝',
    title: 'You have no snippets',
    subtitle: 'Tap New to share your first code snippet.',
  },
  saved: {
    icon: '🔖',
    title: 'No saved snippets',
    subtitle: 'Save snippets you want to revisit later.',
  },
};

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------
function buildListQuery(
  tab: SnippetTab,
  language: string | null,
  cursor: string | null,
): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (language) params.set('language', language);
  if (cursor) params.set('cursor', cursor);
  if (tab === 'trending' || tab === 'latest') {
    params.set('sort', tab);
  }
  return params.toString();
}

async function fetchSnippets(
  tab: SnippetTab,
  language: string | null,
  cursor: string | null,
): Promise<SnippetListResponse> {
  const query = buildListQuery(tab, language, cursor);

  if (tab === 'mine') {
    return apiClient<SnippetListResponse>(`/v1/snippets/mine?${query}`);
  }

  if (tab === 'saved') {
    const saved = await apiClient<SavedSnippetResponse>(
      `/v1/users/saved?type=snippet&${query}`,
    );
    const items = (saved.items ?? [])
      .map((entry) => entry.snippet)
      .filter((snippet): snippet is SnippetListItem => Boolean(snippet));
    return { items, nextCursor: saved.nextCursor ?? null };
  }

  return apiClient<SnippetListResponse>(`/v1/snippets?${query}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function previewCode(code: string, lines: number): string {
  return code.split('\n').slice(0, lines).join('\n');
}

async function copyToClipboard(code: string): Promise<void> {
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(code);
  } catch {
    // Clipboard unavailable in this environment — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Language badge (dot + name)
// ---------------------------------------------------------------------------
function LangBadge({ language }: { language: string }) {
  const color = LANGUAGE_COLORS[language] ?? Colors.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{language}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <Pressable
      onPress={handleCopy}
      hitSlop={8}
      style={({ pressed }) => [
        styles.copyBtn,
        copied && styles.copyBtnDone,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Copy code"
    >
      <Text style={[styles.copyLabel, copied && styles.copyLabelDone]}>
        {copied ? 'Copied!' : 'Copy'}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Snippet card
// ---------------------------------------------------------------------------
interface SnippetCardProps {
  item: SnippetListItem;
  onPress: () => void;
}

function SnippetCard({ item, onPress }: SnippetCardProps) {
  const preview = useMemo(
    () => previewCode(item.code, CODE_PREVIEW_LINES),
    [item.code],
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open snippet ${item.title}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <LangBadge language={item.language} />
      </View>

      <View style={styles.codePreview}>
        <Text style={styles.codeText} numberOfLines={CODE_PREVIEW_LINES}>
          {preview}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.authorRow}>
          {item.author.avatarUrl ? (
            <Image
              source={{ uri: item.author.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {(item.author.username[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.authorName} numberOfLines={1}>
            @{item.author.username}
          </Text>
        </View>

        <View style={styles.footerActions}>
          <View style={styles.likeRow}>
            <Text style={[styles.likeIcon, item.isLiked && styles.likeIconActive]}>
              {'♥'}
            </Text>
            <Text style={styles.likeCount}>{formatCount(item.likesCount)}</Text>
          </View>
          <CopyButton code={item.code} />
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------
interface TabBarProps {
  active: SnippetTab;
  onSelect: (tab: SnippetTab) => void;
}

function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, selected && styles.tabActive]}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Language filter pills
// ---------------------------------------------------------------------------
interface LangPillsProps {
  active: string | null;
  onSelect: (language: string | null) => void;
}

function LangPills({ active, onSelect }: LangPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillRow}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        style={[styles.pill, active === null && styles.pillActive]}
        onPress={() => onSelect(null)}
        accessibilityRole="button"
        accessibilityState={{ selected: active === null }}
      >
        <Text style={[styles.pillLabel, active === null && styles.pillLabelActive]}>
          All
        </Text>
      </Pressable>
      {LANGUAGE_FILTERS.map((lang) => {
        const selected = lang === active;
        const color = LANGUAGE_COLORS[lang] ?? Colors.primaryLight;
        return (
          <Pressable
            key={lang}
            style={[
              styles.pill,
              selected && styles.pillActive,
              selected && { borderColor: color },
            ]}
            onPress={() => onSelect(selected ? null : lang)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={[styles.pillDot, { backgroundColor: color }]} />
            <Text style={[styles.pillLabel, selected && styles.pillLabelActive]}>
              {lang}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SnippetsScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SnippetTab>('trending');
  const [language, setLanguage] = useState<string | null>(null);
  const [items, setItems] = useState<SnippetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadInitial = useCallback(
    async (tab: SnippetTab, lang: string | null, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await fetchSnippets(tab, lang, null);
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.nextCursor));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load snippets');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadInitial(activeTab, language);
  }, [activeTab, language, loadInitial]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchSnippets(activeTab, language, cursor);
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more snippets');
    } finally {
      setLoadingMore(false);
    }
  }, [activeTab, language, cursor, hasMore, loading, loadingMore]);

  const handleOpen = useCallback(
    (item: SnippetListItem) => {
      router.push(`/snippet/${item.id}` as never);
    },
    [router],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.language.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        item.author.username.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: SnippetListItem }) => (
      <SnippetCard item={item} onPress={() => handleOpen(item)} />
    ),
    [handleOpen],
  );

  const keyExtractor = useCallback((item: SnippetListItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }, [loadingMore]);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    if (searchQuery.trim()) {
      return (
        <EmptyState
          icon="🔍"
          title="No matches"
          subtitle="No snippets match your search."
        />
      );
    }
    const copy = EMPTY_COPY[activeTab];
    return (
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        subtitle={copy.subtitle}
        actionLabel="New snippet"
        onAction={() => router.push('/snippet/create' as never)}
      />
    );
  }, [loading, searchQuery, activeTab, router]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.headerIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Snippets</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerButton}
            onPress={() => router.push('/search' as never)}
            accessibilityRole="button"
            accessibilityLabel="Filter"
          >
            <Text style={styles.headerIcon}>⚙︎</Text>
          </Pressable>
          <Pressable
            style={styles.newButton}
            onPress={() => router.push('/snippet/create' as never)}
            accessibilityRole="button"
            accessibilityLabel="New snippet"
          >
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* Language filter pills */}
      <LangPills active={language} onSelect={setLanguage} />

      {/* Inline search */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search snippets..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Content */}
      {loading && items.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => loadInitial(activeTab, language)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadInitial(activeTab, language, true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const AVATAR_SIZE = 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
    color: Colors.text,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.primary,
    borderRadius: 18,
  },
  newButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.white,
  },

  // Language pills
  pillRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 2,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillActive: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.primaryLight,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pillLabelActive: {
    color: Colors.text,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: Colors.text,
    fontSize: 15,
  },

  // List
  listContent: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingBottom: 32,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Card
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressed: {
    opacity: 0.8,
    backgroundColor: Colors.surfaceElevated,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 21,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 3,
    gap: 5,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Code preview
  codePreview: {
    marginTop: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    overflow: 'hidden',
  },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  authorName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: Colors.primaryLight,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  likeIcon: {
    fontSize: 15,
    color: Colors.likeInactive,
  },
  likeIconActive: {
    color: Colors.like,
  },
  likeCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  copyBtnDone: {
    borderColor: Colors.success,
    backgroundColor: `${Colors.success}22`,
  },
  copyLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  copyLabelDone: {
    color: Colors.success,
  },
  pressed: {
    opacity: 0.7,
  },

  // States
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: Colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '600',
  },
});
