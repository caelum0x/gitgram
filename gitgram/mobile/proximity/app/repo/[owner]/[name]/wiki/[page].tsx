import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { apiClient } from '../../../../../services/gitgramApi';

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
  codeBg: '#161625',
  codeText: '#A78BFA',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WikiPageDetail {
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  isCollaborator: boolean;
  prevPage: { slug: string; title: string } | null;
  nextPage: { slug: string; title: string } | null;
}

interface TocEntry {
  level: number;
  text: string;
  anchor: string;
}

// ---------------------------------------------------------------------------
// Extract table-of-contents from markdown
// ---------------------------------------------------------------------------

function extractToc(content: string): TocEntry[] {
  const toc: TocEntry[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      toc.push({
        level: match[1].length,
        text: match[2],
        anchor: match[2].toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
      });
    }
  }
  return toc;
}

// ---------------------------------------------------------------------------
// Markdown renderer (same logic as wiki index, self-contained here)
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  content: string;
  owner: string;
  repoName: string;
}

function MarkdownRenderer({ content, owner, repoName }: MarkdownRendererProps) {
  const router = useRouter();

  const handleLink = useCallback(
    (href: string) => {
      if (href.startsWith('http://') || href.startsWith('https://')) {
        Linking.openURL(href).catch(() => {
          // silently ignore
        });
      } else {
        const slug = href.replace(/^\/wiki\/?/, '').replace(/\.md$/, '');
        router.push(`/repo/${owner}/${repoName}/wiki/${slug}`);
      }
    },
    [owner, repoName, router],
  );

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  const nextKey = () => {
    keyCounter += 1;
    return keyCounter;
  };

  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const pattern =
      /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) {
        parts.push(
          <Text key={`plain-${match.index}`} style={styles.paragraph}>
            {text.slice(last, match.index)}
          </Text>,
        );
      }

      if (match[1] !== undefined) {
        parts.push(
          <Image
            key={`img-${match.index}`}
            source={{ uri: match[2] }}
            style={styles.mdImage}
            resizeMode="contain"
            accessibilityLabel={match[1] || 'image'}
          />,
        );
      } else if (match[3] !== undefined) {
        const href = match[4];
        parts.push(
          <Text key={`link-${match.index}`} style={styles.mdLink} onPress={() => handleLink(href)}>
            {match[3]}
          </Text>,
        );
      } else if (match[5] !== undefined) {
        parts.push(
          <Text key={`code-${match.index}`} style={styles.inlineCode}>
            {match[5]}
          </Text>,
        );
      } else if (match[6] !== undefined) {
        parts.push(
          <Text key={`bold-${match.index}`} style={styles.bold}>
            {match[6]}
          </Text>,
        );
      } else if (match[7] !== undefined) {
        parts.push(
          <Text key={`italic-${match.index}`} style={styles.italic}>
            {match[7]}
          </Text>,
        );
      }

      last = match.index + match[0].length;
    }

    if (last < text.length) {
      parts.push(
        <Text key={`plain-end-${last}`} style={styles.paragraph}>
          {text.slice(last)}
        </Text>,
      );
    }

    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'code';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      elements.push(
        <View key={nextKey()} style={styles.codeBlock}>
          <View style={styles.codeLangBar}>
            <Text style={styles.codeLang}>{lang}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeText}>{codeLines.join('\n')}</Text>
          </ScrollView>
        </View>,
      );
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const hStyles = [styles.h1, styles.h2, styles.h3, styles.h4, styles.h5, styles.h6];
      elements.push(
        <Text key={nextKey()} style={hStyles[level - 1]}>
          {headingMatch[2]}
        </Text>,
      );
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<View key={nextKey()} style={styles.hr} />);
      i += 1;
      continue;
    }

    const listMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      elements.push(
        <View key={nextKey()} style={[styles.listItem, { marginLeft: indent * 8 + 8 }]}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>{renderInline(listMatch[2])}</Text>
        </View>,
      );
      i += 1;
      continue;
    }

    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      elements.push(
        <View key={nextKey()} style={[styles.listItem, { marginLeft: indent * 8 + 8 }]}>
          <Text style={styles.listBullet}>›</Text>
          <Text style={styles.listText}>{renderInline(orderedMatch[2])}</Text>
        </View>,
      );
      i += 1;
      continue;
    }

    const bqMatch = line.match(/^>\s*(.*)$/);
    if (bqMatch) {
      elements.push(
        <View key={nextKey()} style={styles.blockquote}>
          <Text style={styles.blockquoteText}>{renderInline(bqMatch[1])}</Text>
        </View>,
      );
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      elements.push(<View key={nextKey()} style={styles.spacer} />);
      i += 1;
      continue;
    }

    elements.push(
      <Text key={nextKey()} style={styles.paragraph}>
        {renderInline(line)}
      </Text>,
    );
    i += 1;
  }

  return <View>{elements}</View>;
}

// ---------------------------------------------------------------------------
// TOC bottom sheet
// ---------------------------------------------------------------------------

interface TocBottomSheetProps {
  visible: boolean;
  toc: TocEntry[];
  onClose: () => void;
}

