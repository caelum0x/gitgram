import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { apiClient, followUser, UserProfile } from '../../services/gitgramApi';

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
  white: '#FFFFFF',
  star: '#FBBF24',
  tagBg: '#2D1B69',
  tagBorder: '#4C1D95',
  snippetBg: '#1A2438',
  snippetBorder: '#2D3A55',
} as const;

// ---------------------------------------------------------------------------
// Language dot color map
// ---------------------------------------------------------------------------
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#DEA584',
  Java: '#B07219',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  Dart: '#00B4AB',
  Shell: '#89E051',
  CSS: '#563D7C',
  HTML: '#E34C26',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  Scala: '#DC322F',
  Elixir: '#6E4A7E',
};

function languageColor(lang: string | null): string {
  if (!lang) return Colors.textMuted;
  return LANGUAGE_COLORS[lang] ?? Colors.textSecondary;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------
interface TrendingHashtag {
  tag: string;
  count: number;
}

interface TrendingHashtagsResponse {
  tags: TrendingHashtag[];
}

interface TrendingDeveloper {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followersCount: number;
}

interface TrendingDevelopersResponse {
  developers: TrendingDeveloper[];
}

interface SuggestedUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface SuggestedUsersResponse {
  users: SuggestedUser[];
}

interface TrendingRepository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  starsCount: number;
  forksCount: number;
  isPrivate: boolean;
  owner: Pick<UserProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

interface TrendingReposResponse {
  repositories: TrendingRepository[];
}

interface TrendingSnippet {
  id: string;
  title: string;
  language: string | null;
  viewsCount: number;
  authorUsername: string;
}

interface TrendingSnippetsResponse {
  snippets: TrendingSnippet[];
}

// ---------------------------------------------------------------------------
// API call helpers
// ---------------------------------------------------------------------------
async function fetchTrendingHashtags(): Promise<TrendingHashtagsResponse> {
  return apiClient<TrendingHashtagsResponse>('/v1/trending/hashtags?limit=15');
}

async function fetchTrendingDevelopers(): Promise<TrendingDevelopersResponse> {
  return apiClient<TrendingDevelopersResponse>('/v1/trending/developers');
}

async function fetchSuggestedUsers(): Promise<SuggestedUsersResponse> {
  return apiClient<SuggestedUsersResponse>('/v1/users/suggested?limit=8');
}

async function fetchTrendingRepos(): Promise<TrendingReposResponse> {
  return apiClient<TrendingReposResponse>('/v1/repositories/trending?limit=10');
}

async function fetchTrendingSnippets(): Promise<TrendingSnippetsResponse> {
  return apiClient<TrendingSnippetsResponse>('/v1/snippets/trending?limit=4');
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------
interface AvatarProps {
  username: string;
  size?: number;
}

function Avatar({ username, size = 40 }: AvatarProps) {
  const initial = username.slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        avatarStyles.circle,
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
  circle: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Hashtag chip (with post count)
// ---------------------------------------------------------------------------
interface HashtagChipProps {
  tag: string;
  count: number;
  onPress: (tag: string) => void;
}

function HashtagChip({ tag, count, onPress }: HashtagChipProps) {
  return (
    <TouchableOpacity
      style={tagStyles.chip}
      onPress={() => onPress(tag)}
      activeOpacity={0.7}
    >
      <Text style={tagStyles.label}>#{tag}</Text>
      <Text style={tagStyles.count}>{formatCount(count)}</Text>
    </TouchableOpacity>
  );
}

const tagStyles = StyleSheet.create({
  chip: {
    backgroundColor: Colors.tagBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.tagBorder,
    marginRight: 8,
    alignItems: 'center',
  },
  label: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
  count: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
});

// ---------------------------------------------------------------------------
// Trending developer bubble (compact horizontal card)
// ---------------------------------------------------------------------------
interface TrendingDeveloperBubbleProps {
  developer: TrendingDeveloper;
  isFollowing: boolean;
  isLoading: boolean;
  onFollow: (username: string) => void;
  onPress: (username: string) => void;
}

function TrendingDeveloperBubble({
  developer,
  isFollowing,
  isLoading,
  onFollow,
  onPress,
}: TrendingDeveloperBubbleProps) {
  return (
    <TouchableOpacity
      style={trendDevStyles.container}
      onPress={() => onPress(developer.username)}
      activeOpacity={0.8}
    >
      <Avatar username={developer.username} size={56} />
      <View style={trendDevStyles.trendBadge}>
        <Text style={trendDevStyles.trendIcon}>{'↑'}</Text>
      </View>
      {developer.displayName ? (
        <Text style={trendDevStyles.displayName} numberOfLines={1}>
          {developer.displayName}
        </Text>
      ) : null}
      <Text style={trendDevStyles.username} numberOfLines={1}>
        @{developer.username}
      </Text>
      <Text style={trendDevStyles.followers}>
        {formatCount(developer.followersCount)} followers
      </Text>
      <TouchableOpacity
        style={[
          trendDevStyles.followButton,
          isFollowing && trendDevStyles.followingButton,
        ]}
        onPress={() => onFollow(developer.username)}
        disabled={isLoading || isFollowing}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text
            style={[
              trendDevStyles.followText,
              isFollowing && trendDevStyles.followingText,
            ]}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const trendDevStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    width: 148,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
  },
  trendBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#0D3321',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendIcon: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
  },
  displayName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  followers: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
  },
  followButton: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  followingButton: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  followingText: {
    color: Colors.textSecondary,
  },
});

