import React, { useCallback, useEffect, useState } from 'react';
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

import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors (matched to profile/[username].tsx)
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
const PEOPLE_COLUMNS = 3;
const PEOPLE_ITEM_SIZE = (SCREEN_WIDTH - 32 - 16) / PEOPLE_COLUMNS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  login: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  membersCount: number;
  reposCount: number;
  followersCount: number;
  isFollowing?: boolean;
}

type MemberRole = 'owner' | 'admin' | 'member';

interface OrgMember {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: MemberRole;
}

interface OrgRepository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
}

interface OrgProject {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  itemsCount: number;
}

interface OrgReposResponse {
  repositories?: OrgRepository[];
  data?: OrgRepository[];
}

interface OrgMembersResponse {
  members?: OrgMember[];
  data?: OrgMember[];
}

interface OrgProjectsResponse {
  projects?: OrgProject[];
  data?: OrgProject[];
}

type OrgTab = 'repos' | 'people' | 'projects';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

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

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: '#F59E0B',
  admin: '#7C3AED',
  member: '#475569',
};

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  seed: string;
  size?: number;
  square?: boolean;
}

function Avatar({ uri, seed, size = 80, square = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (seed[0] ?? '?').toUpperCase();
  const radius = square ? 12 : size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[
          avatarStyles.image,
          { width: size, height: size, borderRadius: radius },
        ]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.placeholder,
        { width: size, height: size, borderRadius: radius },
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
// Stat pill
// ---------------------------------------------------------------------------

interface StatPillProps {
  value: number;
  label: string;
}

function StatPill({ value, label }: StatPillProps) {
  return (
    <View style={statStyles.container}>
      <Text style={statStyles.value}>{formatCount(value)}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
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
// Repository card (TrendingRepoCard-style)
// ---------------------------------------------------------------------------

interface RepoCardProps {
  repo: OrgRepository;
  onPress: () => void;
}

function RepoCard({ repo, onPress }: RepoCardProps) {
  const langColor = repo.language
    ? (LANGUAGE_COLORS[repo.language] ?? Colors.textMuted)
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [repoStyles.container, pressed && repoStyles.pressed]}
    >
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
    </Pressable>
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
  pressed: { backgroundColor: Colors.surfaceElevated },
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
// Member grid cell with role badge
// ---------------------------------------------------------------------------

interface MemberCellProps {
  member: OrgMember;
  onPress: () => void;
}

function MemberCell({ member, onPress }: MemberCellProps) {
  const roleColor = ROLE_COLORS[member.role] ?? ROLE_COLORS.member;
  const label = member.displayName ?? member.username;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        memberStyles.cell,
        { width: PEOPLE_ITEM_SIZE },
        pressed && memberStyles.pressed,
      ]}
    >
      <Avatar uri={member.avatarUrl} seed={label} size={64} />
      <Text style={memberStyles.name} numberOfLines={1}>
        {label}
      </Text>
      <View style={[memberStyles.roleBadge, { backgroundColor: roleColor }]}>
        <Text style={memberStyles.roleText}>{member.role}</Text>
      </View>
    </Pressable>
  );
}

const memberStyles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  pressed: { opacity: 0.65 },
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    maxWidth: '100%',
  },
  roleBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: OrgProject;
}

function ProjectCard({ project }: ProjectCardProps) {
  return (
    <View style={projectStyles.container}>
      <View style={projectStyles.header}>
        <Text style={projectStyles.name} numberOfLines={1}>
          {project.name}
        </Text>
        {project.status ? (
          <View style={projectStyles.statusBadge}>
            <Text style={projectStyles.statusText}>{project.status}</Text>
          </View>
        ) : null}
      </View>
      {project.description ? (
        <Text style={projectStyles.description} numberOfLines={2}>
          {project.description}
        </Text>
      ) : null}
      <Text style={projectStyles.itemsText}>
        {formatCount(project.itemsCount)} {project.itemsCount === 1 ? 'item' : 'items'}
      </Text>
    </View>
  );
}

