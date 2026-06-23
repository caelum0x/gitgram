import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  elevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSec: '#94A3B8',
  textMuted: '#64748B',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  success: '#34D399',
  successBg: '#0D2B22',
  warning: '#FBBF24',
  warningBg: '#2B2000',
  error: '#F87171',
  errorBg: '#2B0D0D',
  white: '#FFFFFF',
  code: '#1E1E38',
  codeBorder: '#2D2D50',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReleaseAsset {
  id: string;
  name: string;
  contentType: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  createdAt: string;
}

interface ReleaseDetail {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  isPrerelease: boolean;
  isDraft: boolean;
  authorUsername: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  downloadCount: number;
  assets: ReleaseAsset[];
  zipballUrl: string | null;
  tarballUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function assetIcon(contentType: string, name: string): string {
  if (name.endsWith('.zip') || name.endsWith('.gz') || name.endsWith('.tar')) return '🗜';
  if (name.endsWith('.dmg') || name.endsWith('.pkg')) return '💿';
  if (name.endsWith('.exe') || name.endsWith('.msi')) return '🖥';
  if (name.endsWith('.apk') || name.endsWith('.aab')) return '🤖';
  if (name.endsWith('.ipa')) return '📱';
  if (contentType.startsWith('image/')) return '🖼';
  if (contentType.includes('json') || contentType.includes('text')) return '📄';
  return '📦';
}

async function openUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

interface TypeBadgeProps {
  isPrerelease: boolean;
  isDraft: boolean;
}

function TypeBadge({ isPrerelease, isDraft }: TypeBadgeProps) {
  if (isDraft) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.draft]}>
        <Text style={[badgeStyles.text, badgeStyles.draftText]}>Draft</Text>
      </View>
    );
  }
  if (isPrerelease) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.pre]}>
        <Text style={[badgeStyles.text, badgeStyles.preText]}>Pre-release</Text>
      </View>
    );
  }
  return (
    <View style={[badgeStyles.badge, badgeStyles.stable]}>
      <Text style={[badgeStyles.text, badgeStyles.stableText]}>Latest</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '700' },
  stable: { backgroundColor: C.successBg, borderColor: C.success },
  stableText: { color: C.success },
  pre: { backgroundColor: C.warningBg, borderColor: C.warning },
  preText: { color: C.warning },
  draft: { backgroundColor: C.elevated, borderColor: C.border },
  draftText: { color: C.textMuted },
});

// ---------------------------------------------------------------------------
// Markdown-like body renderer
// (Renders headings, code blocks, bullet points as styled Text nodes)
// ---------------------------------------------------------------------------

interface MarkdownProps {
  body: string;
}

