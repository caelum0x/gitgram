import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

// ---------------------------------------------------------------------------
// Dark theme — matches proximity snippet/[id].tsx palette
// ---------------------------------------------------------------------------
const Theme = {
  background: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2D2D50',
  gutter: '#16162A',
  text: '#E2E8F0',
  textMuted: '#64748B',
  // Syntax colors
  keyword: '#C792EA',
  string: '#C3E88D',
  comment: '#5C6370',
  number: '#F78C6C',
  function: '#82AAFF',
  type: '#FFCB6B',
  punctuation: '#89DDFF',
  copyIdle: '#94A3B8',
  copyDone: '#34D399',
} as const;

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178C6',
  javascript: '#F7DF1E',
  python: '#3572A5',
  go: '#00ADD8',
  rust: '#DEA584',
};

// ---------------------------------------------------------------------------
// Keyword sets per language (generic fallback covers the common subset)
// ---------------------------------------------------------------------------
const GENERIC_KEYWORDS: readonly string[] = [
  'if', 'else', 'for', 'while', 'return', 'break', 'continue', 'function',
  'class', 'new', 'true', 'false', 'null', 'import', 'export', 'from',
];

const KEYWORDS: Record<string, readonly string[]> = {
  typescript: [
    'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
    'const', 'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum',
    'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get',
    'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new',
    'null', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'set',
    'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type',
    'typeof', 'undefined', 'void', 'while', 'yield',
  ],
  javascript: [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
    'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new',
    'null', 'of', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
    'typeof', 'undefined', 'var', 'void', 'while', 'yield',
  ],
  python: [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from',
    'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
  ],
  go: [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
    'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
    'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
    'var', 'nil', 'true', 'false',
  ],
  rust: [
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
    'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let',
    'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self',
    'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
    'where', 'while',
  ],
};

// Line-comment prefix per language. Strings always use ' " ` delimiters.
const LINE_COMMENT: Record<string, string> = {
  typescript: '//',
  javascript: '//',
  go: '//',
  rust: '//',
  python: '#',
};

type TokenKind =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'function'
  | 'type'
  | 'punctuation'
  | 'plain';

interface Token {
  text: string;
  kind: TokenKind;
}

const TOKEN_COLOR: Record<TokenKind, string> = {
  keyword: Theme.keyword,
  string: Theme.string,
  comment: Theme.comment,
  number: Theme.number,
  function: Theme.function,
  type: Theme.type,
  punctuation: Theme.punctuation,
  plain: Theme.text,
};

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^(?:0[xXbBoO][0-9a-fA-F]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/;
const WHITESPACE_RE = /^\s+/;
const PUNCTUATION = new Set('{}()[];:,.<>+-*/%=&|!?~^');

function normalizeLanguage(language: string): string {
  const lang = language.trim().toLowerCase();
  const aliases: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    golang: 'go',
    rs: 'rust',
  };
  return aliases[lang] ?? lang;
}

/**
 * Tokenize a single line of code into colored spans. This is a deliberately
 * lightweight lexer — it covers keywords, strings, comments, numbers, function
 * calls and types well enough for snippet previews, not full grammar parsing.
 */