const projectStyles = StyleSheet.create({
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
    gap: 8,
    marginBottom: 4,
  },
  name: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    color: Colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  itemsText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function OrgSkeleton() {
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
      <View style={skeletonStyles.btn} />
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
    borderRadius: 16,
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
  btn: {
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OrganizationScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const router = useRouter();

  // --- Org state ---
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  // --- Follow state ---
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<OrgTab>('repos');

  // --- Repos state ---
  const [repos, setRepos] = useState<OrgRepository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);

  // --- Members state ---
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);

  // --- Projects state ---
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // --- Pull to refresh ---
  const [refreshing, setRefreshing] = useState(false);

  // ----- Fetch organization -----
  const loadOrg = useCallback(async () => {
    if (!org) return;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const data = await apiClient<Organization>(
        `/v1/orgs/${encodeURIComponent(org)}`,
      );
      setOrganization(data);
      setIsFollowing(data.isFollowing ?? false);
    } catch (err: unknown) {
      setOrgError(
        err instanceof Error ? err.message : 'Failed to load organization',
      );
    } finally {
      setOrgLoading(false);
    }
  }, [org]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  // ----- Fetch repos -----
  const loadRepos = useCallback(async () => {
    if (!org || reposLoaded) return;
    setReposLoading(true);
    try {
      const data = await apiClient<OrgReposResponse>(
        `/v1/orgs/${encodeURIComponent(org)}/repos`,
      );
      setRepos(data.repositories ?? data.data ?? []);
      setReposLoaded(true);
    } catch {
      setRepos([]);
      setReposLoaded(true);
    } finally {
      setReposLoading(false);
    }
  }, [org, reposLoaded]);

  // ----- Fetch members -----
  const loadMembers = useCallback(async () => {
    if (!org || membersLoaded) return;
    setMembersLoading(true);
    try {
      const data = await apiClient<OrgMembersResponse>(
        `/v1/orgs/${encodeURIComponent(org)}/members`,
      );
      setMembers(data.members ?? data.data ?? []);
      setMembersLoaded(true);
    } catch {
      setMembers([]);
      setMembersLoaded(true);
    } finally {
      setMembersLoading(false);
    }
  }, [org, membersLoaded]);

  // ----- Fetch projects -----
  const loadProjects = useCallback(async () => {
    if (!org || projectsLoaded) return;
    setProjectsLoading(true);
    try {
      const data = await apiClient<OrgProjectsResponse>(
        `/v1/orgs/${encodeURIComponent(org)}/projects`,
      );
      setProjects(data.projects ?? data.data ?? []);
      setProjectsLoaded(true);
    } catch {
      setProjects([]);
      setProjectsLoaded(true);
    } finally {
      setProjectsLoading(false);
    }
  }, [org, projectsLoaded]);

  // Load content when tab changes
  useEffect(() => {
    if (activeTab === 'repos') {
      loadRepos();
    } else if (activeTab === 'people') {
      loadMembers();
    } else if (activeTab === 'projects') {
      loadProjects();
    }
  }, [activeTab, loadRepos, loadMembers, loadProjects]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async () => {
    if (!org) return;
    setRefreshing(true);
    setReposLoaded(false);
    setRepos([]);
    setMembersLoaded(false);
    setMembers([]);
    setProjectsLoaded(false);
    setProjects([]);
    await loadOrg();
    setRefreshing(false);
  }, [org, loadOrg]);

  // ----- Follow / Unfollow -----
  const handleFollowToggle = useCallback(async () => {
    if (!org || followLoading) return;
    setFollowLoading(true);

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setOrganization((prev) =>
      prev
        ? {
            ...prev,
            followersCount: prev.followersCount + (wasFollowing ? -1 : 1),
          }
        : prev,
    );

    try {
      await apiClient(`/v1/orgs/${encodeURIComponent(org)}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST',
      });
    } catch {
      setIsFollowing(wasFollowing);
      setOrganization((prev) =>
        prev
          ? {
              ...prev,
              followersCount: prev.followersCount + (wasFollowing ? 1 : -1),
            }
          : prev,
      );
    } finally {
      setFollowLoading(false);
    }
  }, [org, isFollowing, followLoading]);

  // ----- Navigation -----
  const handleOpenRepo = useCallback(
    (repo: OrgRepository) => {
      if (!org) return;
      router.push(`/repo/${encodeURIComponent(org)}/${encodeURIComponent(repo.name)}`);
    },
    [org, router],
  );

  const handleOpenMember = useCallback(
    (member: OrgMember) => {
      router.push(`/profile/${encodeURIComponent(member.username)}`);
    },
    [router],
  );

  // ----- Render helpers -----
  const renderRepoItem = useCallback(
    ({ item }: { item: OrgRepository }) => (
      <RepoCard repo={item} onPress={() => handleOpenRepo(item)} />
    ),
    [handleOpenRepo],
  );

  const renderMemberItem = useCallback(
    ({ item }: { item: OrgMember }) => (
      <MemberCell member={item} onPress={() => handleOpenMember(item)} />
    ),
    [handleOpenMember],
  );

  const renderProjectItem = useCallback(
    ({ item }: { item: OrgProject }) => <ProjectCard project={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: { id: string }) => item.id,
    [],
  );

  // ----- Org header -----
  const renderHeader = () => {
    if (orgLoading) return <OrgSkeleton />;

    if (orgError) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{orgError}</Text>
          <Pressable onPress={loadOrg} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (!organization) return null;

    return (
      <View style={styles.orgHeader}>
        {/* Avatar + stats row */}
        <View style={styles.avatarStatsRow}>
          <Avatar
            uri={organization.avatarUrl}
            seed={organization.name ?? organization.login}
            size={80}
            square
          />
          <View style={styles.statsRow}>
            <StatPill value={organization.reposCount} label="Repos" />
            <StatPill value={organization.membersCount} label="People" />
            <StatPill value={organization.followersCount} label="Followers" />
          </View>
        </View>

        {/* Name + handle + description */}
        <View style={styles.nameBlock}>
          <Text style={styles.displayName}>
            {organization.name ?? organization.login}
          </Text>
          <Text style={styles.loginText}>@{organization.login}</Text>
          {organization.description ? (
            <Text style={styles.description} numberOfLines={4}>
              {organization.description}
            </Text>
          ) : null}
        </View>

        {/* Follow button */}
        <View style={styles.actionsRow}>
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
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['repos', 'people', 'projects'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab === 'repos' ? 'Repos' : tab === 'people' ? 'People' : 'Projects'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
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
      <FlatList<OrgRepository>
        data={repos}
        renderItem={renderRepoItem}
        keyExtractor={keyExtractor}
        scrollEnabled={false}
      />
    );
  };

  // ----- People tab -----
  const renderPeopleTab = () => {
    if (membersLoading) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (members.length === 0) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyIcon}>{'👥'}</Text>
          <Text style={styles.emptyText}>No members</Text>
        </View>
      );
    }

    return (
      <FlatList<OrgMember>
        data={members}
        renderItem={renderMemberItem}
        keyExtractor={keyExtractor}
        numColumns={PEOPLE_COLUMNS}
        scrollEnabled={false}
        columnWrapperStyle={styles.peopleRow}
        contentContainerStyle={styles.peopleGrid}
      />
    );
  };

  // ----- Projects tab -----
  const renderProjectsTab = () => {
    if (projectsLoading) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (projects.length === 0) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyIcon}>{'📋'}</Text>
          <Text style={styles.emptyText}>No projects</Text>
        </View>
      );
    }

    return (
      <FlatList<OrgProject>
        data={projects}
        renderItem={renderProjectItem}
        keyExtractor={keyExtractor}
        scrollEnabled={false}
      />
    );
  };

  const renderActiveTab = () => {
    if (activeTab === 'repos') return renderReposTab();
    if (activeTab === 'people') return renderPeopleTab();
    return renderProjectsTab();
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
          {org ?? ''}
        </Text>
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

        {!orgLoading && !orgError && organization ? renderActiveTab() : null}
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

  // Org header section
  orgHeader: {
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
  loginText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  description: {
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

  // People grid
  peopleGrid: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  peopleRow: {
    justifyContent: 'flex-start',
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
