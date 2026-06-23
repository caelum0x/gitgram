import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Image,
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
  diffAdded: '#1a2e1a',
  diffAddedText: '#4ade80',
  diffRemoved: '#2e1a1a',
  diffRemovedText: '#f87171',
  diffContext: '#0F0F1A',
  diffContextText: '#94A3B8',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  lineNumberOld?: number;
  lineNumberNew?: number;
}

type FileChangeType = 'modified' | 'added' | 'deleted' | 'renamed';

interface FileDiff {
  filename: string;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

interface CommitDetail {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorAvatarUrl?: string | null;
  committedAt: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  parentShas: string[];
  htmlUrl: string;
  files: FileDiff[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function changeTypeBadgeProps(type: FileChangeType): { label: string; bg: string; color: string } {
  const map: Record<FileChangeType, { label: string; bg: string; color: string }> = {
    modified: { label: 'M', bg: '#1e2d4a', color: '#60a5fa' },
    added:    { label: 'A', bg: '#1a2e1a', color: '#4ade80' },
    deleted:  { label: 'D', bg: '#2e1a1a', color: '#f87171' },
    renamed:  { label: 'R', bg: '#2e2a1a', color: '#fbbf24' },
  };
  return map[type] ?? map.modified;
}

function fileTabLabel(filename: string): string {
  const parts = filename.split('/');
  return parts[parts.length - 1] ?? filename;
}

// ---------------------------------------------------------------------------
// Diff line row
// ---------------------------------------------------------------------------

interface DiffLineRowProps {
  line: DiffLine;
}

function DiffLineRow({ line }: DiffLineRowProps) {
  const bgColor =
    line.type === 'added'
      ? Colors.diffAdded
      : line.type === 'removed'
      ? Colors.diffRemoved
      : Colors.diffContext;

  const textColor =
    line.type === 'added'
      ? Colors.diffAddedText
      : line.type === 'removed'
      ? Colors.diffRemovedText
      : Colors.diffContextText;

  const prefix =
    line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

  return (
    <View style={[diffLineStyles.row, { backgroundColor: bgColor }]}>
      <Text style={[diffLineStyles.lineNum, { color: Colors.textMuted }]}>
        {line.lineNumberOld != null ? String(line.lineNumberOld).padStart(4) : '    '}
      </Text>
      <Text style={[diffLineStyles.lineNum, { color: Colors.textMuted }]}>
        {line.lineNumberNew != null ? String(line.lineNumberNew).padStart(4) : '    '}
      </Text>
      <Text style={[diffLineStyles.prefix, { color: textColor }]}>{prefix}</Text>
      <Text style={[diffLineStyles.content, { color: textColor }]} selectable>
        {line.content}
      </Text>
    </View>
  );
}

const diffLineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingRight: 8,
    minHeight: 20,
  },
  lineNum: {
    fontFamily: 'monospace',
    fontSize: 11,
    paddingHorizontal: 4,
    minWidth: 36,
    textAlign: 'right',
    opacity: 0.6,
  },
  prefix: {
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 4,
    width: 16,
  },
  content: {
    fontFamily: 'monospace',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});

// ---------------------------------------------------------------------------
// File diff section
// ---------------------------------------------------------------------------

interface FileDiffSectionProps {
  file: FileDiff;
}

function FileDiffSection({ file }: FileDiffSectionProps) {
  const badge = changeTypeBadgeProps(file.changeType);

  return (
    <View style={fileDiffStyles.container}>
      {/* File header */}
      <View style={fileDiffStyles.header}>
        <View style={[fileDiffStyles.typeBadge, { backgroundColor: badge.bg }]}>
          <Text style={[fileDiffStyles.typeBadgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
        <Text style={fileDiffStyles.filename} numberOfLines={1} selectable>
          {file.filename}
        </Text>
        <View style={fileDiffStyles.statBadges}>
          {file.additions > 0 && (
            <Text style={fileDiffStyles.addStat}>+{file.additions}</Text>
          )}
          {file.deletions > 0 && (
            <Text style={fileDiffStyles.delStat}>-{file.deletions}</Text>
          )}
        </View>
      </View>

      {/* Diff lines (horizontal scroll for long lines) */}
      {file.lines.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={fileDiffStyles.linesContainer}>
            {file.lines.map((line, idx) => (
              <DiffLineRow key={idx} line={line} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={fileDiffStyles.noPreview}>Binary file or no preview available</Text>
      )}
    </View>
  );
}

const fileDiffStyles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  typeBadge: {
    width: 22,
    height: 22,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontWeight: '800',
    fontSize: 12,
  },
  filename: {
    flex: 1,
    color: Colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  statBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  addStat: {
    color: Colors.diffAddedText,
    fontSize: 12,
    fontWeight: '600',
  },
  delStat: {
    color: Colors.diffRemovedText,
    fontSize: 12,
    fontWeight: '600',
  },
  linesContainer: {
    minWidth: '100%',
  },
  noPreview: {
    color: Colors.textMuted,
    fontSize: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

interface StatsBarProps {
  filesChanged: number;
  additions: number;
  deletions: number;
}

function StatsBar({ filesChanged, additions, deletions }: StatsBarProps) {
  return (
    <View style={statsBarStyles.container}>
      <View style={statsBarStyles.item}>
        <Text style={statsBarStyles.itemValue}>{filesChanged}</Text>
        <Text style={statsBarStyles.itemLabel}>files changed</Text>
      </View>
      <View style={statsBarStyles.divider} />
      <View style={statsBarStyles.item}>
        <Text style={[statsBarStyles.itemValue, { color: Colors.diffAddedText }]}>
          +{additions}
        </Text>
        <Text style={statsBarStyles.itemLabel}>insertions</Text>
      </View>
      <View style={statsBarStyles.divider} />
      <View style={statsBarStyles.item}>
        <Text style={[statsBarStyles.itemValue, { color: Colors.diffRemovedText }]}>
          -{deletions}
        </Text>
        <Text style={statsBarStyles.itemLabel}>deletions</Text>
      </View>
    </View>
  );
}

const statsBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  item: {
    alignItems: 'center',
    gap: 2,
  },
  itemValue: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  itemLabel: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
});

// ---------------------------------------------------------------------------
// File tabs
// ---------------------------------------------------------------------------

interface FileTabsProps {
  files: FileDiff[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function FileTabs({ files, activeIndex, onSelect }: FileTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={fileTabsStyles.scroll}
      contentContainerStyle={fileTabsStyles.content}
    >
      {files.map((file, idx) => {
        const isActive = idx === activeIndex;
        const badge = changeTypeBadgeProps(file.changeType);
        return (
          <Pressable
            key={file.filename}
            onPress={() => onSelect(idx)}
            style={[fileTabsStyles.tab, isActive && fileTabsStyles.tabActive]}
          >
            <View style={[fileTabsStyles.dot, { backgroundColor: badge.color }]} />
            <Text
              style={[fileTabsStyles.label, isActive && fileTabsStyles.labelActive]}
              numberOfLines={1}
            >
              {fileTabLabel(file.filename)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const fileTabsStyles = StyleSheet.create({
  scroll: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    maxHeight: 44,
  },
  content: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    gap: 5,
    maxWidth: 160,
  },
  tabActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDark,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  labelActive: {
    color: Colors.white,
  },
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CommitSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.shaLine} />
      <View style={skeletonStyles.messageLine} />
      <View style={skeletonStyles.messageLine2} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={skeletonStyles.statBlock} />
        ))}
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: { padding: 16 },
  shaLine: {
    width: 100,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 12,
  },
  messageLine: {
    width: '90%',
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  messageLine2: {
    width: '65%',
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    marginBottom: 8,
  },
  statBlock: {
    width: 80,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CommitDetailScreen() {
  const { owner, name, sha } = useLocalSearchParams<{
    owner: string;
    name: string;
    sha: string;
  }>();
  const router = useRouter();

  const [commit, setCommit] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [shacopied, setShaCopied] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const fileScrollRef = useRef<ScrollView>(null);
  const fileSectionRefs = useRef<number[]>([]);

  const fetchCommit = useCallback(async () => {
    if (!owner || !name || !sha) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<CommitDetail>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(sha)}`,
      );
      setCommit(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load commit');
    } finally {
      setLoading(false);
    }
  }, [owner, name, sha]);

  useEffect(() => { fetchCommit(); }, [fetchCommit]);

  const handleCopySha = useCallback(() => {
    if (!sha) return;
    Clipboard.setString(sha);
    setShaCopied(true);
    setTimeout(() => setShaCopied(false), 2000);
  }, [sha]);

  const handleOpenGitHub = useCallback(() => {
    if (!commit?.htmlUrl) return;
    Linking.openURL(commit.htmlUrl).catch(() => undefined);
  }, [commit?.htmlUrl]);

  const handleNavigateParent = useCallback((parentSha: string) => {
    if (!owner || !name) return;
    router.push(
      `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commit/${encodeURIComponent(parentSha)}` as never,
    );
  }, [owner, name, router]);

  const handleFileTabSelect = useCallback((index: number) => {
    setActiveFileIndex(index);
    const yOffset = fileSectionRefs.current[index];
    if (yOffset != null && fileScrollRef.current) {
      fileScrollRef.current.scrollTo({ y: yOffset, animated: true });
    }
  }, []);

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
          {sha ? shortSha(sha) : 'Commit'}
        </Text>

        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={handleCopySha}
            style={styles.navActionBtn}
            accessibilityLabel="Copy full SHA"
            activeOpacity={0.7}
          >
            <Text style={[styles.navActionText, shacopied && styles.navActionTextSuccess]}>
              {shacopied ? '✓' : '⎘'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenGitHub}
            style={styles.navActionBtn}
            accessibilityLabel="View on GitHub"
            activeOpacity={0.7}
          >
            <Text style={styles.navActionText}>{'⎋'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !commit ? (
        <CommitSkeleton />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={fetchCommit} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : commit ? (
        <ScrollView
          ref={fileScrollRef}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* SHA row + copy button */}
          <View style={styles.shaRow}>
            <Text style={styles.shaText} selectable>{shortSha(commit.sha)}</Text>
            <Text style={styles.shaFull} selectable numberOfLines={1}>{commit.sha}</Text>
            <TouchableOpacity
              onPress={handleCopySha}
              style={[styles.copyBtn, shacopied && styles.copyBtnSuccess]}
              activeOpacity={0.8}
            >
              <Text style={[styles.copyBtnText, shacopied && styles.copyBtnTextSuccess]}>
                {shacopied ? 'Copied!' : 'Copy SHA'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Author info */}
          <View style={styles.authorSection}>
            {commit.authorAvatarUrl && !avatarFailed ? (
              <Image
                source={{ uri: commit.authorAvatarUrl }}
                style={styles.avatar}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {(commit.authorName[0] ?? '?').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{commit.authorName}</Text>
              <Text style={styles.authorEmail} selectable numberOfLines={1}>
                {commit.authorEmail}
              </Text>
              <Text style={styles.authorDate}>{formatDate(commit.committedAt)}</Text>
            </View>
          </View>

          {/* Commit message */}
          <View style={styles.messageSection}>
            <Text style={styles.messageText} selectable>{commit.message}</Text>
          </View>

          {/* Stats bar */}
          <StatsBar
            filesChanged={commit.filesChanged}
            additions={commit.additions}
            deletions={commit.deletions}
          />

          {/* File tabs */}
          {commit.files.length > 0 && (
            <FileTabs
              files={commit.files}
              activeIndex={activeFileIndex}
              onSelect={handleFileTabSelect}
            />
          )}

          {/* Diff sections */}
          <View style={styles.diffsContainer}>
            {commit.files.length === 0 ? (
              <Text style={styles.emptyText}>No file changes in this commit</Text>
            ) : (
              commit.files.map((file, idx) => (
                <View
                  key={file.filename}
                  onLayout={(e) => {
                    fileSectionRefs.current[idx] = e.nativeEvent.layout.y;
                  }}
                >
                  <FileDiffSection file={file} />
                </View>
              ))
            )}
          </View>

          {/* Parent commit link */}
          {commit.parentShas.length > 0 && (
            <View style={styles.parentSection}>
              <Text style={styles.parentLabel}>Parent commit{commit.parentShas.length > 1 ? 's' : ''}</Text>
              {commit.parentShas.map((parentSha) => (
                <TouchableOpacity
                  key={parentSha}
                  onPress={() => handleNavigateParent(parentSha)}
                  style={styles.parentRow}
                  activeOpacity={0.7}
                >
                  <Text style={styles.parentSha}>{shortSha(parentSha)}</Text>
                  <Text style={styles.parentFullSha} numberOfLines={1}>{parentSha}</Text>
                  <Text style={styles.parentChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* View on GitHub button */}
          <View style={styles.githubBtnContainer}>
            <TouchableOpacity
              style={styles.githubBtn}
              onPress={handleOpenGitHub}
              activeOpacity={0.8}
            >
              <Text style={styles.githubBtnIcon}>{'⎋'}</Text>
              <Text style={styles.githubBtnText}>View on GitHub</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : null}
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
    letterSpacing: 0.5,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  navActionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navActionText: {
    color: Colors.textSecondary,
    fontSize: 18,
  },
  navActionTextSuccess: {
    color: Colors.success,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  // SHA row
  shaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
    flexWrap: 'wrap',
  },
  shaText: {
    color: Colors.primaryLight,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 16,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shaFull: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  copyBtnSuccess: {
    borderColor: Colors.success,
    backgroundColor: '#0D2B22',
  },
  copyBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  copyBtnTextSuccess: {
    color: Colors.success,
  },

  // Author section
  authorSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceElevated,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  authorEmail: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  authorDate: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Commit message
  messageSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  messageText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
  },

  // Diffs container
  diffsContainer: {
    paddingTop: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
  },

  // Parent section
  parentSection: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  parentLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  parentSha: {
    color: Colors.primaryLight,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  parentFullSha: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  parentChevron: {
    color: Colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
  },

  // GitHub button
  githubBtnContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
