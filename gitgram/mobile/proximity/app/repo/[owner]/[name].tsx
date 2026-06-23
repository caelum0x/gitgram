import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
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
// Brand colors
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
  success: '#34D399',
  warning: '#FBBF24',
  white: '#FFFFFF',
  starYellow: '#F59E0B',
} as const;

// ---------------------------------------------------------------------------
// Language color map
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
  Shell: '#89E051',
  HTML: '#E34C26',
  CSS: '#563D7C',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CiStatus = 'success' | 'failure' | 'pending' | 'unknown';
type ActiveTab = 'files' | 'commits' | 'issues' | 'prs';

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  license: string | null;
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  htmlUrl: string;
  defaultBranch: string;
  isStarred?: boolean;
  isClaimed?: boolean;
  ciStatus?: CiStatus;
  readme?: string | null;
}

interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  path: string;
}

interface FilesResponse {
  files: FileEntry[];
}

interface Commit {
  sha: string;
  message: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  committedAt: string;
}

interface CommitsResponse {
  commits: Commit[];
  nextCursor?: string | null;
}

interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  authorUsername: string;
  createdAt: string;
  commentsCount: number;
  isPr: boolean;
}

interface IssuesResponse {
  items: Issue[];
  nextCursor?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function fileIcon(entry: FileEntry): string {
  if (entry.type === 'dir') return '📁';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '📘', tsx: '📘', js: '📙', jsx: '📙',
    json: '🗂', md: '📝', txt: '📄',
    py: '🐍', rs: '🦀', go: '🐹',
    sh: '⚙', yml: '⚙', yaml: '⚙',
    css: '🎨', html: '🌐', svg: '🎨',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼',
    lock: '🔒', env: '🔑',
  };
  return map[ext] ?? '📄';
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.value}>{formatCount(value)}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    marginRight: 10,
    minWidth: 72,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: { fontSize: 18, marginBottom: 4 },
  value: { color: Colors.text, fontWeight: '700', fontSize: 15 },
  label: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});

// ---------------------------------------------------------------------------
// CI badge
// ---------------------------------------------------------------------------

function CiBadge({ status }: { status: CiStatus }) {
  const map: Record<CiStatus, { color: string; bg: string; label: string; dot: string }> = {
    success: { color: Colors.success, bg: '#0D2B22', label: 'Passing', dot: '●' },
    failure: { color: Colors.error, bg: '#2B0D0D', label: 'Failing', dot: '●' },
    pending: { color: Colors.warning, bg: '#2B2000', label: 'Pending', dot: '◌' },
    unknown: { color: Colors.textMuted, bg: Colors.surfaceElevated, label: 'Unknown', dot: '○' },
  };
  const { color, bg, label, dot } = map[status];
  return (
    <View style={[ciBadgeStyles.container, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[ciBadgeStyles.dot, { color }]}>{dot}</Text>
      <Text style={[ciBadgeStyles.label, { color }]}>CI {label}</Text>
    </View>
  );
}

const ciBadgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  dot: { fontSize: 10 },
  label: { fontSize: 12, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function RepoSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.titleLine} />
      <View style={skeletonStyles.descLine} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={skeletonStyles.statCard} />
        ))}
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: { padding: 16 },
  titleLine: {
    width: 180,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 10,
  },
  descLine: {
    width: '85%',
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.surfaceElevated,
  },
  statCard: {
    width: 72,
    height: 64,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// File item
// ---------------------------------------------------------------------------

function FileItem({ entry }: { entry: FileEntry }) {
  return (
    <View style={fileStyles.row}>
      <Text style={fileStyles.icon}>{fileIcon(entry)}</Text>
      <Text style={fileStyles.name} numberOfLines={1}>{entry.name}</Text>
      {entry.type === 'dir' && <Text style={fileStyles.chevron}>›</Text>}
    </View>
  );
}

const fileStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  icon: { fontSize: 16, width: 22, textAlign: 'center' },
  name: { flex: 1, color: Colors.text, fontSize: 14 },
  chevron: { color: Colors.textMuted, fontSize: 18, lineHeight: 20 },
});

