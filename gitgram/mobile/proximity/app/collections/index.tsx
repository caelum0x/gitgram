import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colours — mirrors collection/[id].tsx palette
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
} as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 12;
const CARD_COLUMNS = 2;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_GAP * (CARD_COLUMNS + 1)) / CARD_COLUMNS;
const COVER_SIZE = CARD_WIDTH;
const COVER_CELL = COVER_SIZE / 2;

// Cover gradient fallback palette — deterministic per collection id.
const COVER_GRADIENTS: readonly string[] = [
  '#7C3AED',
  '#5B21B6',
  '#2563EB',
  '#0891B2',
  '#DB2777',
  '#D97706',
  '#059669',
  '#9333EA',
];

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('accessToken');
  } catch {
    return null;
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

function gradientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length] ?? Colors.primary;
}

function navigate(path: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { router } = require('expo-router') as {
      router: { push: (p: string) => void; back: () => void };
    };
    router.push(path);
  } catch {
    // no-op when router unavailable
  }
}

function goBack(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { router } = require('expo-router') as { router: { back: () => void } };
    router.back();
  } catch {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CollectionScope = 'mine' | 'following' | 'discover';

interface CollectionOwner {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  coverUrls: string[];
  owner: CollectionOwner;
}

interface CollectionsResponse {
  collections: Collection[];
  nextCursor?: string | null;
}

interface CreateCollectionPayload {
  name: string;
  description: string;
  isPublic: boolean;
}

const TABS: ReadonlyArray<{ key: CollectionScope; label: string }> = [
  { key: 'mine', label: 'Mine' },
  { key: 'following', label: 'Following' },
  { key: 'discover', label: 'Discover' },
];

// ---------------------------------------------------------------------------
// Cover — 2x2 thumbnail grid, gradient fallback
// ---------------------------------------------------------------------------
interface CoverProps {
  collection: Collection;
}

function Cover({ collection }: CoverProps) {
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const urls = collection.coverUrls?.slice(0, 4) ?? [];
  const usable = urls.filter((u, i) => u && !failed[i]);

  if (usable.length === 0) {
    return (
      <View style={[coverStyles.container, { backgroundColor: gradientColor(collection.id) }]}>
        <Text style={coverStyles.gradientGlyph} numberOfLines={1}>
          {(collection.name[0] ?? '#').toUpperCase()}
        </Text>
      </View>
    );
  }

  // Pad to a 2x2 grid by repeating available covers.
  const cells = Array.from({ length: 4 }, (_, i) => urls[i] ?? urls[i % usable.length]);

  return (
    <View style={coverStyles.container}>
      <View style={coverStyles.grid}>
        {cells.map((uri, idx) => (
          <Image
            key={`${collection.id}-cover-${idx}`}
            source={{ uri }}
            style={coverStyles.cell}
            resizeMode="cover"
            onError={() => setFailed((prev) => ({ ...prev, [idx]: true }))}
          />
        ))}
      </View>
    </View>
  );
}

const coverStyles = StyleSheet.create({
  container: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  cell: {
    width: COVER_CELL,
    height: COVER_CELL,
    backgroundColor: Colors.surface,
  },
  gradientGlyph: {
    color: Colors.white,
    fontSize: 48,
    fontWeight: '800',
    opacity: 0.85,
  },
});

// ---------------------------------------------------------------------------
// Collection card
// ---------------------------------------------------------------------------
interface CollectionCardProps {
  collection: Collection;
  onPress: (id: string) => void;
}

function CollectionCard({ collection, onPress }: CollectionCardProps) {
  return (
    <Pressable
      onPress={() => onPress(collection.id)}
      style={({ pressed }) => [cardStyles.card, pressed && cardStyles.pressed]}
      accessibilityLabel={`Open collection ${collection.name}`}
    >
      <Cover collection={collection} />
      <View style={cardStyles.body}>
        <View style={cardStyles.titleRow}>
          <Text style={cardStyles.name} numberOfLines={1}>
            {collection.name}
          </Text>
          <View
            style={[
              cardStyles.privacyBadge,
              collection.isPublic ? cardStyles.publicBadge : cardStyles.privateBadge,
            ]}
          >
            <Text style={cardStyles.privacyText}>{collection.isPublic ? 'Public' : 'Private'}</Text>
          </View>
        </View>
        <Text style={cardStyles.itemCount}>
          {formatCount(collection.itemCount)} {collection.itemCount === 1 ? 'item' : 'items'}
        </Text>
        <Text style={cardStyles.owner} numberOfLines={1}>
          @{collection.owner.username}
        </Text>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
  body: {
    padding: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  privacyBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  publicBadge: { backgroundColor: Colors.primaryDark },
  privateBadge: { backgroundColor: Colors.surfaceElevated },
  privacyText: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: '600',
  },
  itemCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  owner: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Create collection modal
// ---------------------------------------------------------------------------
interface CreateModalProps {
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateCollectionPayload) => void;
}

function CreateCollectionModal({ visible, submitting, onClose, onSubmit }: CreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const reset = useCallback(() => {
    setName('');
    setDescription('');
    setIsPublic(true);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, description: description.trim(), isPublic });
  }, [name, description, isPublic, onSubmit]);

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={modalStyles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>New Collection</Text>

          <Text style={modalStyles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Favourite repos"
            placeholderTextColor={Colors.textMuted}
            style={modalStyles.input}
            maxLength={80}
            autoFocus
          />

          <Text style={modalStyles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this collection about?"
            placeholderTextColor={Colors.textMuted}
            style={[modalStyles.input, modalStyles.textArea]}
            maxLength={280}
            multiline
          />

          <View style={modalStyles.privacyRow}>
            <View style={modalStyles.privacyTextWrap}>
              <Text style={modalStyles.privacyLabel}>{isPublic ? 'Public' : 'Private'}</Text>
              <Text style={modalStyles.privacyHint}>
                {isPublic ? 'Anyone can view this collection' : 'Only you can view this collection'}
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: Colors.surfaceElevated, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>

          <View style={modalStyles.actions}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [modalStyles.cancelBtn, pressed && cardStyles.pressed]}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                modalStyles.submitBtn,
                !canSubmit && modalStyles.submitDisabled,
                pressed && cardStyles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={modalStyles.submitText}>Create</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  privacyTextWrap: { flex: 1 },
  privacyLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  privacyHint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Collections browse screen
// ---------------------------------------------------------------------------
export default function CollectionsScreen() {
  const [scope, setScope] = useState<CollectionScope>('mine');
  const [search, setSearch] = useState('');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (targetScope: CollectionScope, cursor?: string | null) => {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      if (!cursor) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ scope: targetScope, limit: '20' });
        if (cursor) params.set('cursor', cursor);
        const data = await authedFetch<CollectionsResponse>(
          `/v1/collections?${params.toString()}`,
        );
        const incoming = data.collections ?? [];
        setCollections((prev) => (cursor ? [...prev, ...incoming] : incoming));
        setNextCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
      } catch (err: unknown) {
        if (!cursor) {
          setError(err instanceof Error ? err.message : 'Failed to load collections');
        } else {
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        loadingMoreRef.current = false;
      }
    },
    [],
  );

  // Reload when the active tab changes.
  useEffect(() => {
    setCollections([]);
    setNextCursor(null);
    setHasMore(true);
    load(scope);
  }, [scope, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNextCursor(null);
    setHasMore(true);
    await load(scope);
    setRefreshing(false);
  }, [scope, load]);

  const handleEndReached = useCallback(() => {
    if (hasMore && nextCursor && !loadingMoreRef.current) {
      load(scope, nextCursor);
    }
  }, [hasMore, nextCursor, scope, load]);

  const handleCardPress = useCallback((id: string) => {
    navigate(`/collection/${id}`);
  }, []);

  const handleCreate = useCallback(
    async (payload: CreateCollectionPayload) => {
      setCreating(true);
      try {
        const created = await authedFetch<Collection>('/v1/collections', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setModalVisible(false);
        // Optimistically surface the new collection on the "Mine" tab.
        if (scope === 'mine') {
          setCollections((prev) => [created, ...prev]);
        } else {
          setScope('mine');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create collection');
      } finally {
        setCreating(false);
      }
    },
    [scope],
  );

  // Client-side inline search over the loaded page.
  const visibleCollections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.owner.username.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    );
  }, [collections, search]);

  const keyExtractor = useCallback((item: Collection) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Collection }) => (
      <CollectionCard collection={item} onPress={handleCardPress} />
    ),
    [handleCardPress],
  );

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load(scope)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>{'[ ]'}</Text>
        <Text style={styles.emptyPrimary}>
          {search.trim() ? 'No matching collections' : 'No collections yet'}
        </Text>
        <Text style={styles.emptySecondary}>
          {scope === 'mine'
            ? 'Tap “New” to create your first collection'
            : 'Nothing to show here right now'}
        </Text>
      </View>
    );
  }, [loading, error, search, scope, load]);

  const renderFooter = useCallback(
    () =>
      loadingMoreRef.current && collections.length > 0 ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : null,
    [collections.length],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Go back">
          <Text style={styles.backIcon}>{'<'}</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Collections</Text>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [styles.newBtn, pressed && cardStyles.pressed]}
          accessibilityLabel="Create new collection"
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {/* Inline search */}
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search collections"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} style={styles.clearBtn}>
            <Text style={styles.clearIcon}>{'×'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = tab.key === scope;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setScope(tab.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visibleCollections}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={CARD_COLUMNS}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
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
      />

      <CreateCollectionModal
        visible={modalVisible}
        submitting={creating}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreate}
      />
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

  // Top bar
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  backIcon: {
    color: Colors.primaryLight,
    fontSize: 20,
    fontWeight: '700',
  },
  topBarTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  newBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  newBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  clearBtn: {
    paddingLeft: 8,
  },
  clearIcon: {
    color: Colors.textMuted,
    fontSize: 20,
    fontWeight: '700',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: Colors.white,
    fontWeight: '700',
  },

  // List / grid
  listContent: {
    paddingHorizontal: CARD_GAP,
    paddingTop: 12,
    paddingBottom: 40,
    flexGrow: 1,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Empty / error
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    color: Colors.textMuted,
    fontSize: 36,
    marginBottom: 14,
  },
  emptyPrimary: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySecondary: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
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
});
