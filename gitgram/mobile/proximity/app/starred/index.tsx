import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colors — gitgram purple/indigo palette
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
} as const;

// ---------------------------------------------------------------------------
// API helpers
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
type SortOption = 'recently_starred' | 'most_stars' | 'alphabetical';

interface StarredRepo {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  htmlUrl: string | null;
  starredAt?: string | null;
}

interface StarredResponse {
  repositories: StarredRepo[];
  nextCursor?: string | null;
}

interface CurrentUser {
  id: string;
  username: string;
}

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

const SORT_LABELS: Record<SortOption, string> = {
  recently_starred: 'Recently Starred',
  most_stars: 'Most Stars',
  alphabetical: 'Alphabetical',
};

// ---------------------------------------------------------------------------
// Repo card component
// ---------------------------------------------------------------------------
interface RepoCardProps {
  repo: StarredRepo;
  onPress: () => void;
  onLongPress: () => void;
}

function RepoCard({ repo, onPress, onLongPress }: RepoCardProps) {
  const langColor = repo.language ? (LANGUAGE_COLORS[repo.language] ?? Colors.textMuted) : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardOwner} numberOfLines={1}>
          {repo.owner}
          <Text style={styles.cardSlash}> / </Text>
        </Text>
        <Text style={styles.cardName} numberOfLines={1}>
          {repo.name}
        </Text>
      </View>

      {repo.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}

      <View style={styles.cardMeta}>
        {langColor && repo.language ? (
          <View style={styles.langPill}>
            <View style={[styles.langDot, { backgroundColor: langColor }]} />
            <Text style={styles.langText}>{repo.language}</Text>
          </View>
        ) : null}

        <View style={styles.metaStat}>
          <Text style={styles.metaIcon}>★</Text>
          <Text style={styles.metaValue}>{formatCount(repo.stars)}</Text>
        </View>

        <View style={styles.metaStat}>
          <Text style={styles.metaIcon}>⑂</Text>
          <Text style={styles.metaValue}>{formatCount(repo.forks)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Language filter pill
// ---------------------------------------------------------------------------
interface LangPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function LangFilterPill({ label, selected, onPress }: LangPillProps) {
  return (
    <Pressable
      style={[styles.filterPill, selected && styles.filterPillActive]}
      onPress={onPress}
    >
      {label !== 'All' && LANGUAGE_COLORS[label] ? (
        <View style={[styles.langDot, { backgroundColor: LANGUAGE_COLORS[label] }]} />
      ) : null}
      <Text style={[styles.filterPillText, selected && styles.filterPillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sort bottom sheet (cross-platform)
// ---------------------------------------------------------------------------
interface SortSheetProps {
  visible: boolean;
  current: SortOption;
  onSelect: (opt: SortOption) => void;
  onClose: () => void;
}

const SORT_OPTIONS: SortOption[] = ['recently_starred', 'most_stars', 'alphabetical'];

function SortBottomSheet({ visible, current, onSelect, onClose }: SortSheetProps) {
  if (!visible) return null;

  return (
    <Pressable style={styles.sheetOverlay} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => undefined}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Sort by</Text>
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.sheetOption, current === opt && styles.sheetOptionActive]}
            onPress={() => { onSelect(opt); onClose(); }}
          >
            <Text style={[styles.sheetOptionText, current === opt && styles.sheetOptionTextActive]}>
              {SORT_LABELS[opt]}
            </Text>
            {current === opt ? <Text style={styles.checkmark}>✓</Text> : null}
          </Pressable>
        ))}
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function StarredScreen() {
  const router = useRouter();

  const [repos, setRepos] = useState<StarredRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortOption>('recently_starred');
  const [selectedLang, setSelectedLang] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortSheet, setShowSortSheet] = useState(false);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const sortRef = useRef(sort);
  sortRef.current = sort;

  // Fetch current user from token
  useEffect(() => {
    authedFetch<{ user: CurrentUser }>('/v1/auth/me')
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setCurrentUser(null));
  }, []);

  const fetchStarred = useCallback(
    async (isRefresh = false) => {
      if (!currentUser) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ sort: sortRef.current });
        const data = await authedFetch<StarredResponse>(
          `/v1/users/${currentUser.id}/starred?${params.toString()}`,
        );
        setRepos(data.repositories ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load starred repositories');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser],
  );

  useEffect(() => {
    if (currentUser) fetchStarred();
  }, [currentUser, sort, fetchStarred]);

  // Derived language list from repos
  const languages = React.useMemo(() => {
    const langs = new Set<string>();
    repos.forEach((r) => { if (r.language) langs.add(r.language); });
    return ['All', ...Array.from(langs).sort()];
  }, [repos]);

  // Client-side filter + search
  const filteredRepos = React.useMemo(() => {
    let list = repos;
    if (selectedLang !== 'All') {
      list = list.filter((r) => r.language === selectedLang);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [repos, selectedLang, searchQuery]);

  const handleUnstar = useCallback(
    async (repo: StarredRepo) => {
      if (!currentUser) return;
      try {
        await authedFetch(`/v1/repos/${repo.owner}/${repo.name}/star`, { method: 'DELETE' });
        setRepos((prev) => prev.filter((r) => r.id !== repo.id));
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to unstar');
      }
    },
    [currentUser],
  );

  const handleCopyUrl = useCallback((repo: StarredRepo) => {
    const url = repo.htmlUrl ?? `https://github.com/${repo.fullName}`;
    Clipboard.setString(url);
    Alert.alert('Copied', 'Repository URL copied to clipboard');
  }, []);

  const handleLongPress = useCallback(
    (repo: StarredRepo) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Open', 'Unstar', 'Copy URL'],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 0,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) {
              router.push(`/repo/${repo.owner}/${repo.name}` as never);
            } else if (buttonIndex === 2) {
              handleUnstar(repo);
            } else if (buttonIndex === 3) {
              handleCopyUrl(repo);
            }
          },
        );
      } else {
        Alert.alert(repo.fullName, undefined, [
          { text: 'Open', onPress: () => router.push(`/repo/${repo.owner}/${repo.name}` as never) },
          { text: 'Unstar', style: 'destructive', onPress: () => handleUnstar(repo) },
          { text: 'Copy URL', onPress: () => handleCopyUrl(repo) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [router, handleUnstar, handleCopyUrl],
  );

  const renderRepo = useCallback(
    ({ item }: { item: StarredRepo }) => (
      <RepoCard
        repo={item}
        onPress={() => router.push(`/repo/${item.owner}/${item.name}` as never)}
        onLongPress={() => handleLongPress(item)}
      />
    ),
    [router, handleLongPress],
  );

  const keyExtractor = useCallback((item: StarredRepo) => item.id, []);

  const ListHeader = (
    <View>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search starred repos..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Language filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.pillScrollContent}
      >
        {languages.map((lang) => (
          <LangFilterPill
            key={lang}
            label={lang}
            selected={selectedLang === lang}
            onPress={() => setSelectedLang(lang)}
          />
        ))}
      </ScrollView>

      {/* Result count */}
      {!loading && (
        <Text style={styles.resultCount}>
          {filteredRepos.length} {filteredRepos.length === 1 ? 'repository' : 'repositories'}
        </Text>
      )}
    </View>
  );

  const ListEmpty = loading ? null : (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>★</Text>
      <Text style={styles.emptyTitle}>
        {searchQuery || selectedLang !== 'All' ? 'No matching repositories' : 'No starred repositories'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery || selectedLang !== 'All'
          ? 'Try adjusting your search or filters'
          : 'Star repositories to save them here'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Starred Repositories</Text>
        <Pressable style={styles.sortButton} onPress={() => setShowSortSheet(true)}>
          <Text style={styles.sortButtonText}>Sort</Text>
          <Text style={styles.sortButtonIcon}>⇅</Text>
        </Pressable>
      </View>

      {/* Active sort label */}
      <View style={styles.sortLabelRow}>
        <Text style={styles.sortLabelText}>{SORT_LABELS[sort]}</Text>
      </View>

      {/* Content */}
      {loading && repos.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchStarred()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredRepos}
          renderItem={renderRepo}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchStarred(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      {/* Sort bottom sheet */}
      <SortBottomSheet
        visible={showSortSheet}
        current={sort}
        onSelect={(opt) => { setSort(opt); sortRef.current = opt; }}
        onClose={() => setShowSortSheet(false)}
      />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  backIcon: {
    fontSize: 20,
    color: Colors.text,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    gap: 4,
  },
  sortButtonText: {
    fontSize: 14,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  sortButtonIcon: {
    fontSize: 14,
    color: Colors.primaryLight,
  },

  // Sort label row
  sortLabelRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sortLabelText: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
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

  // Language pills
  pillScroll: {
    marginTop: 8,
  },
  pillScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  // Result count
  resultCount: {
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },

  // List
  listContent: {
    paddingBottom: 32,
  },

  // Repo card
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardOwner: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  cardSlash: {
    color: Colors.textMuted,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  langPill: {
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
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaIcon: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  metaValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // Loading / error / empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Sort bottom sheet
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetOptionActive: {
    backgroundColor: Colors.surfaceElevated,
  },
  sheetOptionText: {
    fontSize: 15,
    color: Colors.text,
  },
  sheetOptionTextActive: {
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '700',
  },
});