function tokenizeLine(line: string, language: string): Token[] {
  const keywords = new Set(KEYWORDS[language] ?? GENERIC_KEYWORDS);
  const commentPrefix = LINE_COMMENT[language] ?? '//';
  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    // Whole-line / trailing comment
    if (rest.startsWith(commentPrefix)) {
      tokens.push({ text: rest, kind: 'comment' });
      break;
    }

    // Whitespace — preserved as plain so indentation survives
    const ws = WHITESPACE_RE.exec(rest);
    if (ws) {
      tokens.push({ text: ws[0], kind: 'plain' });
      rest = rest.slice(ws[0].length);
      continue;
    }

    // String literals: ' " `
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      let end = 1;
      while (end < rest.length) {
        if (rest[end] === '\\') {
          end += 2;
          continue;
        }
        if (rest[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      tokens.push({ text: rest.slice(0, end), kind: 'string' });
      rest = rest.slice(end);
      continue;
    }

    // Numbers
    const num = NUMBER_RE.exec(rest);
    if (num) {
      tokens.push({ text: num[0], kind: 'number' });
      rest = rest.slice(num[0].length);
      continue;
    }

    // Identifiers → keyword / type / function / plain
    const ident = IDENTIFIER_RE.exec(rest);
    if (ident) {
      const word = ident[0];
      const after = rest.slice(word.length);
      let kind: TokenKind = 'plain';
      if (keywords.has(word)) {
        kind = 'keyword';
      } else if (/^[A-Z]/.test(word)) {
        kind = 'type';
      } else if (/^\s*\(/.test(after)) {
        kind = 'function';
      }
      tokens.push({ text: word, kind });
      rest = rest.slice(word.length);
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(rest[0])) {
      tokens.push({ text: rest[0], kind: 'punctuation' });
      rest = rest.slice(1);
      continue;
    }

    // Fallback single char
    tokens.push({ text: rest[0], kind: 'plain' });
    rest = rest.slice(1);
  }

  return tokens;
}

interface HighlightedLine {
  number: number;
  tokens: Token[];
}

function highlight(code: string, language: string): HighlightedLine[] {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line, index) => ({
    number: index + 1,
    tokens: tokenizeLine(line, language),
  }));
}

export interface CodeBlockProps {
  code: string;
  language: string;
  /** Show the left-hand line-number gutter. Defaults to true. */
  showLineNumbers?: boolean;
  /** Maximum rendered height before vertical scroll. Defaults to undefined (no cap). */
  maxHeight?: number;
}

function CodeBlock({
  code,
  language,
  showLineNumbers = true,
  maxHeight,
}: CodeBlockProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const normalizedLang = useMemo(() => normalizeLanguage(language), [language]);
  const lines = useMemo(
    () => highlight(code, normalizedLang),
    [code, normalizedLang],
  );
  const badgeColor = LANGUAGE_COLORS[normalizedLang] ?? Theme.textMuted;
  const gutterWidth = Math.max(2, String(lines.length).length) * 9 + 16;

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard failures are non-fatal for a preview component.
    }
  }, [code]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.badge}>
          <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
          <Text style={[styles.badgeLabel, { color: badgeColor }]}>
            {language}
          </Text>
        </View>
        <Pressable
          onPress={handleCopy}
          style={styles.copyButton}
          accessibilityRole="button"
          accessibilityLabel="Copy code to clipboard"
          hitSlop={8}
        >
          <Text
            style={[styles.copyLabel, copied && styles.copyLabelDone]}
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={maxHeight ? { maxHeight } : undefined}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.codeScrollContent}
        >
          <View style={styles.codeBody}>
            {lines.map((line) => (
              <View key={line.number} style={styles.line}>
                {showLineNumbers ? (
                  <Text
                    style={[styles.lineNumber, { width: gutterWidth }]}
                    selectable={false}
                  >
                    {line.number}
                  </Text>
                ) : null}
                <Text style={styles.lineText} selectable>
                  {line.tokens.length === 0 ? (
                    <Text style={styles.token}> </Text>
                  ) : (
                    line.tokens.map((token, tokenIndex) => (
                      <Text
                        key={tokenIndex}
                        style={[styles.token, { color: TOKEN_COLOR[token.kind] }]}
                      >
                        {token.text}
                      </Text>
                    ))
                  )}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 7,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  copyButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.background,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  copyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.copyIdle,
  },
  copyLabelDone: {
    color: Theme.copyDone,
  },
  codeScrollContent: {
    minWidth: '100%',
  },
  codeBody: {
    paddingVertical: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 20,
  },
  lineNumber: {
    fontFamily: 'Courier',
    fontSize: 13,
    lineHeight: 20,
    color: Theme.textMuted,
    textAlign: 'right',
    paddingRight: 12,
    backgroundColor: Theme.gutter,
  },
  lineText: {
    flexShrink: 0,
    paddingRight: 16,
    paddingLeft: 8,
  },
  token: {
    fontFamily: 'Courier',
    fontSize: 13,
    lineHeight: 20,
    color: Theme.text,
  },
});

export default CodeBlock;
