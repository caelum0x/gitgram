import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { apiClient } from '../../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors (matches repo detail screen palette)
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
  added: '#34D399',
  removed: '#F87171',
  error: '#F87171',
  white: '#FFFFFF',
  timelineLine: '#2D2D50',
  avatarBg: '#312E81',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitAuthor {
  username: string;
  avatarUrl?: string;
}

interface CommitStats {
  additions: number;
  deletions: number;
}

interface Commit {
  sha: string;
  message: string;
  author: CommitAuthor;
  timestamp: string;
  stats?: CommitStats;
}

interface CommitsResponse {
  commits: Commit[];
  nextCursor?: string;
  branches?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortSha(sha: string): string {
  return sha.slice(0, 7);
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
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function getAvatarInitial(username: string): string {
  return (username?.[0] ?? '?').toUpperCase();
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------

interface AvatarProps {
  username: string;
  size?: number;
}

function Avatar({ username, size = 32 }: AvatarProps) {
  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel={`Avatar for ${username}`}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>
        {getAvatarInitial(username)}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.avatarBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  initial: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Commit row component
// ---------------------------------------------------------------------------

interface CommitRowProps {
  commit: Commit;
  isLast: boolean;
  onPress: (sha: string) => void;
}

function CommitRow({ commit, isLast, onPress }: CommitRowProps) {
  const { sha, message, author, timestamp, stats } = commit;

  return (
    <TouchableOpacity
      style={rowStyles.wrapper}
      onPress={() => onPress(sha)}
      activeOpacity={0.75}
      accessibilityLabel={`Commit: ${message}`}
    >
      {/* Timeline column */}
      <View style={rowStyles.timelineCol}>
        <View style={rowStyles.dot} />
        {!isLast && <View style={rowStyles.line} />}
      </View>

      {/* Content column */}
      <View style={rowStyles.content}>
        <View style={rowStyles.topRow}>
          <Avatar username={author.username} size={32} />
          <View style={rowStyles.msgBlock}>
            <Text style={rowStyles.message} numberOfLines={1}>
              {message}
            </Text>
            <View style={rowStyles.metaRow}>
              <Text style={rowStyles.shaText}>{shortSha(sha)}</Text>
              <Text style={rowStyles.metaDot}>·</Text>
              <Text style={rowStyles.authorText}>{author.username}</Text>
              <Text style={rowStyles.metaDot}>·</Text>
              <Text style={rowStyles.timeText}>{timeAgo(timestamp)}</Text>
            </View>
          </View>
        </View>

        {stats && (
          <View style={rowStyles.statsRow}>
            <Text style={rowStyles.added}>+{stats.additions}</Text>
            <Text style={rowStyles.removed}>-{stats.deletions}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    paddingRight: 16,
    backgroundColor: Colors.background,
  },

  // Timeline
  timelineCol: {
    width: 40,
    alignItems: 'center',
    paddingTop: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    zIndex: 1,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.timelineLine,
    marginTop: 2,
  },

  // Content
  content: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  msgBlock: {
    flex: 1,
  },
  message: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 3,
  },
  shaText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  metaDot: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  authorText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  timeText: {
    color: Colors.textMuted,
    fontSize: 11,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginLeft: 42,
  },
  added: {
    color: Colors.added,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  removed: {
    color: Colors.removed,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
});

// ---------------------------------------------------------------------------
// Branch selector bottom sheet
// ---------------------------------------------------------------------------

interface BranchSheetProps {
  visible: boolean;
  branches: string[];
  selectedBranch: string;
  onSelect: (branch: string) => void;
  onClose: () => void;
}

function BranchSheet({
  visible,
  branches,
  selectedBranch,
  onSelect,
  onClose,
}: BranchSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={sheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.title}>Switch branch</Text>
        <FlatList<string>
          data={branches}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const isActive = item === selectedBranch;
            return (
              <TouchableOpacity
                style={[sheetStyles.branchRow, isActive && sheetStyles.branchRowActive]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                activeOpacity={0.7}
                accessibilityLabel={`Select branch ${item}`}
              >
                <Text style={sheetStyles.branchIcon}>
                  {isActive ? '✓' : ' '}
                </Text>
                <Text
                  style={[sheetStyles.branchName, isActive && sheetStyles.branchNameActive]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={sheetStyles.emptyText}>No branches found</Text>
          }
          style={sheetStyles.list}
        />
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '60%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  list: {
    flexGrow: 0,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  branchRowActive: {
    backgroundColor: Colors.surfaceElevated,
  },
  branchIcon: {
    color: Colors.primaryLight,
    fontSize: 14,
    width: 16,
    fontWeight: '700',
  },
  branchName: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  branchNameActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

export default function CommitsScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<string[]>(['main']);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [branchSheetVisible, setBranchSheetVisible] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const isLoadingMoreRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Fetch commits
  // ---------------------------------------------------------------------------
  const fetchCommits = useCallback(
    async (branch: string, cursor?: string, isRefresh = false) => {
      if (!owner || !name) return;

      if (cursor) {
        if (isLoadingMoreRef.current) return;
        isLoadingMoreRef.current = true;
        setLoadingMore(true);
      } else if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({ branch, limit: String(PAGE_SIZE) });
        if (cursor) params.set('cursor', cursor);
        const url = `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?${params.toString()}`;
        const data = await apiClient<CommitsResponse>(url);

        const incoming = data.commits ?? [];
        if (cursor) {
          setCommits((prev) => [...prev, ...incoming]);
        } else {
          setCommits(incoming);
        }
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);

        if (data.branches && data.branches.length > 0) {
          setBranches(data.branches);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load commits');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
        isLoadingMoreRef.current = false;
      }
    },
    [owner, name],
  );

  useEffect(() => {
    fetchCommits(selectedBranch);
  }, [selectedBranch, fetchCommits]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleBranchSelect = useCallback((branch: string) => {
    setSelectedBranch(branch);
    setNextCursor(undefined);
    setHasMore(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setNextCursor(undefined);
    setHasMore(true);
    fetchCommits(selectedBranch, undefined, true);
  }, [selectedBranch, fetchCommits]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || !nextCursor) return;
    fetchCommits(selectedBranch, nextCursor);
  }, [hasMore, loadingMore, nextCursor, selectedBranch, fetchCommits]);

  const handleCommitPress = useCallback(
    (sha: string) => {
      router.push(
        `/repo/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/commit/${sha}` as never,
      );
    },
    [owner, name, router],
  );

  const toggleSearch = useCallback(() => {
    setSearchVisible((v) => !v);
    setSearchQuery('');
  }, []);

  // ---------------------------------------------------------------------------
  // Filtered commits
  // ---------------------------------------------------------------------------
  const filteredCommits = searchQuery.trim()
    ? commits.filter((c) =>
        c.message.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : commits;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          Commits
        </Text>

        <TouchableOpacity
          onPress={toggleSearch}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Search commits"
        >
          <Text style={[styles.headerIcon, searchVisible && styles.headerIconActive]}>
            🔍
          </Text>
        </TouchableOpacity>
      </View>

      {/* Branch selector bar */}
      <TouchableOpacity
        style={styles.branchBar}
        onPress={() => setBranchSheetVisible(true)}
        activeOpacity={0.8}
        accessibilityLabel={`Current branch: ${selectedBranch}. Tap to switch.`}
      >
        <Text style={styles.branchBarIcon}>⎇</Text>
        <Text style={styles.branchBarName} numberOfLines={1}>
          {selectedBranch}
        </Text>
        <Text style={styles.branchBarChevron}>▾</Text>
      </TouchableOpacity>

      {/* Search bar */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search commits..."
            placeholderTextColor={Colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <TouchableOpacity
            onPress={toggleSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.searchClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchCommits(selectedBranch)}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<Commit>
          data={filteredCommits}
          keyExtractor={(item) => item.sha}
          renderItem={({ item, index }) => (
            <CommitRow
              commit={item}
              isLast={index === filteredCommits.length - 1}
              onPress={handleCommitPress}
            />
          )}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={searchQuery ? undefined : handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? 'No commits match your search' : 'No commits found'}
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={
            filteredCommits.length === 0 ? styles.emptyContainer : undefined
          }
        />
      )}

      {/* Branch bottom sheet */}
      <BranchSheet
        visible={branchSheetVisible}
        branches={branches}
        selectedBranch={selectedBranch}
        onSelect={handleBranchSelect}
        onClose={() => setBranchSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: Colors.primaryLight,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 18,
    opacity: 0.7,
  },
  headerIconActive: {
    opacity: 1,
  },

  // Branch selector bar
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  branchBarIcon: {
    color: Colors.primaryLight,
    fontSize: 15,
    fontWeight: '700',
  },
  branchBarName: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  branchBarChevron: {
    color: Colors.textMuted,
    fontSize: 12,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchClose: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  // Center states
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
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

  // Footer loader
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 40,
  },
});
