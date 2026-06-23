import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
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
  // Syntax highlight token colors
  syntaxKeyword: '#C678DD',
  syntaxString: '#98C379',
  syntaxComment: '#5C6370',
  syntaxNumber: '#D19A66',
  syntaxFunction: '#61AFEF',
  syntaxType: '#E5C07B',
  syntaxOperator: '#56B6C2',
  syntaxLineNum: '#4A5568',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileContentResponse {
  content: string;
  encoding?: string;
  size?: number;
}

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'operator' | 'plain';

interface Token {
  text: string;
  type: TokenType;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript (JSX)',
    js: 'JavaScript', jsx: 'JavaScript (JSX)',
    py: 'Python', rs: 'Rust', go: 'Go',
    java: 'Java', kt: 'Kotlin', swift: 'Swift',
    cpp: 'C++', c: 'C', cs: 'C#',
    rb: 'Ruby', php: 'PHP', sh: 'Shell',
    html: 'HTML', css: 'CSS', scss: 'SCSS',
    json: 'JSON', yaml: 'YAML', yml: 'YAML',
    toml: 'TOML', md: 'Markdown', txt: 'Plain Text',
    sql: 'SQL', xml: 'XML', graphql: 'GraphQL', gql: 'GraphQL',
    dart: 'Dart', scala: 'Scala', hs: 'Haskell',
  };
  return map[ext] ?? 'Plain Text';
}

function getFilename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

// ---------------------------------------------------------------------------
// Minimal syntax tokenizer
// Handles the most common patterns without a full parser.
// ---------------------------------------------------------------------------

const KEYWORDS_JS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'class', 'new', 'this', 'super',
  'import', 'export', 'default', 'from', 'async', 'await', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'null', 'undefined', 'true', 'false', 'type', 'interface', 'extends',
  'implements', 'enum', 'namespace', 'abstract', 'private', 'protected',
  'public', 'readonly', 'static', 'override',
]);

const KEYWORDS_PYTHON = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in',
  'not', 'and', 'or', 'import', 'from', 'as', 'try', 'except', 'finally',
  'with', 'pass', 'break', 'continue', 'raise', 'yield', 'lambda', 'None',
  'True', 'False', 'self', 'async', 'await',
]);

const KEYWORDS_RUST = new Set([
  'fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'use',
  'pub', 'mod', 'crate', 'super', 'self', 'return', 'if', 'else', 'match',
  'while', 'for', 'in', 'loop', 'break', 'continue', 'where', 'type',
  'async', 'await', 'move', 'ref', 'true', 'false',
]);

function getKeywordSet(lang: string): Set<string> {
  const l = lang.toLowerCase();
  if (l.startsWith('typescript') || l.startsWith('javascript')) return KEYWORDS_JS;
  if (l === 'python') return KEYWORDS_PYTHON;
  if (l === 'rust') return KEYWORDS_RUST;
  return KEYWORDS_JS; // default fallback
}

function tokenizeLine(line: string, lang: string): Token[] {
  const keywords = getKeywordSet(lang);
  const tokens: Token[] = [];

  // Single-line comment patterns
  const commentPrefixes: Record<string, string> = {
    typescript: '//', javascript: '//', rust: '//', go: '//', java: '//',
    python: '#', shell: '#', yaml: '#', toml: '#',
  };
  const commentPrefix = commentPrefixes[lang.split(' ')[0].toLowerCase()] ?? '//';

  let i = 0;
  while (i < line.length) {
    // Comment to end of line
    if (line.startsWith(commentPrefix, i)) {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // String literals (single or double quoted)
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++; // skip escape
        j++;
      }
      tokens.push({ text: line.slice(i, j + 1), type: 'string' });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || /\W/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9._xXa-fA-F]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const nextChar = line[j];
      let type: TokenType = 'plain';
      if (keywords.has(word)) {
        type = 'keyword';
      } else if (nextChar === '(') {
        type = 'function';
      } else if (/^[A-Z]/.test(word)) {
        type = 'type';
      }
      tokens.push({ text: word, type });
      i = j;
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    // Everything else (punctuation, whitespace)
    tokens.push({ text: line[i], type: 'plain' });
    i++;
  }

  return tokens;
}