function MarkdownBody({ body }: MarkdownProps) {
  const lines = body.split('\n');

  return (
    <View style={mdStyles.container}>
      {lines.map((line, idx) => {
        // H1 / H2 / H3
        const h3 = line.match(/^###\s+(.*)/);
        const h2 = line.match(/^##\s+(.*)/);
        const h1 = line.match(/^#\s+(.*)/);
        // Bullet
        const bullet = line.match(/^[-*]\s+(.*)/);
        // Numbered list
        const numbered = line.match(/^(\d+)\.\s+(.*)/);
        // Code block delimiter
        const code = line.startsWith('```');
        // Horizontal rule
        const hr = /^---+$/.test(line.trim());

        if (h1) {
          return (
            <Text key={idx} style={mdStyles.h1}>
              {h1[1]}
            </Text>
          );
        }
        if (h2) {
          return (
            <Text key={idx} style={mdStyles.h2}>
              {h2[1]}
            </Text>
          );
        }
        if (h3) {
          return (
            <Text key={idx} style={mdStyles.h3}>
              {h3[1]}
            </Text>
          );
        }
        if (bullet) {
          return (
            <View key={idx} style={mdStyles.bulletRow}>
              <Text style={mdStyles.bulletDot}>•</Text>
              <Text style={mdStyles.bulletText}>{stripInline(bullet[1])}</Text>
            </View>
          );
        }
        if (numbered) {
          return (
            <View key={idx} style={mdStyles.bulletRow}>
              <Text style={mdStyles.bulletDot}>{numbered[1]}.</Text>
              <Text style={mdStyles.bulletText}>{stripInline(numbered[2])}</Text>
            </View>
          );
        }
        if (code) {
          return <View key={idx} style={mdStyles.codeDivider} />;
        }
        if (hr) {
          return <View key={idx} style={mdStyles.hr} />;
        }
        if (line.trim() === '') {
          return <View key={idx} style={mdStyles.spacer} />;
        }

        // Normal paragraph line
        return (
          <Text key={idx} style={mdStyles.para}>
            {stripInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

function stripInline(text: string): string {
  // Remove bold/italic markers, keep text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

const mdStyles = StyleSheet.create({
  container: { gap: 2 },
  h1: { color: C.text, fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 4, lineHeight: 26 },
  h2: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 4, lineHeight: 22 },
  h3: { color: C.textSec, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 2, lineHeight: 20 },
  para: { color: C.textSec, fontSize: 14, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 2 },
  bulletDot: { color: C.primaryLight, fontSize: 14, lineHeight: 21, width: 16, flexShrink: 0 },
  bulletText: { color: C.textSec, fontSize: 14, lineHeight: 21, flex: 1 },
  codeDivider: { height: 1, backgroundColor: C.codeBorder, marginVertical: 6 },
  hr: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  spacer: { height: 6 },
});

// ---------------------------------------------------------------------------
// Asset row
// ---------------------------------------------------------------------------

interface AssetRowProps {
  asset: ReleaseAsset;
}

function AssetRow({ asset }: AssetRowProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await openUrl(asset.downloadUrl);
    } finally {
      setDownloading(false);
    }
  }, [asset.downloadUrl]);

  return (
    <View style={assetStyles.row}>
      {/* Icon + info */}
      <View style={assetStyles.info}>
        <Text style={assetStyles.icon}>{assetIcon(asset.contentType, asset.name)}</Text>
        <View style={assetStyles.textCol}>
          <Text style={assetStyles.name} numberOfLines={2}>
            {asset.name}
          </Text>
          <View style={assetStyles.metaRow}>
            <Text style={assetStyles.meta}>{formatBytes(asset.size)}</Text>
            {asset.downloadCount > 0 && (
              <Text style={assetStyles.meta}>
                ⬇ {formatDownloads(asset.downloadCount)}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Download button */}
      <TouchableOpacity
        style={[assetStyles.dlBtn, downloading && assetStyles.dlBtnDisabled]}
        onPress={handleDownload}
        disabled={downloading}
        activeOpacity={0.75}
        accessibilityLabel={`Download ${asset.name}`}
      >
        {downloading ? (
          <ActivityIndicator size="small" color={C.white} />
        ) : (
          <Text style={assetStyles.dlBtnText}>⬇</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const assetStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 22, width: 28, textAlign: 'center', flexShrink: 0 },
  textCol: { flex: 1, gap: 4 },
  name: { color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { color: C.textMuted, fontSize: 11 },
  dlBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  dlBtnDisabled: { backgroundColor: C.primaryDark, opacity: 0.6 },
  dlBtnText: { color: C.white, fontSize: 15 },
});

// ---------------------------------------------------------------------------
// Source code download row
// ---------------------------------------------------------------------------

interface SourceRowProps {
  label: string;
  icon: string;
  url: string;
}

function SourceRow({ label, icon, url }: SourceRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [sourceStyles.row, pressed && sourceStyles.rowPressed]}
      onPress={() => openUrl(url)}
      accessibilityRole="button"
      accessibilityLabel={`Download source code as ${label}`}
    >
      <Text style={sourceStyles.icon}>{icon}</Text>
      <Text style={sourceStyles.label}>{label}</Text>
      <Text style={sourceStyles.chevron}>›</Text>
    </Pressable>
  );
}

const sourceStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
    backgroundColor: C.bg,
  },
  rowPressed: { backgroundColor: C.surface },
  icon: { fontSize: 18, width: 28, textAlign: 'center' },
  label: { flex: 1, color: C.text, fontSize: 14 },
  chevron: { color: C.textMuted, fontSize: 22 },
});

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.headerRow}>
        <Text style={cardStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.elevated,
  },
  title: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ReleaseDetailScreen() {
  const { owner, name, tag } = useLocalSearchParams<{
    owner: string;
    name: string;
    tag: string;
  }>();
  const router = useRouter();

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelease = useCallback(async () => {
    if (!owner || !name || !tag) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<ReleaseDetail>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(tag)}`,
      );
      setRelease(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load release');
    } finally {
      setLoading(false);
    }
  }, [owner, name, tag]);

  useEffect(() => {
    fetchRelease();
  }, [fetchRelease]);

  const publishDate = release?.publishedAt ?? release?.createdAt;

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
          <Text style={styles.navSubtitle} numberOfLines={1}>
            {tag}
          </Text>
        </View>

        {/* Spacer to balance back button */}
        <View style={styles.backBtn} />
      </View>

      {/* Loading state */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={fetchRelease} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : release ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero card ── */}
          <View style={styles.heroCard}>
            {/* Tag + type badge */}
            <View style={styles.heroTagRow}>
              <Text style={styles.heroTagIcon}>🔖</Text>
              <Text style={styles.heroTag}>{release.tagName}</Text>
              <TypeBadge isPrerelease={release.isPrerelease} isDraft={release.isDraft} />
            </View>

            {/* Release title */}
            {release.name ? (
              <Text style={styles.heroTitle}>{release.name}</Text>
            ) : null}

            {/* Author + date */}
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaText}>
                by{' '}
                <Text style={styles.heroMetaAuthor}>{release.authorUsername}</Text>
              </Text>
              {publishDate ? (
                <Text style={styles.heroMetaText}>
                  {' '}· {formatDate(publishDate)}
                </Text>
              ) : null}
            </View>

            {/* Download total */}
            {release.downloadCount > 0 && (
              <View style={styles.dlTotalChip}>
                <Text style={styles.dlTotalIcon}>⬇</Text>
                <Text style={styles.dlTotalText}>
                  {formatDownloads(release.downloadCount)} total downloads
                </Text>
              </View>
            )}
          </View>

          {/* ── Changelog ── */}
          {release.body ? (
            <SectionCard title="Changelog">
              <View style={styles.changelogPad}>
                <MarkdownBody body={release.body} />
              </View>
            </SectionCard>
          ) : null}

          {/* ── Assets ── */}
          {release.assets.length > 0 ? (
            <SectionCard title={`Assets (${release.assets.length})`}>
              {release.assets.map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </SectionCard>
          ) : null}

          {/* ── Source code ── */}
          {(release.zipballUrl || release.tarballUrl) && (
            <SectionCard title="Source code">
              {release.zipballUrl && (
                <SourceRow
                  label="Download ZIP"
                  icon="🗜"
                  url={release.zipballUrl}
                />
              )}
              {release.tarballUrl && (
                <SourceRow
                  label="Download tar.gz"
                  icon="📦"
                  url={release.tarballUrl}
                />
              )}
            </SectionCard>
          )}

          {/* bottom padding */}
          <View style={styles.bottomPad} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },

  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: C.primaryLight,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '300',
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  navSubtitle: { color: C.textMuted, fontSize: 11, marginTop: 1 },

  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 20 },
  retryText: { color: C.white, fontWeight: '700', fontSize: 14 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Hero card
  heroCard: {
    margin: 16,
    padding: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.primary,
    gap: 10,
  },
  heroTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroTagIcon: { fontSize: 16 },
  heroTag: {
    color: C.primaryLight,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  heroTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  heroMetaText: { color: C.textMuted, fontSize: 13 },
  heroMetaAuthor: { color: C.textSec, fontWeight: '600' },
  dlTotalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.elevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  dlTotalIcon: { fontSize: 12 },
  dlTotalText: { color: C.textSec, fontSize: 13 },

  changelogPad: { padding: 16 },

  bottomPad: { height: 24 },
});
