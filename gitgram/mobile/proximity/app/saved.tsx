import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import { apiClient } from '../services/gitgramApi';
import { EmptyState } from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette
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
  error: '#F87171',
  danger: '#EF4444',
  white: '#FFFFFF',
} as const;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SavedTab = 'post' | 'snippet' | 'repository';

interface SavedAuthor {
  username: string;
  avatarUrl?: string | null;
}

/** A single saved entry. `savedId` is the id used for the DELETE call. */
interface SavedItem {
  /** Id of the save record (used to unsave via DELETE /v1/users/saved/:id). */
  savedId: string;
  /** Id of the underlying entity (post/snippet/repo). */
  entityId: string;
  type: SavedTab;
  title: string;
  subtitle: string | null;
  author: SavedAuthor | null;
  language: string | null;
  savedAt: string | null;
}

interface SavedResponse {
  items: SavedItem[];
  nextCursor: string | null;
}

interface TabConfig {
  key: SavedTab;
  label: string;
}

const TABS: readonly TabConfig[] = [
  { key: 'post', label: 'Posts' },
  { key: 'snippet', label: 'Snippets' },
  { key: 'repository', label: 'Repos' },
] as const;

const EMPTY_COPY: Record<SavedTab, { icon: string; title: string; subtitle: string }> = {
  post: {
    icon: '🔖',
    title: 'No saved posts',
    subtitle: 'Tap the bookmark on any post to keep it here.',
  },
  snippet: {
    icon: '✂️',
    title: 'No saved snippets',
    subtitle: 'Save code snippets you want to revisit later.',
  },
  repository: {
    icon: '📦',
    title: 'No saved repositories',
    subtitle: 'Bookmark repositories to find them quickly.',
  },
};

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------
async function fetchSaved(type: SavedTab, cursor?: string | null): Promise<SavedResponse> {
  const params = new URLSearchParams({ type, limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return apiClient<SavedResponse>(`/v1/users/saved?${params.toString()}`);
}

async function deleteSaved(savedId: string): Promise<void> {
  await apiClient<void>(`/v1/users/saved/${encodeURIComponent(savedId)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Saved row card
// ---------------------------------------------------------------------------
interface SavedCardProps {
  item: SavedItem;
  onPress: () => void;
  onUnsave: () => void;
}

function UnsaveAction({ onUnsave }: { onUnsave: () => void }) {
  return (
    <Pressable
      style={styles.swipeAction}
      onPress={onUnsave}
      accessibilityRole="button"
      accessibilityLabel="Unsave"
    >
      <Text style={styles.swipeActionIcon}>🗑️</Text>
      <Text style={styles.swipeActionLabel}>Unsave</Text>
    </Pressable>
  );
}

function SavedCard({ item, onPress, onUnsave }: SavedCardProps) {
  return (
    <Swipeable
      renderRightActions={() => <UnsaveAction onUnsave={onUnsave} />}
      overshootRight={false}
    >
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
      >
        <View style={styles.cardHeader}>
          {item.author?.avatarUrl ? (
            <Image
              source={{ uri: item.author.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : item.author ? (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {item.author.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : null}

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.author ? (
              <Text style={styles.cardAuthor} numberOfLines={1}>
                @{item.author.username}
              </Text>
            ) : null}
          </View>
        </View>

        {item.subtitle ? (
          <Text style={styles.cardSubtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}

        {item.language ? (
          <View style={styles.langRow}>
            <View style={styles.langDot} />
            <Text style={styles.langText}>{item.language}</Text>
          </View>
        ) : null}
      </Pressable>
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------
interface TabBarProps {
  active: SavedTab;
  onSelect: (tab: SavedTab) => void;
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
// Main screen
// ---------------------------------------------------------------------------
export default function SavedScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SavedTab>('post');
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadInitial = useCallback(
    async (tab: SavedTab, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await fetchSaved(tab);
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.nextCursor));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load saved items');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadInitial(activeTab);
  }, [activeTab, loadInitial]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchSaved(activeTab, cursor);
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load more items');
    } finally {
      setLoadingMore(false);
    }
  }, [activeTab, cursor, hasMore, loading, loadingMore]);

  const handleUnsave = useCallback(async (savedId: string) => {
    // Optimistic removal — restore the item if the request fails.
    let removed: SavedItem | undefined;
    setItems((prev) => {
      removed = prev.find((i) => i.savedId === savedId);
      return prev.filter((i) => i.savedId !== savedId);
    });

    try {
      await deleteSaved(savedId);
    } catch (err: unknown) {
      if (removed) {
        const restored = removed;
        setItems((prev) => [restored, ...prev]);
      }
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to unsave item');
    }
  }, []);

  const handleOpen = useCallback(
    (item: SavedItem) => {
      if (item.type === 'post') {
        router.push(`/post/${item.entityId}` as never);
      } else if (item.type === 'snippet') {
        router.push(`/snippet/${item.entityId}` as never);
      } else if (item.author) {
        router.push(`/repo/${item.author.username}/${item.title}` as never);
      }
    },
    [router],
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle?.toLowerCase().includes(q) ?? false) ||
        (item.author?.username.toLowerCase().includes(q) ?? false),
    );
  }, [items, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: SavedItem }) => (
      <SavedCard
        item={item}
        onPress={() => handleOpen(item)}
        onUnsave={() => handleUnsave(item.savedId)}
      />
    ),
    [handleOpen, handleUnsave],
  );

  const keyExtractor = useCallback((item: SavedItem) => item.savedId, []);

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
          subtitle="No saved items match your search."
        />
      );
    }
    const copy = EMPTY_COPY[activeTab];
    return <EmptyState icon={copy.icon} title={copy.title} subtitle={copy.subtitle} />;
  }, [loading, searchQuery, activeTab]);

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
        <Text style={styles.headerTitle}>Saved</Text>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.push('/search' as never)}
          accessibilityRole="button"
          accessibilityLabel="Filter"
        >
          <Text style={styles.headerIcon}>⚙︎</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* Inline search */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search saved..."
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
          <Pressable style={styles.retryButton} onPress={() => loadInitial(activeTab)}>
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
              onRefresh={() => loadInitial(activeTab, true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const AVATAR_SIZE = 36;

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
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
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
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.white,
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
    opacity: 0.75,
    backgroundColor: Colors.surfaceElevated,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
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
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 20,
  },
  cardAuthor: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primaryLight,
  },
  langText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Swipe-to-unsave action
  swipeAction: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginVertical: 5,
    marginRight: 12,
    borderRadius: 12,
  },
  swipeActionIcon: {
    fontSize: 20,
  },
  swipeActionLabel: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
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
