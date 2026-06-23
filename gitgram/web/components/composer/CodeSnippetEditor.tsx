'use client'

import { useState, useRef, useEffect } from 'react'

interface CodeSnippet {
  code: string
  language: string
  title?: string
}

interface CodeSnippetEditorProps {
  initialSnippet?: CodeSnippet | null
  onSave: (snippet: CodeSnippet) => void
  onClose: () => void
}

const LANGUAGES = [
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
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'text', label: 'Plain Text' },
]

export default function CodeSnippetEditor({
  initialSnippet,
  onSave,
  onClose,
}: CodeSnippetEditorProps) {
  const [code, setCode] = useState(initialSnippet?.code || '')
  const [language, setLanguage] = useState(initialSnippet?.language || 'javascript')
  const [title, setTitle] = useState(initialSnippet?.title || '')
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus textarea on mount
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // Handle tab key in textarea for indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      const newValue = code.substring(0, start) + '  ' + code.substring(end)
      setCode(newValue)

      // Set cursor position after the tab
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }

    // Cmd/Ctrl+Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }

    // Escape to close
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleSave = () => {
    if (!code.trim()) {
      setError('Code cannot be empty')
      return
    }

    onSave({
      code: code.trim(),
      language,
      title: title.trim() || undefined,
    })
  }

  const lineCount = code.split('\n').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">Code Snippet</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-border flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Snippet title (optional)"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-foreground-secondary"
            />
          </div>
          <div className="w-48">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground appearance-none cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden relative bg-[#0d1117]">
          <div className="flex h-full overflow-auto" style={{ maxHeight: '400px' }}>
            {/* Line numbers */}
            <div className="flex-shrink-0 py-4 pl-4 pr-2 text-right select-none border-r border-gray-800">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="text-gray-500 text-sm font-mono leading-6">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code textarea */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="Paste or write your code here..."
              className="flex-1 py-4 px-3 bg-transparent text-gray-200 font-mono text-sm leading-6 resize-none focus:outline-none min-h-[200px] placeholder:text-gray-600"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-foreground-secondary">
              {lineCount} lines | {language}
            </span>
            {error && (
              <span className="text-xs text-error">{error}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-secondary mr-2">
              Cmd+Enter to save
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground border border-border rounded-lg hover:bg-surface-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!code.trim()}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {initialSnippet ? 'Update Snippet' : 'Add Snippet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
