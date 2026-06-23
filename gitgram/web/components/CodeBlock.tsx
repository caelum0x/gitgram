'use client';

import { useEffect, useRef, useState } from 'react';
import * as Prism from 'prismjs';

// Import language support
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';

// Language mapping for display names and Prism keys
const languageMap: Record<string, { display: string; prism: string }> = {
  js: { display: 'JavaScript', prism: 'javascript' },
  javascript: { display: 'JavaScript', prism: 'javascript' },
  ts: { display: 'TypeScript', prism: 'typescript' },
  typescript: { display: 'TypeScript', prism: 'typescript' },
  py: { display: 'Python', prism: 'python' },
  python: { display: 'Python', prism: 'python' },
  go: { display: 'Go', prism: 'go' },
  golang: { display: 'Go', prism: 'go' },
  rust: { display: 'Rust', prism: 'rust' },
  rs: { display: 'Rust', prism: 'rust' },
  java: { display: 'Java', prism: 'java' },
  c: { display: 'C', prism: 'c' },
  cpp: { display: 'C++', prism: 'cpp' },
  'c++': { display: 'C++', prism: 'cpp' },
  csharp: { display: 'C#', prism: 'csharp' },
  'c#': { display: 'C#', prism: 'csharp' },
  cs: { display: 'C#', prism: 'csharp' },
  ruby: { display: 'Ruby', prism: 'ruby' },
  rb: { display: 'Ruby', prism: 'ruby' },
  php: { display: 'PHP', prism: 'php' },
  swift: { display: 'Swift', prism: 'swift' },
  kotlin: { display: 'Kotlin', prism: 'kotlin' },
  kt: { display: 'Kotlin', prism: 'kotlin' },
  bash: { display: 'Bash', prism: 'bash' },
  sh: { display: 'Shell', prism: 'bash' },
  shell: { display: 'Shell', prism: 'bash' },
  json: { display: 'JSON', prism: 'json' },
  yaml: { display: 'YAML', prism: 'yaml' },
  yml: { display: 'YAML', prism: 'yaml' },
  md: { display: 'Markdown', prism: 'markdown' },
  markdown: { display: 'Markdown', prism: 'markdown' },
  sql: { display: 'SQL', prism: 'sql' },
  css: { display: 'CSS', prism: 'css' },
  scss: { display: 'SCSS', prism: 'scss' },
  sass: { display: 'Sass', prism: 'scss' },
  jsx: { display: 'JSX', prism: 'jsx' },
  tsx: { display: 'TSX', prism: 'tsx' },
  html: { display: 'HTML', prism: 'markup' },
  xml: { display: 'XML', prism: 'markup' },
};

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  fileName?: string;
  maxHeight?: string;
}

export default function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = true,
  fileName,
  maxHeight = '400px',
}: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const langInfo = languageMap[language.toLowerCase()] || {
    display: language.toUpperCase(),
    prism: 'text',
  };

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const lines = code.split('\n');

  return (
    <div className="rounded-lg overflow-hidden border border-gray-700 bg-[#0d1117] my-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-700">
        <div className="flex items-center gap-3">
          {/* Terminal dots */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          {/* File name or language */}
          <span className="text-sm text-gray-400 font-mono">
            {fileName || langInfo.display}
          </span>
        </div>
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <svg
                className="w-4 h-4 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <div className="flex">
          {/* Line numbers */}
          {showLineNumbers && (
            <div className="flex-shrink-0 py-4 pl-4 pr-2 text-right select-none">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className="text-gray-500 text-sm font-mono leading-6"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code */}
          <pre className="flex-1 py-4 pr-4 pl-2 overflow-x-auto m-0 bg-transparent">
            <code
              ref={codeRef}
              className={`language-${langInfo.prism} text-sm font-mono leading-6 !bg-transparent`}
            >
              {code}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// Inline code component for single backticks
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 mx-0.5 rounded bg-gray-800 text-pink-400 text-sm font-mono">
      {children}
    </code>
  );
}
