import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  error: '#F87171',
  white: '#FFFFFF',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  path: string;
  itemCount?: number;
  lastModified?: string;
}

interface FilesResponse {
  files: FileEntry[];
}

type BreadcrumbSegment = { label: string; path: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    sql: '🗃', toml: '⚙', ini: '⚙', cfg: '⚙',
    xml: '📋', csv: '📊', pdf: '📕', zip: '📦',
  };
  return map[ext] ?? '📄';
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildBreadcrumbs(owner: string, repo: string, dirPath: string): BreadcrumbSegment[] {
  const root: BreadcrumbSegment = { label: `${owner}/${repo}`, path: '' };
  if (!dirPath) return [root];
  const parts = dirPath.split('/').filter(Boolean);
  const segments: BreadcrumbSegment[] = [root];
  let accumulated = '';
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    segments.push({ label: part, path: accumulated });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Breadcrumb component
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (path: string) => void;
}

function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  return (
    <View style={breadcrumbStyles.container}>
      {segments.map((seg, index) => {
        const isLast = index === segments.length - 1;
        return (
          <View key={seg.path} style={breadcrumbStyles.segment}>
            <TouchableOpacity
              onPress={() => !isLast && onNavigate(seg.path)}
              disabled={isLast}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text
                style={[
                  breadcrumbStyles.label,
                  isLast ? breadcrumbStyles.labelActive : breadcrumbStyles.labelLink,
                ]}
                numberOfLines={1}
              >
                {seg.label}
              </Text>
            </TouchableOpacity>
            {!isLast && (
              <Text style={breadcrumbStyles.separator}>/</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const breadcrumbStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: 'monospace',
    maxWidth: 120,
  },
  labelLink: {
    color: Colors.primaryLight,
    textDecorationLine: 'underline',
  },
  labelActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  separator: {
    color: Colors.textMuted,
    fontSize: 13,
    marginHorizontal: 4,
  },
});

// ---------------------------------------------------------------------------
// File row component
// ---------------------------------------------------------------------------

interface FileRowProps {
  entry: FileEntry;
  onPress: (entry: FileEntry) => void;
}

function FileRow({ entry, onPress }: FileRowProps) {
  const isDir = entry.type === 'dir';

  return (
    <TouchableOpacity
      style={rowStyles.container}
      onPress={() => onPress(entry)}
      activeOpacity={0.7}
      accessibilityLabel={`${isDir ? 'Directory' : 'File'}: ${entry.name}`}
    >
      <Text style={rowStyles.icon}>{fileIcon(entry)}</Text>

      <View style={rowStyles.info}>
        <Text style={[rowStyles.name, isDir && rowStyles.dirName]} numberOfLines={1}>
          {entry.name}
        </Text>
        <View style={rowStyles.meta}>
          {isDir ? (
            entry.itemCount !== undefined ? (
              <Text style={rowStyles.metaText}>{entry.itemCount} items</Text>
            ) : null
          ) : (
            <>
              {entry.size !== undefined && (
                <Text style={rowStyles.metaText}>{formatSize(entry.size)}</Text>
              )}
              {entry.size !== undefined && entry.lastModified && (
                <Text style={rowStyles.metaDot}>·</Text>
              )}
              {entry.lastModified && (
                <Text style={rowStyles.metaText}>{timeAgo(entry.lastModified)}</Text>
              )}
            </>
          )}
        </View>
      </View>

      {isDir && <Text style={rowStyles.chevron}>{'›'}</Text>}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  icon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  info: { flex: 1 },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  dirName: {
    color: Colors.primaryLight,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  metaDot: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '300',
  },
});

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
}

function SearchBar({ value, onChangeText, onClose }: SearchBarProps) {
  return (
    <View style={searchStyles.container}>
      <Text style={searchStyles.icon}>🔍</Text>
      <TextInput
        style={searchStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Filter files..."
        placeholderTextColor={Colors.textMuted}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={searchStyles.closeBtn}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const searchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  icon: { fontSize: 14 },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  closeBtn: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function FileBrowserScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [dirPath, setDirPath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const breadcrumbs = buildBreadcrumbs(owner ?? '', name ?? '', dirPath);

  // ---------------------------------------------------------------------------
  // Fetch directory listing
  // ---------------------------------------------------------------------------
  const fetchFiles = useCallback(async (path: string) => {
    if (!owner || !name) return;
    setLoading(true);
    setError(null);
    try {
      const encodedPath = path ? encodeURIComponent(path) : '';
      const url = encodedPath
        ? `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/files?path=${encodedPath}`
        : `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/files`;
      const data = await apiClient<FilesResponse>(url);
      const sorted = [...(data.files ?? [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [owner, name]);

  useEffect(() => {
    fetchFiles(dirPath);
  }, [dirPath, fetchFiles]);

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------
  const handleEntryPress = useCallback((entry: FileEntry) => {
    if (entry.type === 'dir') {
      setDirPath(entry.path);
      setSearchQuery('');
      setSearchVisible(false);
    } else {
      router.push(
        `/repo/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(name ?? '')}/file?path=${encodeURIComponent(entry.path)}` as never,
      );
    }
  }, [owner, name, router]);

  const handleBreadcrumbNavigate = useCallback((path: string) => {
    setDirPath(path);
    setSearchQuery('');
    setSearchVisible(false);
  }, []);

  const handleBack = useCallback(() => {
    if (dirPath) {
      const parts = dirPath.split('/').filter(Boolean);
      parts.pop();
      setDirPath(parts.join('/'));
      setSearchQuery('');
    } else {
      router.back();
    }
  }, [dirPath, router]);

  const toggleSearch = useCallback(() => {
    setSearchVisible((v) => !v);
    setSearchQuery('');
  }, []);

  // ---------------------------------------------------------------------------
  // Filtered file list
  // ---------------------------------------------------------------------------
  const filteredFiles = searchQuery.trim()
    ? files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : files;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={dirPath ? 'Go up one directory' : 'Go back'}
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          Files
        </Text>

        <TouchableOpacity
          onPress={toggleSearch}
          style={styles.searchBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Search files"
        >
          <Text style={[styles.searchIcon, searchVisible && styles.searchIconActive]}>
            🔍
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar (conditionally shown) */}
      {searchVisible && (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClose={toggleSearch}
        />
      )}

      {/* Breadcrumb */}
      <Breadcrumb
        segments={breadcrumbs}
        onNavigate={handleBreadcrumbNavigate}
      />

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => fetchFiles(dirPath)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<FileEntry>
          data={filteredFiles}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <FileRow entry={item} onPress={handleEntryPress} />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching files' : 'This directory is empty'}
            </Text>
          }
          contentContainerStyle={filteredFiles.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
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
  searchBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchIcon: {
    fontSize: 18,
    opacity: 0.7,
  },
  searchIconActive: {
    opacity: 1,
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
