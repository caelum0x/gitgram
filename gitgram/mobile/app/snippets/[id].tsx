import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { snippetService, CodeSnippet } from '../../services/snippetService';
import { logger } from '../../utils/logger';
import CodeBlock from '../../components/proximity/CodeBlock';
import { useToast } from '../../components/proximity/Toast';
import { ErrorBoundary } from '../../components/proximity/ErrorBoundary';

const LANGUAGE_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  python: '#3776ab',
  rust: '#ce422b',
  go: '#00add8',
  java: '#5382a1',
  csharp: '#68217a',
  cpp: '#00599c',
  swift: '#fa7343',
  kotlin: '#7f52ff',
};

function unwrapSnippet(data: unknown): CodeSnippet | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.snippet && typeof record.snippet === 'object') {
    return record.snippet as CodeSnippet;
  }
  if (typeof record.id === 'string' || typeof record.id === 'number') {
    return record as unknown as CodeSnippet;
  }
  return null;
}

export default function SnippetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [snippet, setSnippet] = useState<CodeSnippet | null>(null);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);

  const loadSnippet = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await snippetService.getSnippet(id);
      setSnippet(unwrapSnippet(data));
    } catch (error) {
      logger.error('Load snippet error:', error);
      setSnippet(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSnippet();
  }, [loadSnippet]);

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    try {
      await Clipboard.setStringAsync(snippet.code);
      toast.show('Code copied to clipboard', 'success');
    } catch (error) {
      logger.error('Copy snippet error:', error);
      toast.show('Failed to copy code', 'error');
    }
  }, [snippet, toast]);

  const handleShare = useCallback(async () => {
    if (!snippet) return;
    try {
      await Share.share({
        message: `Check out this ${snippet.language} snippet: "${snippet.title}"\n\n${snippet.code.substring(0, 200)}...`,
        title: snippet.title,
      });
    } catch (error) {
      logger.error('Share snippet error:', error);
    }
  }, [snippet]);

  const handleLike = useCallback(async () => {
    if (!snippet || liking) return;
    setLiking(true);
    try {
      await snippetService.likeSnippet(snippet.id);
      setSnippet((prev) =>
        prev ? { ...prev, likesCount: (prev.likesCount || 0) + 1 } : prev
      );
    } catch (error) {
      logger.error('Like snippet error:', error);
      Alert.alert('Error', 'Failed to like snippet');
    } finally {
      setLiking(false);
    }
  }, [snippet, liking]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Snippet" />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  if (!snippet) {
    return (
      <View style={styles.container}>
        <Header title="Snippet" />
        <EmptyState
          title="Snippet not found"
          message="This snippet may have been deleted or is private."
          icon="🔍"
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const languageColor = LANGUAGE_COLORS[snippet.language?.toLowerCase()] || Colors.muted;

  return (
    <View style={styles.container}>
      <Header title="Snippet" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.languageBadge}>
            <View style={[styles.languageDot, { backgroundColor: languageColor }]} />
            <Text style={styles.languageText}>{snippet.language}</Text>
          </View>
          {!snippet.isPublic && (
            <View style={styles.privateBadge}>
              <Text style={styles.privateText}>Private</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{snippet.title}</Text>

        {snippet.user?.username && (
          <Text style={styles.author}>by @{snippet.user.username}</Text>
        )}

        {snippet.description && (
          <Text style={styles.description}>{snippet.description}</Text>
        )}

        <View style={styles.codeBlockWrap}>
          <ErrorBoundary
            onError={(err) => logger.error('CodeBlock render error:', err)}
          >
            <CodeBlock
              code={snippet.code}
              language={snippet.language}
              maxHeight={400}
            />
          </ErrorBoundary>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLike}
            disabled={liking}
          >
            <Text style={styles.actionText}>❤️ {snippet.likesCount || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
            <Text style={styles.actionText}>📋 Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionText}>📤 Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.meta}>👁️ {snippet.viewsCount || 0} views</Text>
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
    padding: 16,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  languageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  languageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  languageText: {
    fontSize: 13,
    color: Colors.muted,
    textTransform: 'capitalize',
  },
  privateBadge: {
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  privateText: {
    fontSize: 10,
    color: Colors.warning,
    fontWeight: '500',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.foreground,
    marginBottom: 4,
  },
  author: {
    fontSize: 13,
    color: Colors.muted,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: Colors.foreground,
    lineHeight: 22,
    marginBottom: 16,
  },
  codeBlockWrap: {
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    color: Colors.foreground,
    fontWeight: '500',
  },
  meta: {
    fontSize: 13,
    color: Colors.muted,
  },
});
