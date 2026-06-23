import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { apiClient } from '../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors — matches existing screen palette (see pulls.tsx)
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
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// Palette cycles for languages, contributor bars, and chart segments.
const CHART_PALETTE = [
  '#7C3AED',
  '#34D399',
  '#60A5FA',
  '#FBBF24',
  '#F472B6',
  '#FB923C',
  '#A3E635',
  '#38BDF8',
  '#F87171',
  '#818CF8',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'dependencies' | 'contributors' | 'activity' | 'languages';

type DepType = 'prod' | 'dev' | 'peer';

interface Dependency {
  name: string;
  version: string;
  type: DepType;
  license?: string;
  outdated?: boolean;
  latestVersion?: string;
}

interface DependenciesResponse {
  dependencies: Dependency[];
  total?: number;
}

interface Contributor {
  username: string;
  avatarUrl?: string | null;
  commits: number;
}

interface ContributorsResponse {
  contributors: Contributor[];
  total?: number;
}

interface WeeklyActivity {
  weekStart: string; // ISO date
  commits: number;
  issuesOpened: number;
  issuesClosed: number;
  prsOpened: number;
  prsClosed: number;
}

interface LanguageStat {
  name: string;
  bytes: number;
  percentage: number;
}

interface StatsResponse {
  periodDays?: number;
  activity: WeeklyActivity[];
  languages: LanguageStat[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}M`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)}K`;
  return `${bytes}B`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatWeekLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Avatar (image with initial fallback)
// ---------------------------------------------------------------------------

interface AvatarProps {
  uri?: string | null;
  username: string;
  size?: number;
}

function Avatar({ uri, username, size = 36 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setFailed(true)}
        accessibilityLabel={`Avatar for ${username}`}
      />
    );
  }

  return (
    <View
      style={[
        avatarStyles.circle,
        { width: size, height: size, borderRadius: radius },
      ]}
      accessibilityLabel={`Avatar for ${username}`}
    >
      <Text style={[avatarStyles.initial, { fontSize: size * 0.38 }]}>
        {(username[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { color: Colors.white, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string }[] = [
  { id: 'dependencies', label: 'Deps' },
  { id: 'contributors', label: 'People' },
  { id: 'activity', label: 'Activity' },
  { id: 'languages', label: 'Languages' },
];

interface TabBarProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
}

function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <View style={tabBarStyles.row}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[tabBarStyles.tab, isActive && tabBarStyles.tabActive]}
            onPress={() => onSelect(tab.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${tab.label} tab`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[tabBarStyles.label, isActive && tabBarStyles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primaryLight },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  labelActive: { color: Colors.primaryLight },
});

// ---------------------------------------------------------------------------
// Dependency type badge
// ---------------------------------------------------------------------------

const DEP_TYPE_META: Record<DepType, { label: string; color: string }> = {
  prod: { label: 'prod', color: Colors.primary },
  dev: { label: 'dev', color: Colors.textMuted },
  peer: { label: 'peer', color: '#0EA5E9' },
};

function DepTypeBadge({ type }: { type: DepType }) {
  const { label, color } = DEP_TYPE_META[type];
  return (
    <View style={[depBadgeStyles.badge, { borderColor: color }]}>
      <Text style={[depBadgeStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const depBadgeStyles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

// ---------------------------------------------------------------------------
// Dependencies tab
// ---------------------------------------------------------------------------

const DEP_ORDER: DepType[] = ['prod', 'dev', 'peer'];
const DEP_SECTION_LABELS: Record<DepType, string> = {
  prod: 'Production',
  dev: 'Development',
  peer: 'Peer',
};

function DepsTab({ data }: { data: DependenciesResponse }) {
  const grouped = useMemo(() => {
    const groups: Record<DepType, Dependency[]> = { prod: [], dev: [], peer: [] };
    data.dependencies.forEach((dep) => groups[dep.type].push(dep));
    DEP_ORDER.forEach((t) => groups[t].sort((a, b) => a.name.localeCompare(b.name)));
    return groups;
  }, [data.dependencies]);

  const outdatedCount = useMemo(
    () => data.dependencies.filter((d) => d.outdated).length,
    [data.dependencies],
  );

  if (data.dependencies.length === 0) {
    return <EmptyState message="No dependencies found" />;
  }

  const total = data.total ?? data.dependencies.length;

  return (
    <View style={depsStyles.container}>
      <View style={depsStyles.totalRow}>
        <Text style={depsStyles.totalLabel}>Total dependencies</Text>
        <View style={depsStyles.badges}>
          {outdatedCount > 0 && (
            <View style={depsStyles.outdatedBadge}>
              <Text style={depsStyles.outdatedBadgeText}>{outdatedCount} outdated</Text>
            </View>
          )}
          <View style={depsStyles.totalBadge}>
            <Text style={depsStyles.totalCount}>{total}</Text>
          </View>
        </View>
      </View>

      {DEP_ORDER.map((type) => {
        const items = grouped[type];
        if (items.length === 0) return null;
        return (
          <View key={type} style={depsStyles.section}>
            <View style={depsStyles.sectionHeader}>
              <Text style={depsStyles.sectionTitle}>{DEP_SECTION_LABELS[type]}</Text>
              <Text style={depsStyles.sectionCount}>{items.length}</Text>
            </View>
            {items.map((dep) => (
              <View key={`${type}:${dep.name}`} style={depsStyles.depRow}>
                <View style={depsStyles.depMain}>
                  <Text style={depsStyles.depName} numberOfLines={1}>
                    {dep.name}
                  </Text>
                  <View style={depsStyles.depMeta}>
                    <Text style={depsStyles.depVersion}>{dep.version}</Text>
                    {dep.outdated && dep.latestVersion && (
                      <View style={depsStyles.outdatedPill}>
                        <Text style={depsStyles.outdatedText}>
                          ↑ {dep.latestVersion}
                        </Text>
                      </View>
                    )}
                    {dep.outdated && !dep.latestVersion && (
                      <View style={depsStyles.outdatedDot} />
                    )}
                  </View>
                </View>
                <View style={depsStyles.depRight}>
                  {dep.license && (
                    <Text style={depsStyles.depLicense}>{dep.license}</Text>
                  )}
                  <DepTypeBadge type={dep.type} />
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const depsStyles = StyleSheet.create({
  container: { padding: 16 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outdatedBadge: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  outdatedBadgeText: { color: Colors.warning, fontSize: 11, fontWeight: '700' },
  totalBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  totalCount: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  sectionTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionCount: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  depRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  depMain: { flex: 1, gap: 3 },
  depName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  depMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  depVersion: { color: Colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  outdatedPill: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  outdatedText: { color: Colors.warning, fontSize: 10, fontWeight: '600' },
  outdatedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  depRight: { alignItems: 'flex-end', gap: 5 },
  depLicense: { color: Colors.textMuted, fontSize: 10, fontWeight: '500' },
});

// ---------------------------------------------------------------------------
// Contributors tab
// ---------------------------------------------------------------------------

interface ContributorsTabProps {
  data: ContributorsResponse;
  onProfile: (username: string) => void;
}

function ContributorsTab({ data, onProfile }: ContributorsTabProps) {
  const ranked = useMemo(
    () => [...data.contributors].sort((a, b) => b.commits - a.commits),
    [data.contributors],
  );

  if (ranked.length === 0) {
    return <EmptyState message="No contributors found" />;
  }

  const maxCommits = ranked[0]?.commits ?? 1;

  return (
    <View style={contribStyles.container}>
      {ranked.map((c, idx) => {
        const barWidth = maxCommits > 0 ? (c.commits / maxCommits) * 100 : 0;
        return (
          <Pressable
            key={c.username}
            style={({ pressed }) => [contribStyles.row, pressed && contribStyles.rowPressed]}
            onPress={() => onProfile(c.username)}
            accessibilityRole="button"
            accessibilityLabel={`${c.username}, ${pluralize(c.commits, 'commit')}`}
          >
            <Text style={contribStyles.rank}>#{idx + 1}</Text>
            <Avatar uri={c.avatarUrl} username={c.username} size={36} />
            <View style={contribStyles.info}>
              <View style={contribStyles.topLine}>
                <Text style={contribStyles.username} numberOfLines={1}>
                  {c.username}
                </Text>
                <Text style={contribStyles.commits}>{formatCount(c.commits)} commits</Text>
              </View>
              <View style={contribStyles.barTrack}>
                <View
                  style={[
                    contribStyles.barFill,
                    { width: `${Math.max(barWidth, 2)}%`, backgroundColor: paletteColor(idx) },
                  ]}
                />
              </View>
            </View>
            <Text style={contribStyles.chevron}>{'›'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const contribStyles = StyleSheet.create({
  container: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowPressed: { backgroundColor: Colors.surface },
  rank: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    width: 26,
    textAlign: 'right',
  },
  info: { flex: 1, gap: 6 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  username: { color: Colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
  commits: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  barTrack: {
    height: 5,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: 3 },
  chevron: { color: Colors.textMuted, fontSize: 22, fontWeight: '300' },
});

// ---------------------------------------------------------------------------
// Activity tab — SVG commits-per-week bar chart + open/closed bars
// ---------------------------------------------------------------------------

const CHART_WIDTH = 320;
const CHART_HEIGHT = 90;

interface CommitsBarChartProps {
  weeks: WeeklyActivity[];
}

function CommitsBarChart({ weeks }: CommitsBarChartProps) {
  const gap = 3;
  const count = Math.max(weeks.length, 1);
  const barWidth = Math.max((CHART_WIDTH - gap * (count - 1)) / count, 1);
  const maxCommits = weeks.reduce((m, w) => Math.max(m, w.commits), 0);

  return (
    <Svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      accessibilityLabel="Commits per week bar chart"
    >
      {weeks.map((week, idx) => {
        const barHeight =
          maxCommits > 0 ? (week.commits / maxCommits) * CHART_HEIGHT : 0;
        const x = idx * (barWidth + gap);
        const y = CHART_HEIGHT - Math.max(barHeight, week.commits > 0 ? 2 : 0);
        return (
          <Rect
            key={week.weekStart}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barHeight, week.commits > 0 ? 2 : 0)}
            rx={1.5}
            fill={Colors.primaryLight}
            opacity={0.9}
          />
        );
      })}
    </Svg>
  );
}

interface OpenClosedBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function OpenClosedBar({ label, value, max, color }: OpenClosedBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={actStyles.barRow}>
      <Text style={actStyles.barLabel}>{label}</Text>
      <View style={actStyles.barTrack}>
        <View style={[actStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[actStyles.barCount, { color }]}>{value}</Text>
    </View>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
}

function SummaryCard({ label, value, color }: SummaryCardProps) {
  return (
    <View style={actStyles.summaryCard}>
      <Text style={[actStyles.summaryValue, { color }]}>{formatCount(value)}</Text>
      <Text style={actStyles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ActivityTab({ data }: { data: StatsResponse }) {
  // Up to 13 weeks ≈ 91 days
  const weeks = useMemo(() => data.activity.slice(-13), [data.activity]);

  const totals = useMemo(() => {
    return weeks.reduce(
      (acc, w) => ({
        commits: acc.commits + w.commits,
        issuesOpened: acc.issuesOpened + w.issuesOpened,
        issuesClosed: acc.issuesClosed + w.issuesClosed,
        prsOpened: acc.prsOpened + w.prsOpened,
        prsClosed: acc.prsClosed + w.prsClosed,
      }),
      { commits: 0, issuesOpened: 0, issuesClosed: 0, prsOpened: 0, prsClosed: 0 },
    );
  }, [weeks]);

  const periodDays = data.periodDays ?? 90;
  const issuesMax = Math.max(totals.issuesOpened, totals.issuesClosed, 1);
  const prsMax = Math.max(totals.prsOpened, totals.prsClosed, 1);

  return (
    <View style={actStyles.container}>
      <Text style={actStyles.period}>Last {periodDays} days</Text>

      {/* Summary cards */}
      <View style={actStyles.summaryRow}>
        <SummaryCard label="Commits" value={totals.commits} color={Colors.primaryLight} />
        <SummaryCard label="Issues opened" value={totals.issuesOpened} color={Colors.warning} />
        <SummaryCard label="Issues closed" value={totals.issuesClosed} color={Colors.success} />
      </View>

      {/* Commits per week — SVG bar chart */}
      <View style={actStyles.chartCard}>
        <Text style={actStyles.chartTitle}>Commits per week</Text>
        {weeks.length === 0 ? (
          <Text style={actStyles.noData}>No activity data</Text>
        ) : (
          <>
            <CommitsBarChart weeks={weeks} />
            <View style={actStyles.xAxisRow}>
              <Text style={actStyles.xLabel}>{formatWeekLabel(weeks[0]?.weekStart)}</Text>
              <Text style={actStyles.xLabel}>
                {formatWeekLabel(weeks[weeks.length - 1]?.weekStart)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Issues opened vs closed */}
      <View style={actStyles.chartCard}>
        <Text style={actStyles.chartTitle}>Issues</Text>
        <OpenClosedBar label="Opened" value={totals.issuesOpened} max={issuesMax} color={Colors.warning} />
        <OpenClosedBar label="Closed" value={totals.issuesClosed} max={issuesMax} color={Colors.success} />
      </View>

      {/* PRs opened vs closed */}
      <View style={actStyles.chartCard}>
        <Text style={actStyles.chartTitle}>Pull requests</Text>
        <OpenClosedBar label="Opened" value={totals.prsOpened} max={prsMax} color={Colors.primaryLight} />
        <OpenClosedBar label="Closed" value={totals.prsClosed} max={prsMax} color={Colors.success} />
      </View>
    </View>
  );
}

const actStyles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  period: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  chartTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  noData: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '500' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', width: 52 },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
  barCount: { fontSize: 12, fontWeight: '700', width: 32, textAlign: 'right' },
});

// ---------------------------------------------------------------------------
// Languages tab — SVG donut chart + breakdown list
// ---------------------------------------------------------------------------

interface LanguageSegment {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
}

// Build an SVG arc path for a donut segment (angles in radians).
function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const polar = (r: number, angle: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });
  const startOuter = polar(outerR, startAngle);
  const endOuter = polar(outerR, endAngle);
  const startInner = polar(innerR, endAngle);
  const endInner = polar(innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

function DonutChart({ segments }: { segments: LanguageSegment[] }) {
  const size = 170;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.58;

  // A single segment is a full circle — an arc can't represent 360°, so draw a ring.
  if (segments.length === 1) {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={cx}
          cy={cy}
          r={(outerR + innerR) / 2}
          stroke={segments[0].color}
          strokeWidth={outerR - innerR}
          fill="none"
        />
      </Svg>
    );
  }

  const totalPct = segments.reduce((s, seg) => s + seg.percentage, 0) || 1;
  let cursor = -Math.PI / 2; // start at top

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      accessibilityLabel="Language breakdown donut chart"
    >
      <G>
        {segments.map((seg) => {
          const sweep = (seg.percentage / totalPct) * Math.PI * 2;
          if (sweep <= 0) return null;
          const start = cursor;
          const end = cursor + sweep;
          cursor = end;
          return (
            <Path
              key={seg.name}
              d={describeDonutArc(cx, cy, outerR, innerR, start, end)}
              fill={seg.color}
            />
          );
        })}
      </G>
    </Svg>
  );
}

function LanguagesTab({ data }: { data: StatsResponse }) {
  const segments = useMemo<LanguageSegment[]>(
    () =>
      [...data.languages]
        .sort((a, b) => b.bytes - a.bytes)
        .map((l, i) => ({
          name: l.name,
          bytes: l.bytes,
          percentage: l.percentage,
          color: paletteColor(i),
        })),
    [data.languages],
  );

  if (segments.length === 0) {
    return <EmptyState message="No language data" />;
  }

  const totalBytes = segments.reduce((s, l) => s + l.bytes, 0);

  return (
    <View style={langStyles.container}>
      <View style={langStyles.chartWrap}>
        <DonutChart segments={segments} />
      </View>

      <View style={langStyles.list}>
        {segments.map((seg) => (
          <View key={seg.name} style={langStyles.row}>
            <View style={[langStyles.dot, { backgroundColor: seg.color }]} />
            <Text style={langStyles.langName} numberOfLines={1}>
              {seg.name}
            </Text>
            <View style={langStyles.langBarTrack}>
              <View
                style={[
                  langStyles.langBarFill,
                  { width: `${seg.percentage}%`, backgroundColor: seg.color },
                ]}
              />
            </View>
            <Text style={[langStyles.pct, { color: seg.color }]}>
              {seg.percentage.toFixed(1)}%
            </Text>
            <Text style={langStyles.bytes}>{formatBytes(seg.bytes)}</Text>
          </View>
        ))}
      </View>

      <View style={langStyles.totalRow}>
        <Text style={langStyles.totalLabel}>Total analyzed</Text>
        <Text style={langStyles.totalValue}>{formatBytes(totalBytes)}</Text>
      </View>
    </View>
  );
}

const langStyles = StyleSheet.create({
  container: { padding: 16, gap: 18 },
  chartWrap: { alignItems: 'center', paddingVertical: 8 },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  langName: { color: Colors.text, fontSize: 13, fontWeight: '600', width: 84 },
  langBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  langBarFill: { height: 6, borderRadius: 3, opacity: 0.9 },
  pct: { fontSize: 12, fontWeight: '700', width: 48, textAlign: 'right' },
  bytes: { color: Colors.textMuted, fontSize: 11, fontWeight: '500', width: 40, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  totalLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
  totalValue: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Shared states
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <View style={sharedStyles.center}>
      <Text style={sharedStyles.emptyText}>{message}</Text>
    </View>
  );
}

const sharedStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface InsightsData {
  dependencies: DependenciesResponse | null;
  contributors: ContributorsResponse | null;
  stats: StatsResponse | null;
}

export default function InsightsScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('dependencies');
  const [data, setData] = useState<InsightsData>({
    dependencies: null,
    contributors: null,
    stats: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!owner || !name) return;
    setError(null);

    const base = `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    try {
      const [dependencies, contributors, stats] = await Promise.all([
        apiClient<DependenciesResponse>(`${base}/dependencies`),
        apiClient<ContributorsResponse>(`${base}/contributors`),
        apiClient<StatsResponse>(`${base}/stats`),
      ]);
      setData({ dependencies, contributors, stats });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [owner, name]);

  useEffect(() => {
    setLoading(true);
    fetchInsights();
  }, [fetchInsights]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInsights();
    setRefreshing(false);
  }, [fetchInsights]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    fetchInsights();
  }, [fetchInsights]);

  const handleProfile = useCallback(
    (username: string) => {
      router.push(`/profile/${encodeURIComponent(username)}` as never);
    },
    [router],
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dependencies':
        return data.dependencies ? (
          <DepsTab data={data.dependencies} />
        ) : (
          <EmptyState message="No dependencies found" />
        );
      case 'contributors':
        return data.contributors ? (
          <ContributorsTab data={data.contributors} onProfile={handleProfile} />
        ) : (
          <EmptyState message="No contributors found" />
        );
      case 'activity':
        return data.stats ? (
          <ActivityTab data={data.stats} />
        ) : (
          <EmptyState message="No activity data" />
        );
      case 'languages':
        return data.stats ? (
          <LanguagesTab data={data.stats} />
        ) : (
          <EmptyState message="No language data" />
        );
    }
  };

  return (
    <SafeAreaView style={mainStyles.safeArea}>
      {/* Header */}
      <View style={mainStyles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={mainStyles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Text style={mainStyles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <View style={mainStyles.titleBlock}>
          <Text style={mainStyles.title} numberOfLines={1}>
            {owner}/{name}
          </Text>
          <Text style={mainStyles.subtitle}>Insights</Text>
        </View>

        <View style={mainStyles.backBtn} />
      </View>

      {/* Tab bar */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* Content */}
      {loading ? (
        <View style={sharedStyles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={sharedStyles.center}>
          <Text style={mainStyles.errorText}>{error}</Text>
          <Pressable onPress={handleRetry} style={mainStyles.retryBtn} accessibilityRole="button">
            <Text style={mainStyles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={mainStyles.scroll}
          contentContainerStyle={mainStyles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderActiveTab()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const mainStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backIcon: { color: Colors.primaryLight, fontSize: 32, lineHeight: 36, fontWeight: '300' },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  subtitle: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
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
