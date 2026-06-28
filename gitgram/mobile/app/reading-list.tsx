import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../constants/Colors';
import Header from '../components/navigation/Header';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  userService,
  ReadingItem,
  ReadingStatus,
  ReadingSourceType,
  ReadingFilter,
} from '../services/userService';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

interface FilterConfig {
  key: ReadingFilter;
  label: string;
}

const FILTERS: readonly FilterConfig[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'All' },
  { key: 'archived', label: 'Archived' },
] as const;

const SOURCE_ICON: Record<ReadingSourceType, string> = {
  post: 'article',
  snippet: 'code',
  repository: 'folder',
} as const;

const EMPTY_COPY: Record<ReadingFilter, { icon: string; title: string; message: string }> = {
  unread: {
    icon: '📖',
    title: 'Nothing to read yet',
    message: 'Save posts, snippets, or repos to your reading list to read them later.',
  },
  all: {
    icon: '📚',
    title: 'Your reading list is empty',
    message: 'Tap "Read later" on any long-form content to build your list.',
  },
  archived: {
    icon: '🗄️',
    title: 'No archived items',
    message: 'Items you archive from your reading list will appear here.',
  },
};

// ---------------------------------------------------------------------------
// Formatting helpers (pure)
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
  const day = 86_400_000;
  const diffMs = Date.now() - then;
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Swipe actions
// ---------------------------------------------------------------------------

interface RightActionsProps {
  onArchive: () => void;
  onRemove: () => void;
}

function RightActions({ onArchive, onRemove }: RightActionsProps) {
  return (
    <View style={styles.swipeGroup}>
      <Pressable
        style={[styles.swipeAction, styles.swipeArchive]}
        onPress={onArchive}
        accessibilityRole="button"
        accessibilityLabel="Archive"
      >
        <Icon name="archive" size={20} color={Colors.white} />
        <Text style={styles.swipeActionLabel}>Archive</Text>
      </Pressable>
      <Pressable
        style={[styles.swipeAction, styles.swipeRemove]}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove"
      >
        <Icon name="delete" size={20} color={Colors.white} />
        <Text style={styles.swipeActionLabel}>Remove</Text>
      </Pressable>
    </View>
  );
}

interface LeftActionProps {
  onMarkRead: () => void;
}

function LeftAction({ onMarkRead }: LeftActionProps) {
  return (
    <Pressable
      style={[styles.swipeAction, styles.swipeRead]}
      onPress={onMarkRead}
      accessibilityRole="button"
      accessibilityLabel="Mark read"
    >
      <Icon name="check" size={20} color={Colors.white} />
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
  const savedLabel = formatSavedDate(item.savedAt);

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
            <Icon name={SOURCE_ICON[item.sourceType]} size={18} color={Colors.accent} />
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
          {savedLabel ? (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{savedLabel}</Text>
            </>
          ) : null}
        </View>

        <View
          style={styles.progressTrack}
          accessibilityLabel={`${Math.round(progress * 100)}% read`}
        >
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
  active: ReadingFilter;
  onSelect: (filter: ReadingFilter) => void;
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
// Main screen
// ---------------------------------------------------------------------------

export default function ReadingListScreen() {
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<ReadingFilter>('unread');
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filter: ReadingFilter, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await userService.getReadingList({ filter, page: 1 });
      setItems(data.items);
      setNextPage(data.nextPage);
    } catch (err: unknown) {
      logger.error('Load reading list error:', err);
      setError(getErrorMessage(err, 'Failed to load reading list'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(activeFilter);
  }, [activeFilter, load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || nextPage == null) {
      return;
    }
    setLoadingMore(true);
    try {
      const data = await userService.getReadingList({ filter: activeFilter, page: nextPage });
      setItems((prev) => [...prev, ...data.items]);
      setNextPage(data.nextPage);
    } catch (err: unknown) {
      logger.error('Load more reading list error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [activeFilter, loadingMore, nextPage]);

  // Optimistic status mutation. The item is removed from the current list when
  // the new status no longer matches the active filter; the change is reverted
  // if the request fails.
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
        await userService.updateReadingItem(item.id, status);
      } catch (err: unknown) {
        setItems(snapshot);
        Alert.alert('Error', getErrorMessage(err, errorLabel));
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

  const handleRemove = useCallback(
    async (item: ReadingItem) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      try {
        await userService.removeFromReadingList(item.id);
      } catch (err: unknown) {
        setItems(snapshot);
        Alert.alert('Error', getErrorMessage(err, 'Failed to remove item'));
      }
    },
    [items],
  );

  const handleOpen = useCallback(
    (item: ReadingItem) => {
      if (item.sourceType === 'post') {
        router.push(`/post/${item.entityId}`);
      } else if (item.sourceType === 'snippet') {
        router.push(`/snippets/${item.entityId}`);
      } else if (item.author) {
        router.push(`/repo/${item.author}/${item.entityId}`);
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
    if (loading) {
      return null;
    }
    const copy = EMPTY_COPY[activeFilter];
    return <EmptyState icon={copy.icon} title={copy.title} message={copy.message} />;
  }, [loading, activeFilter]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) {
      return null;
    }
    return <LoadingSpinner size="small" />;
  }, [loadingMore]);

  return (
    <View style={styles.container}>
      <Header title="Reading List" />

      <FilterBar active={activeFilter} onSelect={setActiveFilter} />

      {loading && items.length === 0 ? (
        <LoadingSpinner fullScreen />
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => load(activeFilter)}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
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
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(activeFilter, true)}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
        />
      )}
    </View>
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
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
    backgroundColor: Colors.hover,
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
    backgroundColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  cardAuthor: {
    fontSize: 12,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.textSecondary,
  },

  // Progress
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.muted,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.accent,
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
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '600',
  },
});
