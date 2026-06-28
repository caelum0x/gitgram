import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import RepoCard from '../../components/Repo/RepoCard';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { logger } from '../../utils/logger';
import {
  orgService,
  type Organization,
  type OrgMember,
  type OrgRepository,
} from '../../services/orgService';

type OrgTab = 'repos' | 'people';

const TABS: ReadonlyArray<{ key: OrgTab; label: string; icon: string }> = [
  { key: 'repos', label: 'Repos', icon: 'folder' },
  { key: 'people', label: 'People', icon: 'people' },
];

const PAGE_SIZE = 20;

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

interface ListState<T> {
  items: T[];
  page: number;
  total: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  loaded: boolean;
}

function initialListState<T>(): ListState<T> {
  return {
    items: [],
    page: 1,
    total: 0,
    loading: false,
    refreshing: false,
    loadingMore: false,
    loaded: false,
  };
}

interface StatProps {
  value: number;
  label: string;
}

function Stat({ value, label }: StatProps) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statNumber}>{formatCount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface MemberRowProps {
  member: OrgMember;
  onPress: () => void;
}

function MemberRow({ member, onPress }: MemberRowProps) {
  const label = member.user.displayName ?? member.user.username;
  const initial = (label[0] ?? '?').toUpperCase();

  return (
    <TouchableOpacity style={styles.memberRow} onPress={onPress}>
      {member.user.avatar ? (
        <Image source={{ uri: member.user.avatar }} style={styles.memberAvatar} contentFit="cover" />
      ) : (
        <View style={styles.memberAvatarPlaceholder}>
          <Text style={styles.memberAvatarText}>{initial}</Text>
        </View>
      )}
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.memberHandle} numberOfLines={1}>
          @{member.user.username}
        </Text>
      </View>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{member.role}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function OrganizationScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const router = useRouter();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<OrgTab>('repos');
  const [repos, setRepos] = useState<ListState<OrgRepository>>(initialListState);
  const [members, setMembers] = useState<ListState<OrgMember>>(initialListState);

  const loadOrg = useCallback(async () => {
    if (!org) return;
    setOrgLoading(true);
    setOrgError(null);
    try {
      const data = await orgService.getOrg(org);
      if (!data) {
        setOrgError('Organization not found');
        setOrganization(null);
        return;
      }
      setOrganization(data);
    } catch (error) {
      logger.error('Load organization error:', error);
      setOrgError('Failed to load organization');
      setOrganization(null);
    } finally {
      setOrgLoading(false);
    }
  }, [org]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const loadRepos = useCallback(
    async (orgId: string, page: number) => {
      const isFirstPage = page === 1;
      setRepos((prev) => ({
        ...prev,
        loading: isFirstPage ? true : prev.loading,
        loadingMore: isFirstPage ? false : true,
      }));
      try {
        const result = await orgService.getOrgRepos(orgId, page, PAGE_SIZE);
        setRepos((prev) => ({
          items: isFirstPage ? result.items : [...prev.items, ...result.items],
          page,
          total: result.meta.total,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
        }));
      } catch (error) {
        logger.error('Load org repos error:', error);
        setRepos((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
        }));
      }
    },
    [],
  );

  const loadMembers = useCallback(
    async (orgId: string, page: number) => {
      const isFirstPage = page === 1;
      setMembers((prev) => ({
        ...prev,
        loading: isFirstPage ? true : prev.loading,
        loadingMore: isFirstPage ? false : true,
      }));
      try {
        const result = await orgService.getOrgMembers(orgId, page, PAGE_SIZE);
        setMembers((prev) => ({
          items: isFirstPage ? result.items : [...prev.items, ...result.items],
          page,
          total: result.meta.total,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
        }));
      } catch (error) {
        logger.error('Load org members error:', error);
        setMembers((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          loadingMore: false,
          loaded: true,
        }));
      }
    },
    [],
  );

  // Lazily load the active tab's first page once the org is resolved.
  useEffect(() => {
    if (!organization) return;
    if (activeTab === 'repos' && !repos.loaded && !repos.loading) {
      loadRepos(organization.id, 1);
    } else if (activeTab === 'people' && !members.loaded && !members.loading) {
      loadMembers(organization.id, 1);
    }
  }, [organization, activeTab, repos.loaded, repos.loading, members.loaded, members.loading, loadRepos, loadMembers]);

  const handleRefresh = useCallback(async () => {
    if (!org) return;
    setRefreshing(true);
    setRepos(initialListState);
    setMembers(initialListState);
    await loadOrg();
    setRefreshing(false);
  }, [org, loadOrg]);

  const handleLoadMoreRepos = useCallback(() => {
    if (!organization || repos.loadingMore || repos.loading) return;
    if (repos.items.length >= repos.total) return;
    loadRepos(organization.id, repos.page + 1);
  }, [organization, repos.loadingMore, repos.loading, repos.items.length, repos.total, repos.page, loadRepos]);

  const handleLoadMoreMembers = useCallback(() => {
    if (!organization || members.loadingMore || members.loading) return;
    if (members.items.length >= members.total) return;
    loadMembers(organization.id, members.page + 1);
  }, [organization, members.loadingMore, members.loading, members.items.length, members.total, members.page, loadMembers]);

  const handleOpenMember = useCallback(
    (member: OrgMember) => {
      router.push(`/profile/${member.userId}`);
    },
    [router],
  );

  const renderRepoItem = useCallback(
    ({ item }: { item: OrgRepository }) => (
      <RepoCard
        repo={{
          id: item.id,
          owner: item.owner,
          name: item.name,
          fullName: item.fullName,
          description: item.description ?? undefined,
          stars: item.stars,
          forks: item.forks,
          language: item.language ?? undefined,
        }}
      />
    ),
    [],
  );

  const renderMemberItem = useCallback(
    ({ item }: { item: OrgMember }) => (
      <MemberRow member={item} onPress={() => handleOpenMember(item)} />
    ),
    [handleOpenMember],
  );

  const keyExtractor = useCallback((item: { id: string }) => item.id, []);

  const renderFooter = useCallback((loadingMore: boolean) => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  }, []);

  if (orgLoading) {
    return (
      <View style={styles.container}>
        <Header title="Organization" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (orgError || !organization) {
    return (
      <View style={styles.container}>
        <Header title="Organization" />
        <EmptyState
          title={orgError ?? 'Organization not found'}
          message="This organization may not exist or could not be loaded."
          icon="🏢"
          actionLabel="Retry"
          onAction={loadOrg}
        />
      </View>
    );
  }

  const initial = (organization.name[0] ?? organization.slug[0] ?? '?').toUpperCase();

  return (
    <View style={styles.container}>
      <Header title={organization.slug} />
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        {/* Org header */}
        <View style={styles.header}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.orgName}>{organization.name}</Text>
          <Text style={styles.orgSlug}>@{organization.slug}</Text>
          {organization.description ? (
            <Text style={styles.orgDescription}>{organization.description}</Text>
          ) : null}

          <View style={styles.metaRow}>
            {organization.location ? (
              <View style={styles.metaItem}>
                <Icon name="location-on" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{organization.location}</Text>
              </View>
            ) : null}
            {organization.website ? (
              <View style={styles.metaItem}>
                <Icon name="link" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {organization.website}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.stats}>
            <Stat value={organization.repoCount} label="Repos" />
            <Stat value={organization.memberCount} label="People" />
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Icon
                  name={tab.icon}
                  size={18}
                  color={active ? Colors.accent : Colors.textSecondary}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab content */}
        {activeTab === 'repos' ? (
          repos.loading ? (
            <LoadingSpinner />
          ) : repos.items.length === 0 ? (
            <EmptyState
              title="No repositories"
              message="This organization has no repositories yet."
              icon="📦"
            />
          ) : (
            <FlatList
              data={repos.items}
              renderItem={renderRepoItem}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              onEndReachedThreshold={0.5}
              onEndReached={handleLoadMoreRepos}
              ListFooterComponent={renderFooter(repos.loadingMore)}
            />
          )
        ) : members.loading ? (
          <LoadingSpinner />
        ) : members.items.length === 0 ? (
          <EmptyState
            title="No members"
            message="This organization has no members yet."
            icon="👥"
          />
        ) : (
          <FlatList
            data={members.items}
            renderItem={renderMemberItem}
            keyExtractor={keyExtractor}
            scrollEnabled={false}
            onEndReachedThreshold={0.5}
            onEndReached={handleLoadMoreMembers}
            ListFooterComponent={renderFooter(members.loadingMore)}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: 'bold',
  },
  orgName: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
    textAlign: 'center',
  },
  orgSlug: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '500',
    marginBottom: 8,
  },
  orgDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 200,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: 40,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  memberHandle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: Colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
});
