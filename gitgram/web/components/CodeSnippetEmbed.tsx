'use client'

import { useEffect, useRef, useState } from 'react'
import * as Prism from 'prismjs'

import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'

export const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Plain Text' },
] as const

const languagePrismMap: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  bash: 'bash',
  json: 'json',
  yaml: 'yaml',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  jsx: 'jsx',
  tsx: 'tsx',
  markdown: 'markdown',
  text: 'text',
}

interface CodeSnippetEmbedProps {
  code: string
  language: string
  filePath?: string
  lineStart?: number
  lineEnd?: number
  repoOwner?: string
  repoName?: string
  theme?: 'dark' | 'light'
  maxHeight?: string
  showHeader?: boolean
}

export default function CodeSnippetEmbed({
  code,
  language = 'text',
  filePath,
  lineStart,
  lineEnd,
  repoOwner,
  repoName,
  theme = 'dark',
  maxHeight = '400px',
  showHeader = true,
}: CodeSnippetEmbedProps) {
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  const prismLang = languagePrismMap[language] || 'text'
  const displayLang = SUPPORTED_LANGUAGES.find((l) => l.value === language)?.label || language.toUpperCase()

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const lines = code.split('\n')
  const startLine = lineStart || 1

  const isDark = theme === 'dark'
  const bgColor = isDark ? 'bg-[#0d1117]' : 'bg-[#f6f8fa]'
  const headerBg = isDark ? 'bg-[#161b22]' : 'bg-[#e1e4e8]'
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-300'
  const textColor = isDark ? 'text-gray-400' : 'text-gray-600'
  const lineNumColor = isDark ? 'text-gray-500' : 'text-gray-400'

  const repoUrl = repoOwner && repoName
    ? `https://github.com/${repoOwner}/${repoName}`
    : null

  const fileUrl = repoUrl && filePath
    ? `${repoUrl}/blob/main/${filePath}${lineStart ? `#L${lineStart}${lineEnd ? `-L${lineEnd}` : ''}` : ''}`
    : null

  return (
    <div className={`rounded-lg overflow-hidden border ${borderColor} ${bgColor} my-3`}>
      {showHeader && (
        <div className={`flex items-center justify-between px-4 py-2 ${headerBg} border-b ${borderColor}`}>
          <div className="flex items-center gap-3">
            {/* Terminal dots */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
            </div>
            <div className="flex items-center gap-2">
              {filePath ? (
                <span className={`text-sm ${textColor} font-mono truncate max-w-[300px]`}>
                  {filePath}
                </span>
              ) : (
                <span className={`text-sm ${textColor} font-mono`}>{displayLang}</span>
              )}
              {lineStart && lineEnd && (
                <span className={`text-xs ${textColor} opacity-70`}>
                  L{lineStart}-{lineEnd}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View in repository link */}
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 px-2 py-1 text-xs ${textColor} hover:text-white hover:bg-gray-700 rounded transition-colors`}
                title="View in repository"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>View</span>
              </a>
            )}

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${textColor} hover:text-white hover:bg-gray-700 rounded transition-colors`}
              title="Copy code"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-500">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Code content */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <div className="flex">
          {/* Line numbers */}
          <div className="flex-shrink-0 py-4 pl-4 pr-2 text-right select-none">
            {lines.map((_, i) => (
              <div key={i} className={`text-sm font-mono leading-6 ${lineNumColor}`}>
                {startLine + i}
              </div>
            ))}
          </div>

          {/* Code */}
          <pre className="flex-1 py-4 pr-4 pl-2 overflow-x-auto m-0 bg-transparent">
            <code
              ref={codeRef}
              className={`language-${prismLang} text-sm font-mono leading-6 !bg-transparent`}
            >
              {code}
            </code>
          </pre>
        </div>
      </div>

      {/* Footer with repo link */}
      {repoOwner && repoName && (
        <div className={`flex items-center gap-2 px-4 py-2 border-t ${borderColor} ${headerBg}`}>
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zm-8 11a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <a
            href={repoUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs ${textColor} hover:text-primary transition-colors font-mono`}
          >
            {repoOwner}/{repoName}
          </a>
        </div>
      )}
    </div>
  )
}

// Inline editor for inserting code snippets in compose
interface CodeSnippetEditorProps {
  onInsert: (snippet: {
    code: string
    language: string
    filePath?: string
    lineStart?: number
    lineEnd?: number
  }) => void
  onCancel: () => void
  repoOwner?: string
  repoName?: string
}

export function CodeSnippetEditor({
  onInsert,
  onCancel,
  repoOwner,
  repoName,
}: CodeSnippetEditorProps) {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('typescript')
  const [filePath, setFilePath] = useState('')
  const [lineStart, setLineStart] = useState('')
  const [lineEnd, setLineEnd] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const handleInsert = () => {
    if (!code.trim()) return
    onInsert({
      code: code.trim(),
      language,
      filePath: filePath.trim() || undefined,
      lineStart: lineStart ? parseInt(lineStart) : undefined,
      lineEnd: lineEnd ? parseInt(lineEnd) : undefined,
    })
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Insert Code Snippet</h3>
        <button
          onClick={onCancel}
          className="text-sm text-foreground-secondary hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {/* Language selector */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-foreground-secondary mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-foreground-secondary mb-1">File path (optional)</label>
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="src/index.ts"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Line range */}
      <div className="flex gap-3">
        <div className="w-1/2">
          <label className="block text-xs text-foreground-secondary mb-1">Start line (optional)</label>
          <input
            type="number"
            value={lineStart}
            onChange={(e) => setLineStart(e.target.value)}
            placeholder="1"
            min="1"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="w-1/2">
          <label className="block text-xs text-foreground-secondary mb-1">End line (optional)</label>
          <input
            type="number"
            value={lineEnd}
            onChange={(e) => setLineEnd(e.target.value)}
            placeholder="50"
            min="1"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Code input */}
      <div>
        <label className="block text-xs text-foreground-secondary mb-1">Code</label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your code here..."
          className="w-full min-h-[150px] rounded-lg border border-border bg-[#0d1117] px-4 py-3 text-sm font-mono text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          spellCheck={false}
        />
      </div>

      {/* Preview toggle */}
      {code.trim() && (
        <div>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-primary hover:underline mb-2"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          {showPreview && (
            <CodeSnippetEmbed
              code={code}
              language={language}
              filePath={filePath || undefined}
              lineStart={lineStart ? parseInt(lineStart) : undefined}
              lineEnd={lineEnd ? parseInt(lineEnd) : undefined}
              repoOwner={repoOwner}
              repoName={repoName}
              maxHeight="250px"
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground border border-border rounded-lg hover:bg-surface-secondary transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleInsert}
          disabled={!code.trim()}
          className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          Insert Snippet
        </button>
      </div>
    </div>
  )
}