function tokenColor(type: TokenType): string {
  switch (type) {
    case 'keyword': return Colors.syntaxKeyword;
    case 'string': return Colors.syntaxString;
    case 'comment': return Colors.syntaxComment;
    case 'number': return Colors.syntaxNumber;
    case 'function': return Colors.syntaxFunction;
    case 'type': return Colors.syntaxType;
    case 'operator': return Colors.syntaxOperator;
    default: return Colors.text;
  }
}

// ---------------------------------------------------------------------------
// Code line component
// ---------------------------------------------------------------------------

interface CodeLineProps {
  lineNumber: number;
  tokens: Token[];
}

function CodeLine({ lineNumber, tokens }: CodeLineProps) {
  return (
    <View style={codeStyles.line}>
      <Text style={codeStyles.lineNumber}>{lineNumber}</Text>
      <Text style={codeStyles.lineContent}>
        {tokens.map((token, idx) => (
          <Text key={idx} style={{ color: tokenColor(token.type) }}>
            {token.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    minHeight: 20,
  },
  lineNumber: {
    color: Colors.syntaxLineNum,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
    width: 42,
    textAlign: 'right',
    paddingRight: 14,
    userSelect: 'none' as never,
    flexShrink: 0,
  },
  lineContent: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
    color: Colors.text,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function FileViewerScreen() {
  const { owner, name, path } = useLocalSearchParams<{
    owner: string;
    name: string;
    path: string;
  }>();
  const router = useRouter();

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filename = getFilename(path ?? '');
  const language = detectLanguage(path ?? '');

  // ---------------------------------------------------------------------------
  // Fetch file content
  // ---------------------------------------------------------------------------
  const fetchContent = useCallback(async () => {
    if (!owner || !name || !path) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<FileContentResponse>(
        `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`,
      );
      const raw = data.encoding === 'base64'
        ? atob(data.content)
        : data.content;
      setContent(raw);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [owner, name, path]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // ---------------------------------------------------------------------------
  // Copy handler
  // ---------------------------------------------------------------------------
  const handleCopy = useCallback(() => {
    if (!content) return;
    Clipboard.setString(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  // ---------------------------------------------------------------------------
  // GitHub link
  // ---------------------------------------------------------------------------
  const handleViewOnGitHub = useCallback(() => {
    if (!owner || !name || !path) return;
    const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/main/${path}`;
    Linking.openURL(url).catch(() => undefined);
  }, [owner, name, path]);

  // ---------------------------------------------------------------------------
  // Tokenize content into lines
  // ---------------------------------------------------------------------------
  const codeLines: Token[][] = React.useMemo(() => {
    if (!content) return [];
    return content.split('\n').map((line) => tokenizeLine(line, language));
  }, [content, language]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>{'‹'}</Text>
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.filename} numberOfLines={1}>{filename}</Text>
          <Text style={styles.language}>{language}</Text>
        </View>

        <TouchableOpacity
          onPress={handleCopy}
          style={styles.copyBtn}
          disabled={!content}
          accessibilityLabel="Copy file contents"
        >
          <Text style={[styles.copyText, copied && styles.copyTextDone]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={fetchContent} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.codeScroll}
          horizontal
          showsHorizontalScrollIndicator
        >
          <ScrollView
            style={styles.codeScrollV}
            showsVerticalScrollIndicator
            contentContainerStyle={styles.codeContent}
          >
            {codeLines.map((tokens, idx) => (
              <CodeLine key={idx} lineNumber={idx + 1} tokens={tokens} />
            ))}
          </ScrollView>
        </ScrollView>
      )}

      {/* Footer: View on GitHub */}
      {!loading && !error && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.githubBtn}
            onPress={handleViewOnGitHub}
            activeOpacity={0.8}
          >
            <Text style={styles.githubBtnIcon}>{'⎋'}</Text>
            <Text style={styles.githubBtnText}>View on GitHub</Text>
          </TouchableOpacity>
        </View>
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
  titleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  filename: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  language: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 64,
    alignItems: 'center',
  },
  copyText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  copyTextDone: {
    color: Colors.success,
  },

  // Code view
  codeScroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  codeScrollV: {
    flex: 1,
  },
  codeContent: {
    paddingTop: 12,
    paddingRight: 24,
    paddingBottom: 24,
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

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
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
  githubBtnIcon: {
    color: Colors.text,
    fontSize: 16,
  },
  githubBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
