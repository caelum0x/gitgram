/**
 * Utility for parsing code blocks and inline code from text content
 */

export interface CodeBlock {
  type: 'code-block';
  code: string;
  language: string;
}

export interface InlineCode {
  type: 'inline-code';
  code: string;
}

export interface TextSegment {
  type: 'text';
  content: string;
}

export type ContentSegment = CodeBlock | InlineCode | TextSegment;

/**
 * Parse content string to extract code blocks and inline code
 *
 * Supports:
 * - Triple backtick code blocks with optional language: ```js\ncode\n```
 * - Inline code with single backticks: `code`
 *
 * @param content - The text content to parse
 * @returns Array of content segments
 */
export function parseCodeContent(content: string): ContentSegment[] {
  if (!content) return [];

  const segments: ContentSegment[] = [];

  // Regex patterns
  // Code blocks: ```language\ncode\n``` or ```\ncode\n```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;

  // First, extract code blocks
  let lastIndex = 0;
  const codeBlockMatches: Array<{
    start: number;
    end: number;
    language: string;
    code: string;
  }> = [];

  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlockMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }

  // Process content with code blocks
  if (codeBlockMatches.length > 0) {
    for (const codeBlock of codeBlockMatches) {
      // Add text before this code block
      if (codeBlock.start > lastIndex) {
        const textBefore = content.slice(lastIndex, codeBlock.start);
        // Parse inline code in this text segment
        segments.push(...parseInlineCode(textBefore));
      }

      // Add the code block
      segments.push({
        type: 'code-block',
        language: codeBlock.language,
        code: codeBlock.code,
      });

      lastIndex = codeBlock.end;
    }

    // Add remaining text after last code block
    if (lastIndex < content.length) {
      const textAfter = content.slice(lastIndex);
      segments.push(...parseInlineCode(textAfter));
    }
  } else {
    // No code blocks, just parse inline code
    segments.push(...parseInlineCode(content));
  }

  return segments;
}

/**
 * Parse inline code from a text segment (assumes no code blocks)
 */
function parseInlineCode(text: string): ContentSegment[] {
  if (!text) return [];

  const segments: ContentSegment[] = [];
  const inlineCodeRegex = /`([^`\n]+)`/g;

  let lastIndex = 0;
  let match;

  while ((match = inlineCodeRegex.exec(text)) !== null) {
    // Add text before this inline code
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        segments.push({ type: 'text', content: textBefore });
      } else if (textBefore) {
        segments.push({ type: 'text', content: textBefore });
      }
    }

    // Add the inline code
    segments.push({
      type: 'inline-code',
      code: match[1],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  } else if (lastIndex === 0 && text) {
    // No inline code found, return the whole text
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

/**
 * Check if content contains any code blocks or inline code
 */
export function hasCode(content: string): boolean {
  if (!content) return false;
  const codeBlockRegex = /```[\s\S]*?```/;
  const inlineCodeRegex = /`[^`\n]+`/;
  return codeBlockRegex.test(content) || inlineCodeRegex.test(content);
}

/**
 * Extract just the code blocks from content
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const segments = parseCodeContent(content);
  return segments.filter((s): s is CodeBlock => s.type === 'code-block');
}

/**
 * Get supported language list for syntax highlighting
 */
export const supportedLanguages = [
  'javascript', 'js',
  'typescript', 'ts',
  'python', 'py',
  'go', 'golang',
  'rust', 'rs',
  'java',
  'c', 'cpp', 'c++',
  'csharp', 'c#', 'cs',
  'ruby', 'rb',
  'php',
  'swift',
  'kotlin', 'kt',
  'bash', 'sh', 'shell',
  'json',
  'yaml', 'yml',
  'markdown', 'md',
  'sql',
  'css', 'scss', 'sass',
  'jsx', 'tsx',
  'html', 'xml',
];