// ---------------------------------------------------------------------------
// Commit item
// ---------------------------------------------------------------------------

function CommitItem({ commit }: { commit: Commit }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <View style={commitStyles.row}>
      {commit.authorAvatarUrl && !imgFailed ? (
        <Image
          source={{ uri: commit.authorAvatarUrl }}
          style={commitStyles.avatar}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={commitStyles.avatarFallback}>
          <Text style={commitStyles.avatarInitial}>
            {(commit.authorName[0] ?? '?').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={commitStyles.body}>
        <Text style={commitStyles.message} numberOfLines={2}>
          {commit.message.split('\n')[0]}
        </Text>
        <View style={commitStyles.meta}>
          <Text style={commitStyles.sha}>{shortSha(commit.sha)}</Text>
          <Text style={commitStyles.dot}>·</Text>
          <Text style={commitStyles.author} numberOfLines={1}>{commit.authorName}</Text>
          <Text style={commitStyles.dot}>·</Text>
          <Text style={commitStyles.time}>{timeAgo(commit.committedAt)}</Text>
        </View>
      </View>
    </View>
  );
}

const commitStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
    alignItems: 'flex-start',
  },
  avatar: { width: 30, height: 30, borderRadius: 15, marginTop: 2 },
  avatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  avatarInitial: { color: Colors.white, fontWeight: '700', fontSize: 12 },
  body: { flex: 1 },
  message: { color: Colors.text, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  sha: {
    color: Colors.primaryLight,
    fontFamily: 'monospace',
    fontSize: 11,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dot: { color: Colors.textMuted, fontSize: 11 },
  author: { color: Colors.textSecondary, fontSize: 11, flexShrink: 1, maxWidth: 100 },
  time: { color: Colors.textMuted, fontSize: 11 },
});

// ---------------------------------------------------------------------------
// Issue / PR item
// ---------------------------------------------------------------------------

function IssueItem({ item }: { item: Issue }) {
  const stateColor = item.state === 'open' ? Colors.success : Colors.textMuted;
  const icon = item.isPr ? '⎇' : '#';

  return (
    <View style={issueStyles.row}>
      <View style={[issueStyles.iconBadge, { borderColor: stateColor }]}>
        <Text style={[issueStyles.iconText, { color: stateColor }]}>{icon}</Text>
      </View>
      <View style={issueStyles.body}>
        <Text style={issueStyles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={issueStyles.meta}>
          #{item.number} · @{item.authorUsername} · {timeAgo(item.createdAt)}
          {item.commentsCount > 0 ? ` · 💬 ${item.commentsCount}` : ''}
        </Text>
      </View>
      <View style={[issueStyles.stateDot, { backgroundColor: stateColor }]} />
    </View>
  );
}

const issueStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  iconText: { fontSize: 12, fontWeight: '700' },
  body: { flex: 1 },
  title: { color: Colors.text, fontSize: 13, lineHeight: 18, marginBottom: 3 },
  meta: { color: Colors.textMuted, fontSize: 11 },
  stateDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
}

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'files', label: 'Files' },
  { key: 'commits', label: 'Commits' },
  { key: 'issues', label: 'Issues' },
  { key: 'prs', label: 'PRs' },
];

