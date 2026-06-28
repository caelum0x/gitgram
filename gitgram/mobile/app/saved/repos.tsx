import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../../constants/Colors';
import RepoCard from '../../components/Repo/RepoCard';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import repositoryService from '../../services/repositoryService';

// ---------------------------------------------------------------------------
// Types — shape returned by repositoryService.getFollowing()
// (matches the canonical RepoCard repo prop)
// ---------------------------------------------------------------------------
interface FollowedRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
  htmlUrl?: string;
  isFollowing?: boolean;
}

interface FollowingResponse {
  repositories?: FollowedRepo[];
}

type SortOption = 'recently_followed' | 'most_stars' | 'alphabetical';

const SORT_OPTIONS: readonly SortOption[] = [
  'recently_followed',
  'most_stars',
  'alphabetical',
] as const;

const SORT_LABELS: Record<SortOption, string> = {
  recently_followed: 'Recently Followed',
  most_stars: 'Most Stars',
  alphabetical: 'Alphabetical',
};

// ---------------------------------------------------------------------------
// Pure helpers (no mutation)
// ---------------------------------------------------------------------------
function matchesQuery(repo: FollowedRepo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    repo.name.toLowerCase().includes(q) ||
    repo.owner.toLowerCase().includes(q) ||
    repo.fullName.toLowerCase().includes(q) ||
    (repo.description?.toLowerCase().includes(q) ?? false)
  );
}

function sortRepos(repos: readonly FollowedRepo[], sort: SortOption): FollowedRepo[] {
  // getFollowing() already returns most-recently-followed first.
  if (sort === 'recently_followed') return [...repos];
  if (sort === 'most_stars') {
    return [...repos].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  }
  return [...repos].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
  );
}

function repoUrl(repo: FollowedRepo): string {
  return repo.htmlUrl ?? `https://github.com/${repo.fullName}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Failed to load followed repositories';
}

// ---------------------------------------------------------------------------
// Sort bottom sheet (cross-platform, canonical theming)
// ---------------------------------------------------------------------------
interface SortSheetProps {
  visible: boolean;
  current: SortOption;
  onSelect: (opt: SortOption) => void;
  onClose: () => void;
}

function SortBottomSheet({ visible, current, onSelect, onClose }: SortSheetProps) {
  if (!visible) return null;

  return (
    <Pressable style={styles.sheetOverlay} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => undefined}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Sort by</Text>
        {SORT_OPTIONS.map((opt) => {
          const active = current === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.sheetOption, active && styles.sheetOptionActive]}
              onPress={() => {
                onSelect(opt);
                onClose();
              }}
            >
              <Text style={[styles.sheetOptionText, active && styles.sheetOptionTextActive]}>
                {SORT_LABELS[opt]}
              </Text>
              {active ? <Icon name="check" size={20} color={Colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FollowedReposScreen() {
  const [repos, setRepos] = useState<FollowedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('recently_followed');
  const [showSortSheet, setShowSortSheet] = useState(false);

  const loadFollowedRepos = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data: FollowingResponse = await repositoryService.getFollowing();
      setRepos(data.repositories ?? []);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFollowedRepos();
  }, [loadFollowedRepos]);

  const visibleRepos = useMemo(() => {
    const filtered = repos.filter((r) => matchesQuery(r, searchQuery));
    return sortRepos(filtered, sort);
  }, [repos, searchQuery, sort]);

  const handleShare = useCallback(async (repo: FollowedRepo) => {
    try {
      await Share.share({
        message: `Check out ${repo.fullName} on Gitgram!\n${repoUrl(repo)}`,
      });
    } catch (err: unknown) {
      Alert.alert('Error', getErrorMessage(err));
    }
  }, []);

  const handleCopyUrl = useCallback(async (repo: FollowedRepo) => {
    try {
      await Clipboard.setStringAsync(repoUrl(repo));
      Alert.alert('Copied', 'Repository URL copied to clipboard');
    } catch (err: unknown) {
      Alert.alert('Error', getErrorMessage(err));
    }
  }, []);

  const handleLongPress = useCallback(
    (repo: FollowedRepo) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: repo.fullName,
            options: ['Cancel', 'Share', 'Copy URL'],
            cancelButtonIndex: 0,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) handleShare(repo);
            else if (buttonIndex === 2) handleCopyUrl(repo);
          },
        );
      } else {
        Alert.alert(repo.fullName, undefined, [
          { text: 'Share', onPress: () => handleShare(repo) },
          { text: 'Copy URL', onPress: () => handleCopyUrl(repo) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [handleShare, handleCopyUrl],
  );

  const renderItem = useCallback(
    ({ item }: { item: FollowedRepo }) => (
      <Pressable onLongPress={() => handleLongPress(item)} delayLongPress={400}>
        <RepoCard repo={item} />
      </Pressable>
    ),
    [handleLongPress],
  );

  const keyExtractor = useCallback(
    (item: FollowedRepo) => item.id || item.fullName,
    [],
  );

  const ListHeader = (
    <View>
      <View style={styles.searchRow}>
        <Icon name="search" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search followed repos..."
          placeholderTextColor={Colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {!loading && (
        <Text style={styles.resultCount}>
          {visibleRepos.length}{' '}
          {visibleRepos.length === 1 ? 'repository' : 'repositories'}
        </Text>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    const filtering = searchQuery.trim().length > 0;
    return (
      <EmptyState
        icon={filtering ? '🔍' : '⭐'}
        title={filtering ? 'No matching repositories' : 'No followed repos yet'}
        message={
          filtering
            ? 'Try adjusting your search.'
            : 'Follow repos to see them here.'
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Followed Repos</Text>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setShowSortSheet(true)}
        >
          <Icon name="sort" size={18} color={Colors.accent} />
          <Text style={styles.sortButtonText}>{SORT_LABELS[sort]}</Text>
        </TouchableOpacity>
      </View>

      {loading && repos.length === 0 ? (
        <LoadingSpinner fullScreen />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Icon name="error-outline" size={40} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadFollowedRepos()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleRepos}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFollowedRepos(true)}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
        />
      )}

      <SortBottomSheet
        visible={showSortSheet}
        current={sort}
        onSelect={setSort}
        onClose={() => setShowSortSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.text },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortButtonText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40, color: Colors.text, fontSize: 15 },

  resultCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },

  listContent: { paddingBottom: 32, flexGrow: 1 },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorText: { fontSize: 15, color: Colors.error, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.buttonPrimary,
    borderRadius: 8,
  },
  retryButtonText: { fontSize: 14, color: Colors.white, fontWeight: '600' },

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
  sheetOptionActive: { backgroundColor: Colors.hover },
  sheetOptionText: { fontSize: 15, color: Colors.text },
  sheetOptionTextActive: { color: Colors.accent, fontWeight: '600' },
});
