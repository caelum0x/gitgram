'use client';

import { useMemo } from 'react';
import { parseCodeContent, ContentSegment, hasCode } from '@/utils/codeParser';
import { linkifyText } from '@/utils/linkify';
import CodeBlock, { InlineCode } from './CodeBlock';
import RichEmbeds from './RichEmbeds';

interface RichContentProps {
  content: string;
  className?: string;
  /**
   * When true (default), external URLs in the content are rendered as inline
   * media players (YouTube/Spotify/etc.) or link-preview cards below the text.
   * Set false in compact contexts (e.g. comment previews) where embeds would
   * be visually heavy.
   */
  embeds?: boolean;
}

/**
 * Renders text content with syntax-highlighted code blocks, inline code, and
 * (optionally) rich embeds — inline media players and link-preview cards — for
 * any external URLs detected in the text.
 */
export default function RichContent({ content, className = '', embeds = true }: RichContentProps) {
  const segments = useMemo(() => parseCodeContent(content), [content]);

  // If no code, just render linkified plain text for better performance
  if (!hasCode(content)) {
    return (
      <div className={className}>
        <div className="whitespace-pre-wrap">{linkifyText(content)}</div>
        {embeds && <RichEmbeds content={content} />}
      </div>
    );
  }

  return (
    <div className={className}>
      {segments.map((segment, index) => (
        <RenderSegment key={index} segment={segment} />
      ))}
      {embeds && <RichEmbeds content={content} />}
    </div>
  );
}

function RenderSegment({ segment }: { segment: ContentSegment }) {
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
      return <span className="whitespace-pre-wrap">{linkifyText(segment.content)}</span>;

    default:
      return null;
  }
}