function TocBottomSheet({ visible, toc, onClose }: TocBottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Table of Contents</Text>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {toc.length === 0 ? (
                <Text style={styles.tocEmpty}>No headings found in this page.</Text>
              ) : (
                toc.map((entry, idx) => (
                  <TouchableOpacity
                    key={`${entry.anchor}-${idx}`}
                    style={[styles.tocItem, { paddingLeft: (entry.level - 1) * 16 + 16 }]}
                    onPress={onClose}
                  >
                    <Text style={styles.tocItemLevel}>H{entry.level}</Text>
                    <Text style={styles.tocItemText} numberOfLines={1}>
                      {entry.text}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function WikiPageScreen() {
  const { owner, name, page } = useLocalSearchParams<{
    owner: string;
    name: string;
    page: string;
  }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<WikiPageDetail | null>(null);
  const [tocVisible, setTocVisible] = useState(false);
  const toc = pageData ? extractToc(pageData.content) : [];

  const fetchPage = useCallback(async () => {
    if (!owner || !name || !page) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<WikiPageDetail>(
        `/repos/${owner}/${name}/wiki/${page}`,
      );
      setPageData(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  }, [owner, name, page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {pageData?.title ?? 'Wiki'}
        </Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setTocVisible(true)}
            accessibilityLabel="Table of contents"
          >
            <Text style={styles.headerBtnIcon}>≡</Text>
          </TouchableOpacity>

          {pageData?.isCollaborator && (
            <TouchableOpacity
              style={[styles.headerBtn, styles.editBtn]}
              onPress={() => router.push(`/repo/${owner}/${name}/wiki/${page}/edit`)}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading page…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchPage}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Breadcrumb */}
          <View style={styles.breadcrumb}>
            <TouchableOpacity onPress={() => router.push(`/repo/${owner}/${name}/wiki`)}>
              <Text style={styles.breadcrumbLink}>Wiki</Text>
            </TouchableOpacity>
            <Text style={styles.breadcrumbSep}> / </Text>
            <Text style={styles.breadcrumbActive}>{pageData?.title}</Text>
          </View>

          {/* Author + date meta */}
          {pageData && (
            <View style={styles.meta}>
              <Text style={styles.metaText}>
                Last updated {new Date(pageData.updatedAt).toLocaleDateString()} by{' '}
                <Text style={styles.metaAuthor}>{pageData.authorUsername}</Text>
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push(`/repo/${owner}/${name}/wiki/${page}/history`)
                }
              >
                <Text style={styles.historyLink}>History</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Markdown body */}
          {pageData && (
            <MarkdownRenderer
              content={pageData.content}
              owner={owner ?? ''}
              repoName={name ?? ''}
            />
          )}

          {/* Prev / Next navigation */}
          <View style={styles.pageNav}>
            {pageData?.prevPage ? (
              <TouchableOpacity
                style={styles.pageNavBtn}
                onPress={() =>
                  router.push(`/repo/${owner}/${name}/wiki/${pageData.prevPage!.slug}`)
                }
              >
                <Text style={styles.pageNavDir}>‹ Previous</Text>
                <Text style={styles.pageNavLabel}>{pageData.prevPage.title}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.pageNavBtn}
                onPress={() => router.push(`/repo/${owner}/${name}/wiki`)}
              >
                <Text style={styles.pageNavDir}>‹ Home</Text>
              </TouchableOpacity>
            )}

            {pageData?.nextPage && (
              <TouchableOpacity
                style={[styles.pageNavBtn, styles.pageNavBtnRight]}
                onPress={() =>
                  router.push(`/repo/${owner}/${name}/wiki/${pageData.nextPage!.slug}`)
                }
              >
                <Text style={styles.pageNavDir}>Next ›</Text>
                <Text style={styles.pageNavLabel}>{pageData.nextPage.title}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Edit this page */}
          {pageData?.isCollaborator && (
            <TouchableOpacity
              style={styles.editPageBtn}
              onPress={() => router.push(`/repo/${owner}/${name}/wiki/${page}/edit`)}
            >
              <Text style={styles.editPageBtnText}>✎ Edit this page</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* TOC bottom sheet */}
      <TocBottomSheet
        visible={tocVisible}
        toc={toc}
        onClose={() => setTocVisible(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    padding: 6,
  },
  headerBtnText: {
    color: Colors.text,
    fontSize: 26,
    lineHeight: 26,
  },
  headerBtnIcon: {
    color: Colors.textSecondary,
    fontSize: 22,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editBtn: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editBtnText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },

  // States
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 32,
    color: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 48,
  },

  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  breadcrumbLink: {
    color: Colors.primaryLight,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  breadcrumbSep: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  breadcrumbActive: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Meta
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  metaAuthor: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  historyLink: {
    color: Colors.primaryLight,
    fontSize: 12,
    textDecorationLine: 'underline',
  },

  // Markdown
  h1: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 6,
  },
  h2: {
    color: Colors.text,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 6,
  },
  h3: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  h4: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  h5: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  h6: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  bold: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  italic: {
    color: Colors.text,
    fontSize: 15,
    fontStyle: 'italic',
  },
  inlineCode: {
    color: Colors.codeText,
    backgroundColor: Colors.codeBg,
    fontSize: 13,
    fontFamily: 'monospace',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mdLink: {
    color: Colors.primaryLight,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  mdImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: Colors.surface,
  },
  codeBlock: {
    backgroundColor: Colors.codeBg,
    borderRadius: 10,
    marginVertical: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeLangBar: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  codeLang: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeText: {
    color: Colors.codeText,
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
    padding: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  listBullet: {
    color: Colors.primary,
    fontSize: 15,
    marginRight: 8,
    marginTop: 2,
  },
  listText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: 12,
    marginVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 4,
    paddingVertical: 6,
  },
  blockquoteText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
  },
  hr: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  spacer: {
    height: 8,
  },

  // Page navigation
  pageNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
    gap: 12,
  },
  pageNavBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  pageNavBtnRight: {
    alignItems: 'flex-end',
  },
  pageNavDir: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  pageNavLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },

  // Edit page button
  editPageBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  editPageBtnText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },

  // Bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  sheetScroll: {
    paddingHorizontal: 16,
  },
  tocEmpty: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  tocItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  tocItemLevel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    width: 22,
  },
  tocItemText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
});
