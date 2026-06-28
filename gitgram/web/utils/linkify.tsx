import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';

/**
 * Matches @mentions and #hashtags in free text.
 *
 * - A token must be preceded by start-of-string or whitespace so that emails
 *   (`a@b.com`) and inline code fragments are not mistakenly linkified.
 * - The captured word allows letters, numbers, and underscores — matching the
 *   product's username/hashtag rules (see settings/profile validateUsername and
 *   ContentComposer.extractHashtags).
 */
const TOKEN_PATTERN = /(^|[\s(])([@#])([A-Za-z0-9_]{1,40})/g;

export interface LinkifyOptions {
  /** Tailwind/utility classes applied to each generated link. */
  linkClassName?: string;
}

const DEFAULT_LINK_CLASS = 'text-[var(--primary)] hover:underline';

/**
 * Builds the destination route for a token.
 * Mentions resolve to the user profile route (`/[username]`).
 * Hashtags resolve to the hashtag feed route (`/hashtag/[tag]`).
 */
function hrefForToken(char: string, word: string): string {
  return char === '#' ? `/hashtag/${encodeURIComponent(word)}` : `/${encodeURIComponent(word)}`;
}

/**
 * Converts a plain text string into an array of React nodes where every
 * @mention / #hashtag becomes a clickable Next.js <Link>. All other text is
 * preserved verbatim (including whitespace), so it is safe to render inside a
 * `whitespace-pre-wrap` container.
 *
 * This performs no HTML parsing — it only ever emits plain strings and Link
 * elements, so there is no XSS surface (unlike dangerouslySetInnerHTML-based
 * approaches).
 */
export function linkifyText(text: string, options: LinkifyOptions = {}): ReactNode {
  const linkClassName = options.linkClassName ?? DEFAULT_LINK_CLASS;

  if (!text) return text;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  // Reset lastIndex defensively since the regex is global and module-scoped.
  TOKEN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const [, lead, char, word] = match;
    const tokenStart = match.index + lead.length;

    // Emit any text (plus the leading separator) before the token.
    const precedingText = text.slice(lastIndex, tokenStart);
    if (precedingText) {
      nodes.push(<Fragment key={`t-${keyCounter++}`}>{precedingText}</Fragment>);
    }

    nodes.push(
      <Link
        key={`l-${keyCounter++}`}
        href={hrefForToken(char, word)}
        className={linkClassName}
        // Stop the click from bubbling to parent post/card click handlers.
        onClick={(e) => e.stopPropagation()}
      >
        {char}
        {word}
      </Link>,
    );

    lastIndex = tokenStart + char.length + word.length;
  }

  // Trailing text after the final token.
  const trailing = text.slice(lastIndex);
  if (trailing) {
    nodes.push(<Fragment key={`t-${keyCounter++}`}>{trailing}</Fragment>);
  }

  return nodes;
}