// ---------------------------------------------------------------------------
// Trending repo card (horizontal compact)
// ---------------------------------------------------------------------------
interface TrendingRepoCardProps {
  repo: TrendingRepository;
  onPress: (repo: TrendingRepository) => void;
}

function TrendingRepoCard({ repo, onPress }: TrendingRepoCardProps) {
  return (
    <TouchableOpacity
      style={repoCardStyles.container}
      onPress={() => onPress(repo)}
      activeOpacity={0.75}
    >
      <View style={repoCardStyles.topRow}>
        <Text style={repoCardStyles.name} numberOfLines={1}>
          {repo.fullName}
        </Text>
        {repo.isPrivate && (
          <View style={repoCardStyles.privateBadge}>
            <Text style={repoCardStyles.privateBadgeText}>private</Text>
          </View>
        )}
      </View>
      {repo.description ? (
        <Text style={repoCardStyles.description} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}
      <View style={repoCardStyles.metaRow}>
        {repo.language ? (
          <View style={repoCardStyles.langGroup}>
            <View
              style={[
                repoCardStyles.langDot,
                { backgroundColor: languageColor(repo.language) },
              ]}
            />
            <Text style={repoCardStyles.langText}>{repo.language}</Text>
          </View>
        ) : null}
        <View style={repoCardStyles.starsGroup}>
          <Text style={repoCardStyles.starIcon}>{'★'}</Text>
          <Text style={repoCardStyles.starsText}>
            {formatCount(repo.starsCount)}
          </Text>
        </View>
        <View style={repoCardStyles.forksGroup}>
          <Text style={repoCardStyles.forkIcon}>{'⑂'}</Text>
          <Text style={repoCardStyles.forksText}>
            {formatCount(repo.forksCount)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const repoCardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  name: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  privateBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privateBadgeText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langGroup: {
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
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  starsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    color: Colors.star,
    fontSize: 13,
  },
  starsText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  forksGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  forkIcon: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  forksText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Suggested user grid card (2-per-row)
// ---------------------------------------------------------------------------
interface SuggestedUserGridCardProps {
  user: SuggestedUser;
  isFollowing: boolean;
  isLoading: boolean;
  onFollow: (username: string) => void;
  onPress: (username: string) => void;
}

function SuggestedUserGridCard({
  user,
  isFollowing,
  isLoading,
  onFollow,
  onPress,
}: SuggestedUserGridCardProps) {
  return (
    <TouchableOpacity
      style={gridCardStyles.container}
      onPress={() => onPress(user.username)}
      activeOpacity={0.8}
    >
      <View style={gridCardStyles.topRow}>
        <Avatar username={user.username} size={44} />
        <View style={gridCardStyles.info}>
          {user.displayName ? (
            <Text style={gridCardStyles.displayName} numberOfLines={1}>
              {user.displayName}
            </Text>
          ) : null}
          <Text style={gridCardStyles.username} numberOfLines={1}>
            @{user.username}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          gridCardStyles.followButton,
          isFollowing && gridCardStyles.followingButton,
        ]}
        onPress={() => onFollow(user.username)}
        disabled={isLoading || isFollowing}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text
            style={[
              gridCardStyles.followText,
              isFollowing && gridCardStyles.followingText,
            ]}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const gridCardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  username: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '500',
  },
  followButton: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  followingButton: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  followingText: {
    color: Colors.textSecondary,
  },
});

// ---------------------------------------------------------------------------
// Snippet card
// ---------------------------------------------------------------------------
interface SnippetCardProps {
  snippet: TrendingSnippet;
  onPress: (snippet: TrendingSnippet) => void;
}

function SnippetCard({ snippet, onPress }: SnippetCardProps) {
  return (
    <TouchableOpacity
      style={snippetCardStyles.container}
      onPress={() => onPress(snippet)}
      activeOpacity={0.75}
    >
      <View style={snippetCardStyles.topRow}>
        {snippet.language ? (
          <View
            style={[
              snippetCardStyles.langChip,
              { borderColor: languageColor(snippet.language) },
            ]}
          >
            <View
              style={[
                snippetCardStyles.langDot,
                { backgroundColor: languageColor(snippet.language) },
              ]}
            />
            <Text
              style={[
                snippetCardStyles.langText,
                { color: languageColor(snippet.language) },
              ]}
            >
              {snippet.language}
            </Text>
          </View>
        ) : null}
        <View style={snippetCardStyles.viewsGroup}>
          <Text style={snippetCardStyles.viewsIcon}>{'👁'}</Text>
          <Text style={snippetCardStyles.viewsText}>
            {formatCount(snippet.viewsCount)}
          </Text>
        </View>
      </View>
      <Text style={snippetCardStyles.title} numberOfLines={2}>
        {snippet.title}
      </Text>
      <Text style={snippetCardStyles.author} numberOfLines={1}>
        by @{snippet.authorUsername}
      </Text>
    </TouchableOpacity>
  );
}

const snippetCardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.snippetBg,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: Colors.snippetBorder,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.surface,
  },
  langDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  langText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewsIcon: {
    fontSize: 12,
  },
  viewsText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  author: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
});

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------
function TrendDevSkeleton() {
  return (
    <View style={skeletonStyles.devCard}>
      <View style={skeletonStyles.avatarCircle} />
      <View style={skeletonStyles.nameLine} />
      <View style={skeletonStyles.usernameLine} />
      <View style={skeletonStyles.smallLine} />
      <View style={skeletonStyles.buttonLine} />
    </View>
  );
}

