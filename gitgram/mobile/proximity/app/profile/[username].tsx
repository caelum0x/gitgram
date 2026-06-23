import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { apiClient, API_BASE } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 4) / GRID_COLUMNS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  githubUsername?: string | null;
  isFollowing?: boolean;
}

interface UserPost {
  id: string;
  content: string;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface UserPostsResponse {
  posts: UserPost[];
  nextCursor?: string | null;
}

interface Repository {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  htmlUrl?: string | null;
}

interface RepositoriesResponse {
  repositories?: Repository[];
  projects?: Repository[];
  data?: Repository[];
}

type ProfileTab = 'posts' | 'repos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 80 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (username[0] ?? '?').toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[
          avatarStyles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>
        {initial}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: {
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  placeholder: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Stat pill — tappable
// ---------------------------------------------------------------------------

interface StatPillProps {
  value: number;
  label: string;
  onPress?: () => void;
}

function StatPill({ value, label, onPress }: StatPillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [statStyles.container, pressed && { opacity: 0.65 }]}
    >
      <Text style={statStyles.value}>{formatCount(value)}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </Pressable>
  );
}

const statStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minWidth: 64,
    paddingVertical: 4,
  },
  value: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 22,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ---------------------------------------------------------------------------
// Post thumbnail grid item
// ---------------------------------------------------------------------------

interface PostThumbProps {
  post: UserPost;
}

