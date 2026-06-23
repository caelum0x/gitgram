'use client';

import { useMemo } from 'react';
import { parseCodeContent, ContentSegment, hasCode } from '@/utils/codeParser';
import CodeBlock, { InlineCode } from './CodeBlock';

interface RichContentProps {
  content: string;
  className?: string;
}

/**
 * Renders text content with syntax-highlighted code blocks and inline code
 */
export default function RichContent({ content, className = '' }: RichContentProps) {
  const segments = useMemo(() => parseCodeContent(content), [content]);

  // If no code, just render plain text for better performance
  if (!hasCode(content)) {
    return (
      <div className={`whitespace-pre-wrap ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div className={className}>
      {segments.map((segment, index) => (
        <RenderSegment key={index} segment={segment} />
      ))}
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
      return <span className="whitespace-pre-wrap">{segment.content}</span>;

    default:
      return null;
  }
}
