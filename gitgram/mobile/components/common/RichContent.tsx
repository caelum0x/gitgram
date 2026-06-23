import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { parseCodeContent, ContentSegment, hasCode } from '../../utils/codeParser';
import CodeBlock, { InlineCode } from './CodeBlock';
import { Colors } from '../../constants/Colors';

interface RichContentProps {
  content: string;
  textStyle?: object;
}

/**
 * Renders text content with syntax-highlighted code blocks and inline code
 */
export default function RichContent({ content, textStyle = {} }: RichContentProps) {
  const segments = useMemo(() => parseCodeContent(content), [content]);

  // If no code, just render plain text for better performance
  if (!hasCode(content)) {
    return (
      <Text style={[styles.text, textStyle]}>
        {content}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {segments.map((segment, index) => (
        <RenderSegment key={index} segment={segment} textStyle={textStyle} />
      ))}
    </View>
  );
}

function RenderSegment({
  segment,
  textStyle,
}: {
  segment: ContentSegment;
  textStyle: object;
}) {
  switch (segment.type) {
    case 'code-block':
      return (
        <CodeBlock
          code={segment.code}
          language={segment.language}
          showLineNumbers={segment.code.split('\n').length > 3}
        />
      );

    case 'inline-code':
      return <InlineCode>{segment.code}</InlineCode>;

    case 'text':
      return <Text style={[styles.text, textStyle]}>{segment.content}</Text>;

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  text: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
