import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import { apiClient } from '../services/gitgramApi';
import { EmptyState } from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette (proximity)
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
  success: '#34D399',
  warning: '#FBBF24',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ReadingStatus = 'unread' | 'reading' | 'read' | 'archived';
type SourceType = 'post' | 'snippet' | 'repository';
type FilterKey = 'unread' | 'all' | 'archived';

/** A single reading-list entry returned from the API. */
interface ReadingItem {
  /** Id of the reading-list record (used for PATCH and routing back). */
  id: string;
  /** Id of the underlying entity (post/snippet/repo). */
  entityId: string;
  sourceType: SourceType;
  title: string;
  author: string | null;
  /** Estimated reading time in minutes. */
  estimatedMinutes: number | null;
  /** ISO timestamp the item was saved. */
  savedAt: string | null;
  /** Read progress 0–1. */
  progress: number;
  status: ReadingStatus;
}

interface ReadingListResponse {
  items: ReadingItem[];
}

interface FilterConfig {
  key: FilterKey;
  label: string;
}

const FILTERS: readonly FilterConfig[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'All' },
  { key: 'archived', label: 'Archived' },
] as const;

const SOURCE_ICON: Record<SourceType, string> = {
  post: '📝',
  snippet: '✂️',
  repository: '📦',
} as const;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function formatReadTime(minutes: number | null): string {
  if (minutes == null || minutes <= 0) {
    return 'Quick read';
  }
  if (minutes < 60) {
    return `${minutes} min read`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr read`;
}

function formatSavedDate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const diffMs = Date.now() - then;
  const day = 86_400_000;
  if (diffMs < day) {
    return 'Saved today';
  }
  if (diffMs < 2 * day) {
    return 'Saved yesterday';
  }
  const days = Math.floor(diffMs / day);
  if (days < 7) {
    return `Saved ${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  return `Saved ${weeks}w ago`;
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------
async function fetchReadingList(filter: FilterKey): Promise<ReadingListResponse> {
  const params = new URLSearchParams({ filter });
  return apiClient<ReadingListResponse>(`/v1/users/reading-list?${params.toString()}`);
}

async function patchReadingItem(id: string, status: ReadingStatus): Promise<void> {
  await apiClient<void>(`/v1/users/reading-list/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ---------------------------------------------------------------------------
// Swipe actions
// ---------------------------------------------------------------------------
interface SwipeActionProps {
  onArchive: () => void;
  onRemove: () => void;
  onMarkRead: () => void;
}

function RightActions({ onArchive, onRemove }: Pick<SwipeActionProps, 'onArchive' | 'onRemove'>) {
  return (
    <View style={styles.swipeGroup}>
      <Pressable
        style={[styles.swipeAction, styles.swipeArchive]}
        onPress={onArchive}
        accessibilityRole="button"
        accessibilityLabel="Archive"
      >
        <Text style={styles.swipeActionIcon}>🗄️</Text>
        <Text style={styles.swipeActionLabel}>Archive</Text>
      </Pressable>
      <Pressable
        style={[styles.swipeAction, styles.swipeRemove]}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove"
      >
        <Text style={styles.swipeActionIcon}>🗑️</Text>
        <Text style={styles.swipeActionLabel}>Remove</Text>
      </Pressable>
    </View>
  );
}

function LeftAction({ onMarkRead }: Pick<SwipeActionProps, 'onMarkRead'>) {
  return (
    <Pressable
      style={[styles.swipeAction, styles.swipeRead]}
      onPress={onMarkRead}
      accessibilityRole="button"
      accessibilityLabel="Mark read"
    >
      <Text style={styles.swipeActionIcon}>✓</Text>
      <Text style={styles.swipeActionLabel}>Read</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Reading row card
// ---------------------------------------------------------------------------
interface ReadingCardProps {
  item: ReadingItem;
  onPress: () => void;
  onArchive: () => void;
  onRemove: () => void;
  onMarkRead: () => void;
}

function ReadingCard({ item, onPress, onArchive, onRemove, onMarkRead }: ReadingCardProps) {
  const progress = clampProgress(item.progress);
  const isRead = item.status === 'read';

  return (
    <Swipeable
      renderRightActions={() => <RightActions onArchive={onArchive} onRemove={onRemove} />}
      renderLeftActions={() => <LeftAction onMarkRead={onMarkRead} />}
      overshootRight={false}
      overshootLeft={false}
    >
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.title}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceIcon}>{SOURCE_ICON[item.sourceType]}</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={[styles.cardTitle, isRead && styles.cardTitleRead]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.author ? (
              <Text style={styles.cardAuthor} numberOfLines={1}>
                @{item.author}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatReadTime(item.estimatedMinutes)}</Text>
          {formatSavedDate(item.savedAt) ? (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{formatSavedDate(item.savedAt)}</Text>
            </>
          ) : null}
        </View>

        <View style={styles.progressTrack} accessibilityLabel={`${Math.round(progress * 100)}% read`}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%` },
              isRead && styles.progressFillRead,
            ]}
          />
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------
interface FilterBarProps {
  active: FilterKey;
  onSelect: (filter: FilterKey) => void;
}

function FilterBar({ active, onSelect }: FilterBarProps) {
  return (
    <View style={styles.filterBar}>
      {FILTERS.map((filter) => {
        const selected = filter.key === active;
        return (
          <Pressable
            key={filter.key}
            style={[styles.filter, selected && styles.filterActive]}
            onPress={() => onSelect(filter.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.filterLabel, selected && styles.filterLabelActive]}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty-state copy per filter
// ---------------------------------------------------------------------------
const EMPTY_COPY: Record<FilterKey, { icon: string; title: string; subtitle: string }> = {
  unread: {
    icon: '📖',
    title: 'Nothing to read yet',
    subtitle: 'Save posts, snippets, or repos to your reading list to read them later.',
  },
  all: {
    icon: '📚',
    title: 'Your reading list is empty',
    subtitle: 'Tap "Read later" on any long-form content to build your list.',
  },
  archived: {
    icon: '🗄️',
    title: 'No archived items',
    subtitle: 'Items you archive from your reading list will appear here.',
  },
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function ReadingListScreen() {
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('unread');
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (filter: FilterKey, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await fetchReadingList(filter);
        setItems(data.items ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load reading list');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(activeFilter);
  }, [activeFilter, load]);

  // Optimistic status mutation. The item is removed from the current list when
  // the new status no longer matches the active filter; the change is reverted
  // if the PATCH fails.
  const mutateStatus = useCallback(
    async (item: ReadingItem, status: ReadingStatus, errorLabel: string) => {
      const staysVisible =
        activeFilter === 'all' ||
        (activeFilter === 'unread' && status === 'unread') ||
        (activeFilter === 'archived' && status === 'archived');

      const snapshot = items;
      setItems((prev) =>
        staysVisible
          ? prev.map((i) => (i.id === item.id ? { ...i, status } : i))
          : prev.filter((i) => i.id !== item.id),
      );

      try {
        await patchReadingItem(item.id, status);
      } catch (err: unknown) {
        setItems(snapshot);
        Alert.alert('Error', err instanceof Error ? err.message : errorLabel);
      }
    },
    [activeFilter, items],
  );

  const handleArchive = useCallback(
    (item: ReadingItem) => mutateStatus(item, 'archived', 'Failed to archive item'),
    [mutateStatus],
  );

  const handleMarkRead = useCallback(
    (item: ReadingItem) => mutateStatus(item, 'read', 'Failed to mark item read'),
    [mutateStatus],
  );

  const handleRemove = useCallback(async (item: ReadingItem) => {
    const snapshot = await new Promise<ReadingItem[]>((resolve) => {
      setItems((prev) => {
        resolve(prev);
        return prev.filter((i) => i.id !== item.id);
      });
    });

    try {
      // Removal is modelled as a status transition; the backend prunes the row.
      await apiClient<void>(`/v1/users/reading-list/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
    } catch (err: unknown) {
      setItems(snapshot);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove item');
    }
  }, []);

  const handleOpen = useCallback(
    (item: ReadingItem) => {
      if (item.sourceType === 'post') {
        router.push(`/post/${item.entityId}` as never);
      } else if (item.sourceType === 'snippet') {
        router.push(`/snippet/${item.entityId}` as never);
      } else if (item.author) {
        router.push(`/repo/${item.author}/${item.entityId}` as never);
      }
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ReadingItem }) => (
      <ReadingCard
        item={item}
        onPress={() => handleOpen(item)}
        onArchive={() => handleArchive(item)}
        onRemove={() => handleRemove(item)}
        onMarkRead={() => handleMarkRead(item)}
      />
    ),
    [handleOpen, handleArchive, handleRemove, handleMarkRead],
  );

  const keyExtractor = useCallback((item: ReadingItem) => item.id, []);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    const copy = EMPTY_COPY[activeFilter];
    return <EmptyState icon={copy.icon} title={copy.title} subtitle={copy.subtitle} />;
  }, [loading, activeFilter]);

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
        <Text style={styles.headerTitle}>Reading List</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Filters */}
      <FilterBar active={activeFilter} onSelect={setActiveFilter} />

      {/* Content */}
      {loading && items.length === 0 ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => load(activeFilter)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(activeFilter, true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const SOURCE_SIZE = 36;

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

  // Filters
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterLabelActive: {
    color: Colors.white,
  },

  // List
  listContent: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingBottom: 32,
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
  sourceBadge: {
    width: SOURCE_SIZE,
    height: SOURCE_SIZE,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceIcon: {
    fontSize: 18,
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
  cardTitleRead: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  cardAuthor: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textMuted,
  },

  // Progress
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceElevated,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.primaryLight,
  },
  progressFillRead: {
    backgroundColor: Colors.success,
  },

  // Swipe actions
  swipeGroup: {
    flexDirection: 'row',
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 84,
    marginVertical: 5,
    borderRadius: 12,
  },
  swipeArchive: {
    backgroundColor: Colors.warning,
  },
  swipeRemove: {
    backgroundColor: Colors.error,
    marginRight: 12,
  },
  swipeRead: {
    backgroundColor: Colors.success,
    marginLeft: 12,
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
