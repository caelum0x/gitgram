import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../constants/Colors';

// Language mapping for display names
const languageMap: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  go: 'Go',
  golang: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  'c#': 'C#',
  cs: 'C#',
  ruby: 'Ruby',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  jsx: 'JSX',
  tsx: 'TSX',
  html: 'HTML',
  xml: 'XML',
};

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  fileName?: string;
}

export default function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = false,
  fileName,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const displayLanguage =
    languageMap[language.toLowerCase()] || language.toUpperCase();

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Terminal dots */}
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotRed]} />
            <View style={[styles.dot, styles.dotYellow]} />
            <View style={[styles.dot, styles.dotGreen]} />
          </View>
          {/* File name or language */}
          <Text style={styles.languageLabel}>
            {fileName || displayLanguage}
          </Text>
        </View>
        {/* Copy button */}
        <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
          <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Code content */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={styles.codeScrollView}
        contentContainerStyle={styles.codeContentContainer}
      >
        <Text selectable style={styles.codeText}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

// Inline code component for single backticks
export function InlineCode({ children }: { children: string }) {
  return (
    <Text style={styles.inlineCode}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#0d1117',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#161b22',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotRed: {
    backgroundColor: '#ff5f56',
  },
  dotYellow: {
    backgroundColor: '#ffbd2e',
  },
  dotGreen: {
    backgroundColor: '#27c93f',
  },
  languageLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  copyButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  copyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  copyTextSuccess: {
    color: '#27c93f',
  },
  codeScrollView: {
    maxHeight: 400,
  },
  codeContentContainer: {
    padding: 16,
  },
  codeText: {
    color: '#e6edf3',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  inlineCode: {
    backgroundColor: 'rgba(110, 118, 129, 0.4)',
    color: '#f78166',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
});