function PostThumb({ post }: PostThumbProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUri = post.thumbnailUrl ?? post.mediaUrls?.[0] ?? null;
  const hasImage = imageUri && !imgFailed;

  return (
    <Pressable
      style={({ pressed }) => [
        thumbStyles.cell,
        { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE },
        pressed && thumbStyles.pressed,
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: imageUri! }}
          style={thumbStyles.image}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={thumbStyles.textFallback}>
          <Text style={thumbStyles.fallbackText} numberOfLines={3}>
            {post.content}
          </Text>
          <View style={thumbStyles.metaRow}>
            <Text style={thumbStyles.metaText}>♥ {formatCount(post.likesCount)}</Text>
            <Text style={thumbStyles.metaText}>  · {formatCount(post.commentsCount)}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const thumbStyles = StyleSheet.create({
  cell: {
    backgroundColor: Colors.surfaceElevated,
    margin: 1,
    overflow: 'hidden',
    borderRadius: 2,
  },
  pressed: { opacity: 0.75 },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  textFallback: {
    flex: 1,
    padding: 6,
    justifyContent: 'space-between',
  },
  fallbackText: {
    color: Colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 9,
  },
});

// ---------------------------------------------------------------------------
// Repository list item
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

interface RepoItemProps {
  repo: Repository;
}

function RepoItem({ repo }: RepoItemProps) {
  const langColor = repo.language
    ? (LANGUAGE_COLORS[repo.language] ?? Colors.textMuted)
    : null;

  return (
    <View style={repoStyles.container}>
      <View style={repoStyles.header}>
        <Text style={repoStyles.name} numberOfLines={1}>
          {repo.name}
        </Text>
      </View>
      {repo.description ? (
        <Text style={repoStyles.description} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}
      <View style={repoStyles.meta}>
        {repo.language ? (
          <View style={repoStyles.langRow}>
            <View
              style={[
                repoStyles.langDot,
                { backgroundColor: langColor ?? Colors.textMuted },
              ]}
            />
            <Text style={repoStyles.metaText}>{repo.language}</Text>
          </View>
        ) : null}
        <View style={repoStyles.statRow}>
          <Text style={repoStyles.metaIcon}>★</Text>
          <Text style={repoStyles.metaText}>{formatCount(repo.stars)}</Text>
        </View>
        <View style={repoStyles.statRow}>
          <Text style={repoStyles.metaIcon}>⑂</Text>
          <Text style={repoStyles.metaText}>{formatCount(repo.forks)}</Text>
        </View>
      </View>
    </View>
  );
}

const repoStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    color: Colors.primaryLight,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.avatarRow}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={skeletonStyles.stat} />
          ))}
        </View>
      </View>
      <View style={skeletonStyles.nameLine} />
      <View style={skeletonStyles.handleLine} />
      <View style={skeletonStyles.bioLine} />
      <View style={skeletonStyles.btnRow}>
        <View style={skeletonStyles.btn} />
        <View style={skeletonStyles.btn} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: { padding: 20 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceElevated,
    marginRight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
  },
  stat: {
    width: 48,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  nameLine: {
    width: 160,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  handleLine: {
    width: 100,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  bioLine: {
    width: '85%',
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();

  // --- Profile state ---
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // --- Follow state ---
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  // --- Posts state ---
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const postsLoadingMoreRef = useRef(false);

  // --- Repos state ---
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);

  // --- Pull-to-refresh ---
  const [refreshing, setRefreshing] = useState(false);

  // ----- Fetch profile -----
  const loadProfile = useCallback(async () => {
    if (!username) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data = await apiClient<PublicUserProfile>(
        `/v1/users/${encodeURIComponent(username)}`,
      );
      setProfile(data);
      setIsFollowing(data.isFollowing ?? false);
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error ? err.message : 'Failed to load profile',
      );
    } finally {
      setProfileLoading(false);
    }
  }, [username]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ----- Fetch posts -----
  const loadPosts = useCallback(
    async (cursor?: string | null) => {
      if (!username) return;
      if (postsLoadingMoreRef.current) return;
      postsLoadingMoreRef.current = true;
      setPostsLoading(true);
      try {
        const params = new URLSearchParams({ limit: '18' });
        if (cursor) params.set('cursor', cursor);
        const data = await apiClient<UserPostsResponse>(
          `/v1/users/${encodeURIComponent(username)}/posts?${params.toString()}`,
        );
        const incoming = data.posts ?? [];
        if (cursor) {
          setPosts((prev) => [...prev, ...incoming]);
        } else {
          setPosts(incoming);
        }
        setPostsNextCursor(data.nextCursor ?? null);
        setPostsHasMore(!!data.nextCursor);
      } catch {
        // Non-fatal — grid stays empty
      } finally {
        setPostsLoading(false);
        postsLoadingMoreRef.current = false;
      }
    },
    [username],
  );

  // ----- Fetch repos -----
  const loadRepos = useCallback(async () => {
    if (!username || reposLoaded) return;
    setReposLoading(true);
    try {
      const data = await apiClient<RepositoriesResponse>(
        `/v1/users/${encodeURIComponent(username)}/repositories`,
      );
      const list: Repository[] =
        data.repositories ??
        data.projects ??
        (data as unknown as Repository[]) ??
        [];
      setRepos(list);
      setReposLoaded(true);
    } catch {
      setRepos([]);
      setReposLoaded(true);
    } finally {
      setReposLoading(false);
    }
  }, [username, reposLoaded]);

  // Load content when tab changes
  useEffect(() => {
    if (activeTab === 'posts' && posts.length === 0) {
      loadPosts();
    } else if (activeTab === 'repos') {
      loadRepos();
    }
  }, [activeTab, loadPosts, loadRepos, posts.length]);

  // Initial posts load
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async () => {
    if (!username) return;
    setRefreshing(true);
    setPosts([]);
    setPostsNextCursor(null);
    setPostsHasMore(true);
    setReposLoaded(false);
    setRepos([]);
    await loadProfile();
    await loadPosts();
    setRefreshing(false);
  }, [username, loadProfile, loadPosts]);

  // ----- Follow / Unfollow -----
  const handleFollowToggle = useCallback(async () => {
    if (!username || followLoading) return;
    setFollowLoading(true);

    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        followersCount: prev.followersCount + (wasFollowing ? -1 : 1),
      };
    });

    try {
      await apiClient(
        `/v1/users/${encodeURIComponent(username)}/follow`,
        { method: wasFollowing ? 'DELETE' : 'POST' },
      );
    } catch {
      // Revert on failure
      setIsFollowing(wasFollowing);
      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          followersCount: prev.followersCount + (wasFollowing ? 1 : -1),
        };
      });
    } finally {
      setFollowLoading(false);
    }
  }, [username, isFollowing, followLoading]);

  // ----- Open GitHub profile -----
  const handleOpenGitHub = useCallback(async () => {
    if (!profile?.githubUsername) return;
    const url = `https://github.com/${profile.githubUsername}`;
    await WebBrowser.openBrowserAsync(url);
  }, [profile?.githubUsername]);

  // ----- Infinite scroll -----
  const handlePostsEndReached = useCallback(() => {
    if (postsHasMore && postsNextCursor && !postsLoadingMoreRef.current) {
      loadPosts(postsNextCursor);
    }
  }, [postsHasMore, postsNextCursor, loadPosts]);

  // ----- Render helpers -----
  const renderPostItem = useCallback(
    ({ item }: { item: UserPost }) => <PostThumb post={item} />,
    [],
  );

  const postKeyExtractor = useCallback((item: UserPost) => item.id, []);

  const renderRepoItem = useCallback(
    ({ item }: { item: Repository }) => <RepoItem repo={item} />,
    [],
  );

  const repoKeyExtractor = useCallback((item: Repository) => item.id, []);

  // ----- Profile header -----
  const renderHeader = () => {
    if (profileLoading) return <ProfileSkeleton />;

    if (profileError) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{profileError}</Text>
          <Pressable onPress={loadProfile} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!profile) return null;

    return (
      <View style={styles.profileHeader}>
        {/* Avatar + stats row */}
        <View style={styles.avatarStatsRow}>
          <Avatar uri={profile.avatarUrl} username={profile.username} size={80} />
          <View style={styles.statsRow}>
            <StatPill value={profile.postsCount} label="Posts" />
            <StatPill value={profile.followersCount} label="Followers" />
            <StatPill value={profile.followingCount} label="Following" />
          </View>
        </View>

        {/* Name + handle + bio */}
        <View style={styles.nameBlock}>
          {profile.displayName ? (
            <Text style={styles.displayName}>{profile.displayName}</Text>
          ) : null}
          <Text style={styles.usernameText}>@{profile.username}</Text>
          {profile.bio ? (
            <Text style={styles.bio} numberOfLines={4}>
              {profile.bio}
            </Text>
          ) : null}
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          {/* Follow / Unfollow */}
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              isFollowing ? styles.unfollowBtn : styles.followBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={handleFollowToggle}
            disabled={followLoading}
          >
            {followLoading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.actionBtnText}>
                {isFollowing ? 'Unfollow' : 'Follow'}
              </Text>
            )}
          </Pressable>

          {/* GitHub profile button */}
          {profile.githubUsername ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.githubBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleOpenGitHub}
            >
              <Text style={styles.actionBtnText}>GitHub</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
            onPress={() => setActiveTab('posts')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'posts' && styles.tabTextActive,
              ]}
            >
              Posts
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'repos' && styles.tabActive]}
            onPress={() => setActiveTab('repos')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'repos' && styles.tabTextActive,
              ]}
            >
              Repos
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ----- Posts tab -----
  const renderPostsTab = () => {
    if (postsLoading && posts.length === 0) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (posts.length === 0) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyIcon}>{'📷'}</Text>
          <Text style={styles.emptyText}>No posts yet</Text>
        </View>
      );
    }

    return (
      <FlatList<UserPost>
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={postKeyExtractor}
        numColumns={GRID_COLUMNS}
        scrollEnabled={false}
        onEndReached={handlePostsEndReached}
        onEndReachedThreshold={0.5}
        columnWrapperStyle={styles.gridRow}
        ListFooterComponent={
          postsLoading && posts.length > 0 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : null
        }
      />
    );
  };

  // ----- Repos tab -----
  const renderReposTab = () => {
    if (reposLoading) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (repos.length === 0) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyIcon}>{'📦'}</Text>
          <Text style={styles.emptyText}>No repositories</Text>
        </View>
      );
    }

    return (
      <FlatList<Repository>
        data={repos}
        renderItem={renderRepoItem}
        keyExtractor={repoKeyExtractor}
        scrollEnabled={false}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top navigation bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {username ?? ''}
        </Text>
        {/* Spacer to balance the back button */}
        <View style={styles.navSpacer} />
      </View>

      {/* Main content */}
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
        {renderHeader()}

        {!profileLoading && !profileError && profile
          ? activeTab === 'posts'
            ? renderPostsTab()
            : renderReposTab()
          : null}
      </ScrollView>
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
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  navSpacer: {
    width: 36,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  // Profile header section
  profileHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 0,
    backgroundColor: Colors.background,
  },
  avatarStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: 16,
  },
  nameBlock: {
    marginBottom: 16,
  },
  displayName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  usernameText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  bio: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtn: {
    backgroundColor: Colors.primary,
  },
  unfollowBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  githubBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.65,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginHorizontal: -16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    color: Colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: Colors.primary,
  },

  // Grid
  gridRow: { justifyContent: 'flex-start' },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  // Tab states
  tabLoading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Error / retry
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
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