function RepoVertSkeleton() {
  return (
    <View style={skeletonStyles.repoVert}>
      <View style={skeletonStyles.titleLine} />
      <View style={skeletonStyles.descLine} />
      <View style={skeletonStyles.metaLine} />
    </View>
  );
}

function HashtagSkeleton() {
  return (
    <View style={skeletonStyles.hashtag} />
  );
}

function GridCardSkeleton() {
  return (
    <View style={skeletonStyles.gridCard}>
      <View style={skeletonStyles.gridRow}>
        <View style={skeletonStyles.gridAvatar} />
        <View style={skeletonStyles.gridInfo}>
          <View style={skeletonStyles.gridName} />
          <View style={skeletonStyles.gridUsername} />
        </View>
      </View>
      <View style={skeletonStyles.gridButton} />
    </View>
  );
}

function SnippetSkeleton() {
  return (
    <View style={skeletonStyles.snippet}>
      <View style={skeletonStyles.snippetMeta} />
      <View style={skeletonStyles.snippetTitle} />
      <View style={skeletonStyles.snippetAuthor} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  devCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    width: 148,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceElevated,
  },
  nameLine: {
    height: 12,
    width: 80,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  usernameLine: {
    height: 10,
    width: 60,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  smallLine: {
    height: 9,
    width: 70,
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  buttonLine: {
    height: 32,
    width: 86,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    marginTop: 2,
  },
  repoVert: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  titleLine: {
    height: 14,
    width: '65%',
    borderRadius: 7,
    backgroundColor: Colors.surfaceElevated,
  },
  descLine: {
    height: 11,
    width: '90%',
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  metaLine: {
    height: 10,
    width: '40%',
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
    marginTop: 4,
  },
  hashtag: {
    width: 80,
    height: 34,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    marginRight: 8,
  },
  gridCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
  },
  gridInfo: {
    flex: 1,
    gap: 5,
  },
  gridName: {
    height: 11,
    width: '70%',
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  gridUsername: {
    height: 10,
    width: '50%',
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
  gridButton: {
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
  },
  snippet: {
    backgroundColor: Colors.snippetBg,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: Colors.snippetBorder,
    gap: 8,
  },
  snippetMeta: {
    height: 22,
    width: 80,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  snippetTitle: {
    height: 14,
    width: '80%',
    borderRadius: 7,
    backgroundColor: Colors.surfaceElevated,
  },
  snippetAuthor: {
    height: 10,
    width: '40%',
    borderRadius: 5,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------
interface SectionHeaderProps {
  title: string;
  spaced?: boolean;
}

function SectionHeader({ title, spaced = false }: SectionHeaderProps) {
  return (
    <Text
      style={[discoverStyles.sectionHeader, spaced && discoverStyles.sectionSpaced]}
    >
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Discover data type
// ---------------------------------------------------------------------------
interface DiscoverData {
  trendingDevelopers: TrendingDeveloper[];
  trendingRepos: TrendingRepository[];
  hashtags: TrendingHashtag[];
  suggestedUsers: SuggestedUser[];
  snippets: TrendingSnippet[];
}

// ---------------------------------------------------------------------------
// Discover view (no query)
// ---------------------------------------------------------------------------
interface DiscoverViewProps {
  data: DiscoverData;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onHashtagPress: (tag: string) => void;
  onRepoPress: (repo: TrendingRepository) => void;
  onUserPress: (username: string) => void;
  onSnippetPress: (snippet: TrendingSnippet) => void;
  followingSet: Set<string>;
  followLoadingSet: Set<string>;
  onFollow: (username: string) => void;
}

function DiscoverView({
  data,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
  onRetry,
  onHashtagPress,
  onRepoPress,
  onUserPress,
  onSnippetPress,
  followingSet,
  followLoadingSet,
  onFollow,
}: DiscoverViewProps) {
  if (isLoading) {
    return (
      <ScrollView
        style={discoverStyles.flex}
        contentContainerStyle={discoverStyles.loadingContent}
        scrollEnabled={false}
      >
        <SectionHeader title="Trending Developers" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={discoverStyles.horizontalPadding}
          scrollEnabled={false}
        >
          <TrendDevSkeleton />
          <TrendDevSkeleton />
          <TrendDevSkeleton />
        </ScrollView>

        <SectionHeader title="Trending Repositories" spaced />
        <RepoVertSkeleton />
        <RepoVertSkeleton />
        <RepoVertSkeleton />

        <SectionHeader title="Trending Now" spaced />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={discoverStyles.horizontalPadding}
          scrollEnabled={false}
        >
          <HashtagSkeleton />
          <HashtagSkeleton />
          <HashtagSkeleton />
          <HashtagSkeleton />
        </ScrollView>

        <SectionHeader title="People You Might Know" spaced />
        <View style={discoverStyles.gridRow}>
          <GridCardSkeleton />
          <View style={discoverStyles.gridGap} />
          <GridCardSkeleton />
        </View>
        <View style={[discoverStyles.gridRow, { marginTop: 10 }]}>
          <GridCardSkeleton />
          <View style={discoverStyles.gridGap} />
          <GridCardSkeleton />
        </View>

        <SectionHeader title="Trending Snippets" spaced />
        <SnippetSkeleton />
        <SnippetSkeleton />
        <SnippetSkeleton />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={discoverStyles.errorContainer}>
        <Text style={discoverStyles.errorIcon}>{'⚠️'}</Text>
        <Text style={discoverStyles.errorText}>{error}</Text>
        <TouchableOpacity style={discoverStyles.retryButton} onPress={onRetry}>
          <Text style={discoverStyles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pair suggested users into rows of 2
  const userPairs: Array<[SuggestedUser, SuggestedUser | null]> = [];
  for (let i = 0; i < data.suggestedUsers.length; i += 2) {
    userPairs.push([
      data.suggestedUsers[i],
      data.suggestedUsers[i + 1] ?? null,
    ]);
  }

  return (
    <ScrollView
      style={discoverStyles.flex}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
      contentContainerStyle={discoverStyles.scrollContent}
    >
      {/* Trending Developers */}
      <SectionHeader title="Trending Developers" />
      {data.trendingDevelopers.length === 0 ? (
        <Text style={discoverStyles.emptyText}>No trending developers right now.</Text>
      ) : (
        <FlatList
          horizontal
          data={data.trendingDevelopers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TrendingDeveloperBubble
              developer={item}
              isFollowing={followingSet.has(item.username)}
              isLoading={followLoadingSet.has(item.username)}
              onFollow={onFollow}
              onPress={onUserPress}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={discoverStyles.horizontalPadding}
        />
      )}

      {/* Trending Repositories */}
      <SectionHeader title="Trending Repositories" spaced />
      {data.trendingRepos.length === 0 ? (
        <Text style={discoverStyles.emptyText}>No trending repos right now.</Text>
      ) : (
        data.trendingRepos.map((repo) => (
          <TrendingRepoCard key={repo.id} repo={repo} onPress={onRepoPress} />
        ))
      )}

      {/* Trending Now (Hashtags) */}
      <SectionHeader title="Trending Now" spaced />
      {data.hashtags.length === 0 ? (
        <Text style={discoverStyles.emptyText}>No trending topics right now.</Text>
      ) : (
        <FlatList
          horizontal
          data={data.hashtags}
          keyExtractor={(item) => item.tag}
          renderItem={({ item }) => (
            <HashtagChip tag={item.tag} count={item.count} onPress={onHashtagPress} />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={discoverStyles.horizontalPadding}
          scrollEnabled
        />
      )}

      {/* People You Might Know */}
      <SectionHeader title="People You Might Know" spaced />
      {data.suggestedUsers.length === 0 ? (
        <Text style={discoverStyles.emptyText}>No suggestions right now.</Text>
      ) : (
        <View style={discoverStyles.gridContainer}>
          {userPairs.map(([left, right]) => (
            <View key={left.id} style={discoverStyles.gridRow}>
              <SuggestedUserGridCard
                user={left}
                isFollowing={followingSet.has(left.username)}
                isLoading={followLoadingSet.has(left.username)}
                onFollow={onFollow}
                onPress={onUserPress}
              />
              <View style={discoverStyles.gridGap} />
              {right ? (
                <SuggestedUserGridCard
                  user={right}
                  isFollowing={followingSet.has(right.username)}
                  isLoading={followLoadingSet.has(right.username)}
                  onFollow={onFollow}
                  onPress={onUserPress}
                />
              ) : (
                <View style={discoverStyles.gridPlaceholder} />
              )}
            </View>
          ))}
        </View>
      )}

      {/* Trending Snippets */}
      <SectionHeader title="Trending Snippets" spaced />
      {data.snippets.length === 0 ? (
        <Text style={discoverStyles.emptyText}>No trending snippets right now.</Text>
      ) : (
        data.snippets.map((snippet) => (
          <SnippetCard key={snippet.id} snippet={snippet} onPress={onSnippetPress} />
        ))
      )}

      <View style={discoverStyles.bottomPadding} />
    </ScrollView>
  );
}

const discoverStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loadingContent: {
    paddingBottom: 32,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  sectionSpaced: {
    marginTop: 28,
  },
  horizontalPadding: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  gridContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gridGap: {
    width: 10,
  },
  gridPlaceholder: {
    flex: 1,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  bottomPadding: {
    height: 20,
  },
});

// ---------------------------------------------------------------------------
// Main ExploreScreen
// ---------------------------------------------------------------------------
export default function ExploreScreen() {
  const router = useRouter();

  // ----- Discover state -----
  const [discoverData, setDiscoverData] = useState<DiscoverData>({
    trendingDevelopers: [],
    trendingRepos: [],
    hashtags: [],
    suggestedUsers: [],
    snippets: [],
  });
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // ----- Follow state -----
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followLoadingSet, setFollowLoadingSet] = useState<Set<string>>(new Set());

  // ----- Navigate to search -----
  const handleSearchFocus = useCallback(() => {
    router.push('/search');
  }, [router]);

  // ----- Load discover data -----
  const loadDiscover = useCallback(async () => {
    setDiscoverError(null);
    try {
      const [devsResult, reposResult, hashtagsResult, usersResult, snippetsResult] =
        await Promise.all([
          fetchTrendingDevelopers().catch(
            (): TrendingDevelopersResponse => ({ developers: [] }),
          ),
          fetchTrendingRepos().catch(
            (): TrendingReposResponse => ({ repositories: [] }),
          ),
          fetchTrendingHashtags().catch(
            (): TrendingHashtagsResponse => ({ tags: [] }),
          ),
          fetchSuggestedUsers().catch(
            (): SuggestedUsersResponse => ({ users: [] }),
          ),
          fetchTrendingSnippets().catch(
            (): TrendingSnippetsResponse => ({ snippets: [] }),
          ),
        ]);
      setDiscoverData({
        trendingDevelopers: devsResult.developers,
        trendingRepos: reposResult.repositories,
        hashtags: hashtagsResult.tags,
        suggestedUsers: usersResult.users,
        snippets: snippetsResult.snippets,
      });
    } catch (err: unknown) {
      setDiscoverError(
        err instanceof Error ? err.message : 'Failed to load discover content.',
      );
    }
  }, []);

  const handleInitialLoad = useCallback(async () => {
    setIsDiscoverLoading(true);
    await loadDiscover();
    setIsDiscoverLoading(false);
  }, [loadDiscover]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadDiscover();
    setIsRefreshing(false);
  }, [isRefreshing, loadDiscover]);

  useEffect(() => {
    handleInitialLoad();
  }, [handleInitialLoad]);

  // ----- Follow handler -----
  const handleFollow = useCallback(
    async (username: string) => {
      if (followLoadingSet.has(username) || followingSet.has(username)) return;

      setFollowLoadingSet((prev) => new Set(prev).add(username));
      try {
        await followUser(username);
        setFollowingSet((prev) => new Set(prev).add(username));
      } catch {
        // silently fail — user can retry
      } finally {
        setFollowLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(username);
          return next;
        });
      }
    },
    [followLoadingSet, followingSet],
  );

  // ----- Navigation handlers -----
  const handleHashtagPress = useCallback(
    (tag: string) => {
      router.push({ pathname: '/search', params: { q: tag } });
    },
    [router],
  );

  const handleRepoPress = useCallback(
    (repo: TrendingRepository) => {
      const [owner, repoName] = repo.fullName.split('/');
      if (owner && repoName) {
        router.push(`/repo/${owner}/${repoName}`);
      }
    },
    [router],
  );

  const handleUserPress = useCallback(
    (username: string) => {
      router.push(`/profile/${username}`);
    },
    [router],
  );

  const handleSnippetPress = useCallback(
    (snippet: TrendingSnippet) => {
      router.push(`/snippet/${snippet.id}`);
    },
    [router],
  );

  return (
    <SafeAreaView style={screenStyles.safeArea}>
      {/* Header */}
      <View style={screenStyles.header}>
        <Text style={screenStyles.headerTitle}>Explore</Text>
      </View>

      {/* Search bar — tappable shell that navigates to /search */}
      <View style={screenStyles.searchBarWrapper}>
        <TouchableOpacity
          style={screenStyles.searchBar}
          onPress={handleSearchFocus}
          activeOpacity={0.8}
        >
          <Text style={screenStyles.searchIcon}>{'🔍'}</Text>
          <Text style={screenStyles.searchPlaceholder}>
            Search developers, repos, posts...
          </Text>
        </TouchableOpacity>
      </View>

      {/* Discover content */}
      <DiscoverView
        data={discoverData}
        isLoading={isDiscoverLoading}
        isRefreshing={isRefreshing}
        error={discoverError}
        onRefresh={handleRefresh}
        onRetry={handleInitialLoad}
        onHashtagPress={handleHashtagPress}
        onRepoPress={handleRepoPress}
        onUserPress={handleUserPress}
        onSnippetPress={handleSnippetPress}
        followingSet={followingSet}
        followLoadingSet={followLoadingSet}
        onFollow={handleFollow}
      />
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  searchPlaceholder: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 15,
  },
});
