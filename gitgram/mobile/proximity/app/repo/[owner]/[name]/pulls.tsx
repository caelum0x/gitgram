import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
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
  prOpen: '#34D399',
  prClosed: '#F87171',
  prMerged: '#A78BFA',
  prDraft: '#64748B',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrState = 'open' | 'closed' | 'merged' | 'draft';
type FilterState = 'open' | 'closed' | 'draft' | 'all';
type SortOption = 'newest' | 'oldest' | 'most_commented' | 'recently_updated';

interface Label {
  name: string;
  color: string;
}

interface Assignee {
  username: string;
  avatarUrl: string | null;
}

interface PullRequest {
  number: number;
  title: string;
  state: PrState;
  isDraft: boolean;
  authorUsername: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  reviewStatus: 'approved' | 'changes_requested' | 'pending_review' | 'no_review' | null;
  labels: Label[];
  assignees: Assignee[];
}

interface PullsResponse {
  items: PullRequest[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function labelTextColor(hex: string): string {
  // Determine whether to use dark or light text based on luminance
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

function prStateColor(state: PrState): string {
  switch (state) {
    case 'open': return Colors.prOpen;
    case 'closed': return Colors.prClosed;
    case 'merged': return Colors.prMerged;
    case 'draft': return Colors.prDraft;
  }
}

function prStateIcon(state: PrState): string {
  switch (state) {
    case 'open': return '⊙';
    case 'closed': return '⊗';
    case 'merged': return '⎇';
    case 'draft': return '◎';
  }
}

function prStateLabel(state: PrState): string {
  switch (state) {
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    case 'merged': return 'Merged';
    case 'draft': return 'Draft';
  }
}

function reviewStatusBadge(status: PullRequest['reviewStatus']): { label: string; color: string; bg: string } | null {
  if (!status || status === 'no_review') return null;
  switch (status) {
    case 'approved':
      return { label: 'Approved', color: Colors.prOpen, bg: '#0D2B22' };
    case 'changes_requested':
      return { label: 'Changes requested', color: Colors.prClosed, bg: '#2B0D0D' };
    case 'pending_review':
      return { label: 'Review pending', color: Colors.warning, bg: '#2B2000' };
  }
}

// ---------------------------------------------------------------------------
// Avatar component (with fallback)
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri: string | null;
  name: string;
  size: number;
}

function Avatar({ uri, name, size }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: Colors.primaryDark,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: Colors.white, fontWeight: '700', fontSize: size * 0.4 }}>
        {(name[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PR row
// ---------------------------------------------------------------------------

interface PrRowProps {
  pr: PullRequest;
  onPress: () => void;
}

function PrRow({ pr, onPress }: PrRowProps) {
  const effectiveState: PrState = pr.isDraft ? 'draft' : pr.state;
  const stateColor = prStateColor(effectiveState);
  const reviewBadge = reviewStatusBadge(pr.reviewStatus);

  return (
    <Pressable
      style={({ pressed }) => [prRowStyles.row, pressed && prRowStyles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pull request #${pr.number}: ${pr.title}`}
    >
      {/* Status icon */}
      <View style={[prRowStyles.iconWrap, { borderColor: stateColor }]}>
        <Text style={[prRowStyles.iconText, { color: stateColor }]}>
          {prStateIcon(effectiveState)}
        </Text>
      </View>

      {/* Main content */}
      <View style={prRowStyles.body}>
        {/* Title */}
        <Text style={prRowStyles.title} numberOfLines={2}>
          {pr.title}
        </Text>

        {/* Labels */}
        {pr.labels.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={prRowStyles.labelsScroll}
            contentContainerStyle={prRowStyles.labelsContent}
          >
            {pr.labels.map((label) => {
              const bg = `#${label.color}`;
              const fg = labelTextColor(label.color);
              return (
                <View key={label.name} style={[prRowStyles.labelChip, { backgroundColor: bg }]}>
                  <Text style={[prRowStyles.labelText, { color: fg }]}>{label.name}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Meta row */}
        <View style={prRowStyles.metaRow}>
          <Text style={prRowStyles.metaText}>
            #{pr.number}
          </Text>
          <View style={prRowStyles.authorRow}>
            <Avatar uri={pr.authorAvatarUrl} name={pr.authorUsername} size={14} />
            <Text style={prRowStyles.metaText}>{pr.authorUsername}</Text>
          </View>
          <Text style={prRowStyles.metaText}>{timeAgo(pr.createdAt)}</Text>
        </View>

        {/* Bottom row: review badge + comment count + assignees */}
        <View style={prRowStyles.bottomRow}>
          {reviewBadge && (
            <View style={[prRowStyles.reviewBadge, { backgroundColor: reviewBadge.bg, borderColor: reviewBadge.color }]}>
              <Text style={[prRowStyles.reviewBadgeText, { color: reviewBadge.color }]}>
                {reviewBadge.label}
              </Text>
            </View>
          )}

          {pr.commentsCount > 0 && (
            <View style={prRowStyles.commentChip}>
              <Text style={prRowStyles.commentText}>💬 {pr.commentsCount}</Text>
            </View>
          )}

          {pr.assignees.length > 0 && (
            <View style={prRowStyles.assigneesRow}>
              {pr.assignees.slice(0, 3).map((a, i) => (
                <View
                  key={a.username}
                  style={[prRowStyles.assigneeAvatar, { marginLeft: i === 0 ? 0 : -6 }]}
                >
                  <Avatar uri={a.avatarUrl} name={a.username} size={18} />
                </View>
              ))}
              {pr.assignees.length > 3 && (
                <View style={[prRowStyles.assigneeAvatar, { marginLeft: -6 }]}>
                  <View style={prRowStyles.assigneeOverflow}>
                    <Text style={prRowStyles.assigneeOverflowText}>+{pr.assignees.length - 3}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const prRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.background,
  },
  rowPressed: { backgroundColor: Colors.surface },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  iconText: { fontSize: 13, fontWeight: '700' },
  body: { flex: 1, gap: 5 },
  title: { color: Colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  labelsScroll: { maxHeight: 24 },
  labelsContent: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  labelChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  labelText: { fontSize: 10, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.textMuted, fontSize: 11 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  reviewBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  reviewBadgeText: { fontSize: 10, fontWeight: '600' },
  commentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  commentText: { color: Colors.textMuted, fontSize: 11 },
  assigneesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  assigneeAvatar: { zIndex: 1 },
  assigneeOverflow: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  assigneeOverflowText: { color: Colors.textMuted, fontSize: 9, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterState; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'draft', label: 'Draft' },
  { key: 'all', label: 'All' },
];

interface FilterTabsProps {
  active: FilterState;
  onSelect: (f: FilterState) => void;
}

function FilterTabs({ active, onSelect }: FilterTabsProps) {
  return (
    <View style={filterTabStyles.bar}>
      {FILTER_TABS.map((tab) => (
        <Pressable
          key={tab.key}
          style={[filterTabStyles.tab, active === tab.key && filterTabStyles.tabActive]}
          onPress={() => onSelect(tab.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: active === tab.key }}
        >
          <Text style={[filterTabStyles.label, active === tab.key && filterTabStyles.labelActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const filterTabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
// Sort bottom sheet
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'most_commented', label: 'Most commented' },
  { key: 'recently_updated', label: 'Recently updated' },
];

interface SortSheetProps {
  visible: boolean;
  current: SortOption;
  onSelect: (s: SortOption) => void;
  onClose: () => void;
}

function SortSheet({ visible, current, onSelect, onClose }: SortSheetProps) {
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
        <Text style={sheetStyles.sheetTitle}>Sort by</Text>
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[sheetStyles.option, current === opt.key && sheetStyles.optionActive]}
            onPress={() => { onSelect(opt.key); onClose(); }}
            accessibilityRole="button"
          >
            <Text style={[sheetStyles.optionText, current === opt.key && sheetStyles.optionTextActive]}>
              {opt.label}
            </Text>
            {current === opt.key && (
              <Text style={sheetStyles.checkmark}>✓</Text>
            )}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionActive: { backgroundColor: 'transparent' },
  optionText: { flex: 1, color: Colors.textSecondary, fontSize: 15 },
  optionTextActive: { color: Colors.primary, fontWeight: '600' },
  checkmark: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Label filter bottom sheet
// ---------------------------------------------------------------------------

interface LabelSheetProps {
  visible: boolean;
  labels: Label[];
  selectedLabels: string[];
  onToggle: (name: string) => void;
  onClose: () => void;
}

function LabelSheet({ visible, labels, selectedLabels, onToggle, onClose }: LabelSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={labelSheetStyles.sheet}>
        <View style={sheetStyles.handle} />
        <Text style={sheetStyles.sheetTitle}>Filter by label</Text>
        {labels.length === 0 ? (
          <Text style={labelSheetStyles.noLabels}>No labels available</Text>
        ) : (
          <View style={labelSheetStyles.chipsWrap}>
            {labels.map((label) => {
              const selected = selectedLabels.includes(label.name);
              const bg = selected ? `#${label.color}` : Colors.surfaceElevated;
              const fg = selected ? labelTextColor(label.color) : Colors.textSecondary;
              return (
                <Pressable
                  key={label.name}
                  style={[labelSheetStyles.chip, { backgroundColor: bg, borderColor: `#${label.color}` }]}
                  onPress={() => onToggle(label.name)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[labelSheetStyles.chipText, { color: fg }]}>{label.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable style={labelSheetStyles.doneBtn} onPress={onClose}>
          <Text style={labelSheetStyles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const labelSheetStyles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: Colors.border,
    maxHeight: '70%',
  },
  noLabels: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyPrs({ filter }: { filter: FilterState }) {
  const messages: Record<FilterState, string> = {
    open: 'No open pull requests',
    closed: 'No closed pull requests',
    draft: 'No draft pull requests',
    all: 'No pull requests yet',
  };
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>⎇</Text>
      <Text style={emptyStyles.text}>{messages[filter]}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 60 },
  icon: { fontSize: 40, marginBottom: 12, color: Colors.textMuted },
  text: { color: Colors.textMuted, fontSize: 15 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PullsScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState<FilterState>('open');
  const [sort, setSort] = useState<SortOption>('newest');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);

  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [labelSheetVisible, setLabelSheetVisible] = useState(false);

  const loadingRef = useRef(false);

  // ----- Build query params -----
  const buildParams = useCallback(
    (nextCursor?: string | null): string => {
      const params = new URLSearchParams();
      if (filterState !== 'all') params.set('state', filterState);
      params.set('sort', sort);
      params.set('limit', '20');
      if (nextCursor) params.set('cursor', nextCursor);
      if (selectedLabels.length > 0) params.set('labels', selectedLabels.join(','));
      return params.toString();
    },
    [filterState, sort, selectedLabels],
  );

  // ----- Fetch PRs -----
  const fetchPrs = useCallback(
    async (opts: { reset?: boolean } = {}) => {
      if (!owner || !name) return;
      if (loadingRef.current) return;
      loadingRef.current = true;

      const isReset = opts.reset !== false;
      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const nextCursor = isReset ? null : cursor;
        const qs = buildParams(nextCursor);
        const data = await apiClient<PullsResponse>(
          `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?${qs}`,
        );

        const incoming = data.items ?? [];

        if (isReset) {
          setPrs(incoming);
          // Collect unique labels for the label filter sheet
          const labelMap = new Map<string, Label>();
          incoming.forEach((pr) =>
            pr.labels.forEach((l) => labelMap.set(l.name, l)),
          );
          setAllLabels(Array.from(labelMap.values()));
        } else {
          setPrs((prev) => {
            const updated = [...prev, ...incoming];
            // Update label list from accumulated PRs
            const labelMap = new Map<string, Label>();
            updated.forEach((pr) =>
              pr.labels.forEach((l) => labelMap.set(l.name, l)),
            );
            setAllLabels(Array.from(labelMap.values()));
            return updated;
          });
        }

        setCursor(data.nextCursor ?? null);
        setHasMore(!!data.nextCursor);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load pull requests');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [owner, name, cursor, buildParams],
  );

  // Reset and reload when filter/sort changes
  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    setPrs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, sort, selectedLabels]);

  // Fetch on mount and when filter params reset
  useEffect(() => {
    fetchPrs({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, sort, selectedLabels]);

  // ----- Pull to refresh -----
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursor(null);
    setHasMore(true);
    setPrs([]);
    loadingRef.current = false;
    await fetchPrs({ reset: true });
    setRefreshing(false);
  }, [fetchPrs]);

  // ----- Infinite scroll -----
  const handleEndReached = useCallback(() => {
    if (!hasMore || loadingRef.current || loadingMore) return;
    fetchPrs({ reset: false });
  }, [hasMore, loadingMore, fetchPrs]);

  // ----- Navigate to PR detail -----
  const handlePressPr = useCallback(
    (pr: PullRequest) => {
      router.push(
        `/repo/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/pull/${pr.number}` as never,
      );
    },
    [router, owner, name],
  );

  // ----- Label toggle -----
  const handleToggleLabel = useCallback((labelName: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelName)
        ? prev.filter((l) => l !== labelName)
        : [...prev, labelName],
    );
  }, []);

  // ----- Sort label -----
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Sort';

  // ----- Filter label for state icon -----
  const stateIconForFilter: Record<FilterState, { color: string }> = {
    open: { color: Colors.prOpen },
    closed: { color: Colors.prClosed },
    draft: { color: Colors.prDraft },
    all: { color: Colors.primaryLight },
  };

  // ----- Key extractor -----
  const keyExtractor = useCallback((item: PullRequest) => String(item.number), []);

  // ----- Render item -----
  const renderItem = useCallback(
    ({ item }: { item: PullRequest }) => (
      <PrRow pr={item} onPress={() => handlePressPr(item)} />
    ),
    [handlePressPr],
  );

  // ----- Footer loader -----
  const ListFooter = loadingMore ? (
    <ActivityIndicator
      size="small"
      color={Colors.primary}
      style={styles.footerLoader}
    />
  ) : null;

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

        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>
            {owner}/{name}
          </Text>
          <Text style={styles.navSubtitle}>Pull Requests</Text>
        </View>

        <View style={styles.navActions}>
          {/* Label filter button */}
          <TouchableOpacity
            style={[styles.navBtn, selectedLabels.length > 0 && styles.navBtnActive]}
            onPress={() => setLabelSheetVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel="Filter by label"
          >
            <Text style={[styles.navBtnText, selectedLabels.length > 0 && styles.navBtnTextActive]}>
              🏷{selectedLabels.length > 0 ? ` ${selectedLabels.length}` : ''}
            </Text>
          </TouchableOpacity>

          {/* New PR button */}
          <TouchableOpacity
            style={styles.newPrBtn}
            onPress={() =>
              router.push(
                `/repo/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/pulls/new` as never,
              )
            }
            activeOpacity={0.8}
            accessibilityLabel="Create new pull request"
          >
            <Text style={styles.newPrBtnText}>+ PR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort + active filter bar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortSheetVisible(true)}
          activeOpacity={0.7}
          accessibilityLabel="Change sort order"
        >
          <Text style={styles.sortIcon}>↕</Text>
          <Text style={styles.sortText} numberOfLines={1}>{sortLabel}</Text>
        </TouchableOpacity>

        {selectedLabels.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeLabelScroll}
          >
            {selectedLabels.map((l) => {
              const label = allLabels.find((al) => al.name === l);
              const bg = label ? `#${label.color}` : Colors.surfaceElevated;
              const fg = label ? labelTextColor(label.color) : Colors.textSecondary;
              return (
                <Pressable
                  key={l}
                  style={[styles.activeLabelChip, { backgroundColor: bg }]}
                  onPress={() => handleToggleLabel(l)}
                  accessibilityLabel={`Remove label filter: ${l}`}
                >
                  <Text style={[styles.activeLabelText, { color: fg }]}>{l} ×</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Filter tabs */}
      <FilterTabs active={filterState} onSelect={setFilterState} />

      {/* PR list */}
      {loading && prs.length === 0 ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchPrs({ reset: true })}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<PullRequest>
          data={prs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={<EmptyPrs filter={filterState} />}
          contentContainerStyle={prs.length === 0 ? styles.emptyContainer : undefined}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Sort sheet */}
      <SortSheet
        visible={sortSheetVisible}
        current={sort}
        onSelect={setSort}
        onClose={() => setSortSheetVisible(false)}
      />

      {/* Label filter sheet */}
      <LabelSheet
        visible={labelSheetVisible}
        labels={allLabels}
        selectedLabels={selectedLabels}
        onToggle={handleToggleLabel}
        onClose={() => setLabelSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
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
    gap: 8,
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
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  navSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  navBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark },
  navBtnText: { color: Colors.textSecondary, fontSize: 13 },
  navBtnTextActive: { color: Colors.primaryLight },
  newPrBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  newPrBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  // Controls bar
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    flexShrink: 0,
  },
  sortIcon: { color: Colors.textSecondary, fontSize: 12 },
  sortText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  activeLabelScroll: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  activeLabelChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activeLabelText: { fontSize: 11, fontWeight: '600' },

  // List states
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footerLoader: { paddingVertical: 20 },
  emptyContainer: { flexGrow: 1 },

  // Error
  errorBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 20,
  },
  retryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
