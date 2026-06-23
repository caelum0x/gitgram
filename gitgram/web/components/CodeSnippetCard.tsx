'use client';

import { useState } from 'react';
import Link from 'next/link';
import CodeBlock from './CodeBlock';

// Language badge color map — dark-theme friendly
const LANGUAGE_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  js: '#f7df1e',
  typescript: '#3178c6',
  ts: '#3178c6',
  tsx: '#3178c6',
  jsx: '#61dafb',
  python: '#3572a5',
  py: '#3572a5',
  go: '#00acd7',
  golang: '#00acd7',
  rust: '#dea584',
  rs: '#dea584',
  java: '#b07219',
  c: '#555555',
  cpp: '#f34b7d',
  'c++': '#f34b7d',
  csharp: '#178600',
  'c#': '#178600',
  cs: '#178600',
  ruby: '#701516',
  rb: '#701516',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#7f52ff',
  kt: '#7f52ff',
  bash: '#89e051',
  sh: '#89e051',
  shell: '#89e051',
  json: '#292929',
  yaml: '#cb171e',
  yml: '#cb171e',
  sql: '#e38c00',
  css: '#563d7c',
  scss: '#c6538c',
  html: '#e34c26',
  xml: '#0060ac',
  markdown: '#083fa1',
  md: '#083fa1',
};

const LINE_PREVIEW_COUNT = 30;

interface SnippetAuthor {
  username: string;
  avatarUrl?: string;
}

interface Snippet {
  id: string;
  title: string;
  language: string;
  code: string;
  author: SnippetAuthor;
  likes: number;
  comments: number;
  createdAt: string;
  isLiked?: boolean;
}

interface CodeSnippetCardProps {
  snippet: Snippet;
  onLike?: (id: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

function LanguageBadge({ language }: { language: string }) {
  const key = language.toLowerCase();
  const color = LANGUAGE_COLORS[key] ?? '#6e7681';

  // Decide text color based on lightness of badge background
  const lightColors = new Set(['#f7df1e', '#89e051', '#27c93f']);
  const textColor = lightColors.has(color) ? '#1a1a2e' : '#e6edf3';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono tracking-wide"
      style={{ backgroundColor: color, color: textColor }}
    >
      {language}
    </span>
  );
}

function AuthorAvatar({ username, avatarUrl }: SnippetAuthor) {
  const initial = username.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${username} avatar`}
        className="w-8 h-8 rounded-full object-cover border border-[#2D2D50]"
      />
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center border border-[#2D2D50] text-sm font-bold select-none"
      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
      aria-label={`${username} avatar`}
    >
      {initial}
    </div>
  );
}

export default function CodeSnippetCard({ snippet, onLike }: CodeSnippetCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = snippet.code.split('\n');
  const isTruncated = lines.length > LINE_PREVIEW_COUNT;
  const visibleCode = isTruncated && !expanded
    ? lines.slice(0, LINE_PREVIEW_COUNT).join('\n')
    : snippet.code;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy snippet code:', err);
    }
  };

  const handleLike = () => {
    onLike?.(snippet.id);
  };

  return (
    <article
      className="rounded-xl overflow-hidden border"
      style={{ backgroundColor: '#1A1A2E', borderColor: '#2D2D50' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <AuthorAvatar
            username={snippet.author.username}
            avatarUrl={snippet.author.avatarUrl}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-gray-100 truncate">
              @{snippet.author.username}
            </span>
            <time
              dateTime={snippet.createdAt}
              className="text-xs text-gray-500"
              title={new Date(snippet.createdAt).toLocaleString()}
            >
              {formatRelativeTime(snippet.createdAt)}
            </time>
          </div>
        </div>

        {/* Copy button in header area */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          style={{
            color: copied ? '#4ade80' : '#9ca3af',
            backgroundColor: copied ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
          }}
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* ── Title + language badge ── */}
      <div className="flex items-center gap-3 px-4 pb-3">
        <h3 className="text-base font-semibold text-gray-100 leading-snug flex-1 min-w-0 truncate">
          {snippet.title}
        </h3>
        <LanguageBadge language={snippet.language} />
      </div>

      {/* ── Code block ── */}
      <div className="px-4">
        {/*
          CodeBlock already handles syntax highlighting, line numbers, and its own
          copy button. We pass maxHeight="none" so the card controls truncation via
          the "Show more" toggle rather than letting CodeBlock scroll internally.
        */}
        <div style={{ borderRadius: '0.5rem', overflow: 'hidden' }}>
          <CodeBlock
            code={visibleCode}
            language={snippet.language}
            showLineNumbers
            maxHeight="none"
          />
        </div>

        {/* Show more / Show less toggle */}
        {isTruncated && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full py-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-b-md"
            style={{ backgroundColor: 'rgba(99,102,241,0.05)' }}
          >
            {expanded
              ? 'Show less'
              : `Show ${lines.length - LINE_PREVIEW_COUNT} more lines`}
          </button>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-3 mt-1 border-t" style={{ borderColor: '#2D2D50' }}>
        {/* Left: like + comment counts */}
        <div className="flex items-center gap-4">
          {/* Like button */}
          <button
            onClick={handleLike}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
            style={{ color: snippet.isLiked ? '#f43f5e' : '#9ca3af' }}
            aria-label={snippet.isLiked ? 'Unlike snippet' : 'Like snippet'}
            aria-pressed={snippet.isLiked ?? false}
          >
            <span
              className="text-base leading-none transition-transform"
              style={{ transform: snippet.isLiked ? 'scale(1.2)' : 'scale(1)' }}
              aria-hidden="true"
            >
              {snippet.isLiked ? '❤️' : '🤍'}
            </span>
            <span>{snippet.likes.toLocaleString()}</span>
          </button>

          {/* Comment count (display only) */}
          <div
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: '#9ca3af' }}
            aria-label={`${snippet.comments} comments`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span>{snippet.comments.toLocaleString()}</span>
          </div>
        </div>

        {/* Right: View Full link */}
        <Link
          href={`/snippets/${snippet.id}`}
          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        >
          View Full &rarr;
        </Link>
      </div>
    </article>
  );
}