function TabBar({ activeTab, onSelect }: TabBarProps) {
  return (
    <View style={tabStyles.bar}>
      {TABS.map((t) => (
        <Pressable
          key={t.key}
          style={[tabStyles.tab, activeTab === t.key && tabStyles.tabActive]}
          onPress={() => onSelect(t.key)}
        >
          <Text style={[tabStyles.label, activeTab === t.key && tabStyles.labelActive]}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  labelActive: { color: Colors.primary },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function RepoDetailScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [repo, setRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLoading, setStarLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('files');

  // Files tab
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);

  // Commits tab
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsLoaded, setCommitsLoaded] = useState(false);
  const [commitsCursor, setCommitsCursor] = useState<string | null>(null);
  const commitsLoadingRef = useRef(false);

  // Issues tab
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [issuesCursor, setIssuesCursor] = useState<string | null>(null);

  // PRs tab
  const [prs, setPrs] = useState<Issue[]>([]);
  const [prsLoading, setPrsLoading] = useState(false);
  const [prsLoaded, setPrsLoaded] = useState(false);

  // ----- Fetch repo -----
  const fetchRepo = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<Repository>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      );
      setRepo(data);
      setIsStarred(data.isStarred ?? false);
      setStarCount(data.starsCount);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load repository');
    } finally {
      setLoading(false);
    }
  }, [owner, name]);

  useEffect(() => { fetchRepo(); }, [fetchRepo]);

  // ----- Fetch files -----
  const fetchFiles = useCallback(async () => {
    if (!owner || !name || filesLoaded) return;
    setFilesLoading(true);
    try {
      const data = await apiClient<FilesResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/files`,
      );
      const sorted = [...(data.files ?? [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
      setFilesLoaded(true);
    } catch {
      setFiles([]);
      setFilesLoaded(true);
    } finally {
      setFilesLoading(false);
    }
  }, [owner, name, filesLoaded]);

  // ----- Fetch commits -----
  const fetchCommits = useCallback(async (cursor?: string | null) => {
    if (!owner || !name) return;
    if (commitsLoadingRef.current) return;
    commitsLoadingRef.current = true;
    setCommitsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const data = await apiClient<CommitsResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?${params}`,
      );
      const incoming = data.commits ?? [];
      if (cursor) {
        setCommits((prev) => [...prev, ...incoming]);
      } else {
        setCommits(incoming);
        setCommitsLoaded(true);
      }
      setCommitsCursor(data.nextCursor ?? null);
    } catch {
      setCommitsLoaded(true);
    } finally {
      setCommitsLoading(false);
      commitsLoadingRef.current = false;
    }
  }, [owner, name]);

  // ----- Fetch issues -----
  const fetchIssues = useCallback(async (cursor?: string | null) => {
    if (!owner || !name || issuesLoaded) return;
    setIssuesLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', type: 'issue' });
      if (cursor) params.set('cursor', cursor);
      const data = await apiClient<IssuesResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?${params}`,
      );
      setIssues((prev) => cursor ? [...prev, ...(data.items ?? [])] : (data.items ?? []));
      setIssuesCursor(data.nextCursor ?? null);
      setIssuesLoaded(true);
    } catch {
      setIssuesLoaded(true);
    } finally {
      setIssuesLoading(false);
    }
  }, [owner, name, issuesLoaded]);

  // ----- Fetch PRs -----
  const fetchPrs = useCallback(async () => {
    if (!owner || !name || prsLoaded) return;
    setPrsLoading(true);
    try {
      const data = await apiClient<IssuesResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?type=pr&limit=20`,
      );
      setPrs(data.items ?? []);
      setPrsLoaded(true);
    } catch {
      setPrsLoaded(true);
    } finally {
      setPrsLoading(false);
    }
  }, [owner, name, prsLoaded]);

  // Load tab content on switch
  useEffect(() => {
    if (activeTab === 'files' && !filesLoaded) fetchFiles();
    if (activeTab === 'commits' && !commitsLoaded) fetchCommits();
    if (activeTab === 'issues' && !issuesLoaded) fetchIssues();
    if (activeTab === 'prs' && !prsLoaded) fetchPrs();
  }, [activeTab, filesLoaded, commitsLoaded, issuesLoaded, prsLoaded,
    fetchFiles, fetchCommits, fetchIssues, fetchPrs]);

  // Prefetch files on load
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFilesLoaded(false);
    setCommitsLoaded(false);
    setIssuesLoaded(false);
    setPrsLoaded(false);
    setFiles([]); setCommits([]); setIssues([]); setPrs([]);
    await fetchRepo();
    setRefreshing(false);
  }, [fetchRepo]);

  // ----- Star toggle -----
  const handleStarToggle = useCallback(async () => {
    if (!repo || starLoading) return;
    const wasStarred = isStarred;
    setIsStarred(!wasStarred);
    setStarCount((n) => n + (wasStarred ? -1 : 1));
    setStarLoading(true);
    try {
      await apiClient(
        `/v1/repositories/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/star`,
        { method: wasStarred ? 'DELETE' : 'POST' },
      );
    } catch {
      setIsStarred(wasStarred);
      setStarCount((n) => n + (wasStarred ? 1 : -1));
    } finally {
      setStarLoading(false);
    }
  }, [repo, isStarred, starLoading, owner, name]);

  // ----- Open in GitHub -----
  const handleOpenGitHub = useCallback(() => {
    if (!repo?.htmlUrl) return;
    Linking.openURL(repo.htmlUrl).catch(() => undefined);
  }, [repo?.htmlUrl]);

  // ----- Claim repo -----
  const handleClaim = useCallback(() => {
    if (!owner || !name) return;
    router.push(`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/claim` as never);
  }, [owner, name, router]);

  // ----- Render tab content -----
  const renderFilesTab = () => {
    if (filesLoading) {
      return <ActivityIndicator size="large" color={Colors.primary} style={styles.tabLoader} />;
    }
    if (files.length === 0) {
      return <Text style={styles.emptyText}>No files found</Text>;
    }
    return (
      <FlatList<FileEntry>
        data={files}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => <FileItem entry={item} />}
        scrollEnabled={false}
      />
    );
  };

  const renderCommitsTab = () => {
    if (commitsLoading && commits.length === 0) {
      return <ActivityIndicator size="large" color={Colors.primary} style={styles.tabLoader} />;
    }
    if (commits.length === 0) {
      return <Text style={styles.emptyText}>No commits found</Text>;
    }
    return (
      <FlatList<Commit>
        data={commits}
        keyExtractor={(item) => item.sha}
        renderItem={({ item }) => <CommitItem commit={item} />}
        scrollEnabled={false}
        onEndReached={() => {
          if (commitsCursor && !commitsLoadingRef.current) fetchCommits(commitsCursor);
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          commitsLoading && commits.length > 0 ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.footerLoader} />
          ) : null
        }
      />
    );
  };

  const renderIssuesOrPrs = (items: Issue[], isLoading: boolean) => {
    if (isLoading && items.length === 0) {
      return <ActivityIndicator size="large" color={Colors.primary} style={styles.tabLoader} />;
    }
    if (items.length === 0) {
      return <Text style={styles.emptyText}>None found</Text>;
    }
    return (
      <FlatList<Issue>
        data={items}
        keyExtractor={(item) => String(item.number)}
        renderItem={({ item }) => <IssueItem item={item} />}
        scrollEnabled={false}
      />
    );
  };

  // ----- Main render -----
  const langColor = repo?.language ? (LANGUAGE_COLORS[repo.language] ?? Colors.textMuted) : null;

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

        <Text style={styles.navTitle} numberOfLines={1}>
          {owner}/{name}
        </Text>

        {/* Star button */}
        <TouchableOpacity
          onPress={handleStarToggle}
          disabled={starLoading || loading}
          style={styles.starBtn}
          accessibilityLabel={isStarred ? 'Unstar repository' : 'Star repository'}
        >
          {starLoading ? (
            <ActivityIndicator size="small" color={Colors.starYellow} />
          ) : (
            <Text style={[styles.starIcon, isStarred && styles.starIconActive]}>
              {isStarred ? '★' : '☆'}
            </Text>
          )}
          <Text style={[styles.starCount, isStarred && styles.starCountActive]}>
            {formatCount(starCount)}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Loading state */}
        {loading && !repo ? (
          <RepoSkeleton />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={fetchRepo} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : repo ? (
          <>
            {/* Info section */}
            <View style={styles.infoSection}>
              {/* Description */}
              {repo.description ? (
                <Text style={styles.description}>{repo.description}</Text>
              ) : null}

              {/* Language + license + CI badges */}
              <View style={styles.badgeRow}>
                {repo.language ? (
                  <View style={styles.langBadge}>
                    <View style={[styles.langDot, { backgroundColor: langColor ?? Colors.textMuted }]} />
                    <Text style={styles.langText}>{repo.language}</Text>
                  </View>
                ) : null}

                {repo.license ? (
                  <View style={styles.licenseBadge}>
                    <Text style={styles.licenseText}>⚖ {repo.license}</Text>
                  </View>
                ) : null}

                <CiBadge status={repo.ciStatus ?? 'unknown'} />
              </View>
            </View>

            {/* Stats row (horizontal scroll) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsScroll}
            >
              <StatCard icon="★" label="Stars" value={starCount} />
              <StatCard icon="⑂" label="Forks" value={repo.forksCount} />
              <StatCard icon="👁" label="Watchers" value={repo.watchersCount} />
              <StatCard icon="!" label="Issues" value={repo.openIssuesCount} />
            </ScrollView>

            {/* README */}
            {repo.readme ? (
              <View style={styles.readmeSection}>
                <Text style={styles.readmeTitle}>README</Text>
                <Text style={styles.readmeContent}>{repo.readme}</Text>
              </View>
            ) : null}

            {/* Tab bar */}
            <TabBar activeTab={activeTab} onSelect={setActiveTab} />

            {/* Tab content */}
            <View style={styles.tabContent}>
              {activeTab === 'files' && renderFilesTab()}
              {activeTab === 'commits' && renderCommitsTab()}
              {activeTab === 'issues' && renderIssuesOrPrs(issues, issuesLoading)}
              {activeTab === 'prs' && renderIssuesOrPrs(prs, prsLoading)}
            </View>

            {/* Bottom action buttons */}
            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.githubBtn}
                onPress={handleOpenGitHub}
                activeOpacity={0.8}
              >
                <Text style={styles.githubBtnIcon}>{'⎋'}</Text>
                <Text style={styles.githubBtnText}>Open in GitHub</Text>
              </TouchableOpacity>

              {!repo.isClaimed && (
                <TouchableOpacity
                  style={styles.claimBtn}
                  onPress={handleClaim}
                  activeOpacity={0.8}
                >
                  <Text style={styles.claimBtnIcon}>{'⚑'}</Text>
                  <Text style={styles.claimBtnText}>Claim this Repo</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  // Nav bar
  navBar: {
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
  navTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  starBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  starIcon: { fontSize: 20, color: Colors.textMuted },
  starIconActive: { color: Colors.starYellow },
  starCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  starCountActive: { color: Colors.starYellow },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Info section
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingBottom: 8,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  langDot: { width: 9, height: 9, borderRadius: 5 },
  langText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  licenseBadge: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  licenseText: { color: Colors.textMuted, fontSize: 12 },

  // Stats
  statsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  // README
  readmeSection: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  readmeTitle: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  readmeContent: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },

  // Tab content
  tabContent: { backgroundColor: Colors.background },
  tabLoader: { paddingVertical: 40 },
  footerLoader: { paddingVertical: 16 },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
  },

  // Bottom actions
  actionsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  githubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 13,
  },
  githubBtnIcon: { color: Colors.text, fontSize: 16 },
  githubBtnText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
  },
  claimBtnIcon: { color: Colors.white, fontSize: 16 },
  claimBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // Error
  errorBox: {
    padding: 32,
    alignItems: 'center',
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
  retryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
