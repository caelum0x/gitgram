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
  codeBg: '#161625',
  codeText: '#A78BFA',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WikiPage {
  slug: string;
  title: string;
  updatedAt: string;
}

interface WikiHomeResponse {
  content: string;
  pages: WikiPage[];
  isCollaborator: boolean;
}

// ---------------------------------------------------------------------------
// Minimal markdown renderer
// Supports: headings, bold, italic, inline code, code blocks, images, links,
// unordered lists, horizontal rules, and plain paragraphs.
// Internal wiki links (no protocol) navigate within the wiki.
// External links open in the system browser.
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
          // silently ignore — user can retry
        });
      } else {
        // Internal wiki link — treat href as page slug
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

  // Render inline content: bold, italic, inline code, images, links
  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Pattern order matters — longest/most-specific first
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
        // Image: ![alt](url)
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
        // Link: [text](href)
        const href = match[4];
        parts.push(
          <Text
            key={`link-${match.index}`}
            style={styles.mdLink}
            onPress={() => handleLink(href)}
          >
            {match[3]}
          </Text>,
        );
      } else if (match[5] !== undefined) {
        // Inline code: `code`
        parts.push(
          <Text key={`code-${match.index}`} style={styles.inlineCode}>
            {match[5]}
          </Text>,
        );
      } else if (match[6] !== undefined) {
        // Bold: **text**
        parts.push(
          <Text key={`bold-${match.index}`} style={styles.bold}>
            {match[6]}
          </Text>,
        );
      } else if (match[7] !== undefined) {
        // Italic: *text*
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

    // Fenced code block
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

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingStyles = [
        styles.h1,
        styles.h2,
        styles.h3,
        styles.h4,
        styles.h5,
        styles.h6,
      ];
      elements.push(
        <Text key={nextKey()} style={headingStyles[level - 1]}>
          {headingMatch[2]}
        </Text>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(<View key={nextKey()} style={styles.hr} />);
      i += 1;
      continue;
    }

    // Unordered list item
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

    // Ordered list item
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

    // Blockquote
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

    // Blank line — spacer
    if (line.trim() === '') {
      elements.push(<View key={nextKey()} style={styles.spacer} />);
      i += 1;
      continue;
    }

    // Default paragraph
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
// Pages bottom sheet
// ---------------------------------------------------------------------------

interface PagesBottomSheetProps {
  visible: boolean;
  pages: WikiPage[];
  owner: string;
  repoName: string;
  onClose: () => void;
}

function PagesBottomSheet({ visible, pages, owner, repoName, onClose }: PagesBottomSheetProps) {
  const router = useRouter();
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

  const handlePageTap = useCallback(
    (slug: string) => {
      onClose();
      router.push(`/repo/${owner}/${repoName}/wiki/${slug}`);
    },
    [onClose, owner, repoName, router],
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <Pressable>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Wiki Pages</Text>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {/* Home is always first */}
              <TouchableOpacity
                style={styles.pageItem}
                onPress={() => {
                  onClose();
                  router.push(`/repo/${owner}/${repoName}/wiki`);
                }}
              >
                <Text style={styles.pageItemTitle}>Home</Text>
                <Text style={styles.pageItemChevron}>›</Text>
              </TouchableOpacity>

              {pages.map((page) => (
                <TouchableOpacity
                  key={page.slug}
                  style={styles.pageItem}
                  onPress={() => handlePageTap(page.slug)}
                >
                  <View style={styles.pageItemInfo}>
                    <Text style={styles.pageItemTitle}>{page.title}</Text>
                    <Text style={styles.pageItemDate}>
                      Updated {new Date(page.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.pageItemChevron}>›</Text>
                </TouchableOpacity>
              ))}
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

export default function WikiIndexScreen() {
  const { owner, name } = useLocalSearchParams<{ owner: string; name: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wikiData, setWikiData] = useState<WikiHomeResponse | null>(null);
  const [pagesVisible, setPagesVisible] = useState(false);

  const fetchWiki = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<WikiHomeResponse>(
        `/repos/${owner}/${name}/wiki`,
      );
      setWikiData(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load wiki');
    } finally {
      setLoading(false);
    }
  }, [owner, name]);

  useEffect(() => {
    fetchWiki();
  }, [fetchWiki]);

  // Derive prev/next from pages list (home counts as index -1)
  const pages = wikiData?.pages ?? [];
  const prevPage = null; // Home has no previous
  const nextPage = pages.length > 0 ? pages[0] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Wiki</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setPagesVisible(true)}
          >
            <Text style={styles.headerBtnIcon}>☰</Text>
          </TouchableOpacity>

          {wikiData?.isCollaborator && (
            <TouchableOpacity
              style={[styles.headerBtn, styles.editBtn]}
              onPress={() => router.push(`/repo/${owner}/${name}/wiki/edit`)}
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
          <Text style={styles.loadingText}>Loading wiki…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchWiki}>
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
            <Text style={styles.breadcrumbText}>{owner}</Text>
            <Text style={styles.breadcrumbSep}> / </Text>
            <Text style={styles.breadcrumbText}>{name}</Text>
            <Text style={styles.breadcrumbSep}> / </Text>
            <Text style={[styles.breadcrumbText, styles.breadcrumbActive]}>Wiki</Text>
          </View>

          {/* Markdown body */}
          {wikiData && (
            <MarkdownRenderer
              content={wikiData.content}
              owner={owner ?? ''}
              repoName={name ?? ''}
            />
          )}

          {/* Prev / Next navigation */}
          <View style={styles.pageNav}>
            {prevPage ? (
              <TouchableOpacity
                style={styles.pageNavBtn}
                onPress={() =>
                  router.push(`/repo/${owner}/${name}/wiki/${prevPage}`)
                }
              >
                <Text style={styles.pageNavDir}>‹ Previous</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            {nextPage && (
              <TouchableOpacity
                style={[styles.pageNavBtn, styles.pageNavBtnRight]}
                onPress={() =>
                  router.push(`/repo/${owner}/${name}/wiki/${nextPage.slug}`)
                }
              >
                <Text style={styles.pageNavDir}>Next ›</Text>
                <Text style={styles.pageNavLabel}>{nextPage.title}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Edit this page */}
          {wikiData?.isCollaborator && (
            <TouchableOpacity
              style={styles.editPageBtn}
              onPress={() => router.push(`/repo/${owner}/${name}/wiki/edit`)}
            >
              <Text style={styles.editPageBtnText}>✎ Edit this page</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Pages bottom sheet */}
      <PagesBottomSheet
        visible={pagesVisible}
        pages={pages}
        owner={owner ?? ''}
        repoName={name ?? ''}
        onClose={() => setPagesVisible(false)}
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
    fontSize: 20,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '600',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 48,
  },

  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  breadcrumbText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  breadcrumbSep: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  breadcrumbActive: {
    color: Colors.primaryLight,
    fontWeight: '600',
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
    maxHeight: '75%',
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
  pageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pageItemInfo: {
    flex: 1,
  },
  pageItemTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  pageItemDate: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pageItemChevron: {
    color: Colors.textMuted,
    fontSize: 20,
    marginLeft: 8,
  },
});
