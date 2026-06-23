'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  ChangeEvent,
} from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '@/services/api'
import { snippetService } from '@/services/snippetService'
import { useAuthStore } from '@/store/authStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostType = 'post' | 'snippet' | 'repo'
type Privacy = 'public' | 'followers' | 'private'

interface RepoPreview {
  fullName: string
  description: string
  stars: number
  language: string
  htmlUrl: string
}

interface CreatePostModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface PostPayload {
  content: string
  mediaUrls?: string[]
  repoFullName?: string
  audience: Privacy
}

interface PostResponse {
  id: string
  content: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHARS = 3000
const SUPPORTED_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'bash',
  'sql',
  'html',
  'css',
  'json',
  'yaml',
  'markdown',
  'other',
] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function highlightHashtags(text: string): JSX.Element[] {
  const parts = text.split(/(\s)/)
  return parts.map((part, i) => {
    if (/^#\w+$/.test(part)) {
      return (
        <span key={i} className="text-purple-400">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function isValidGitHubUrl(url: string): boolean {
  return /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(url.trim())
}

function extractRepoPath(url: string): string {
  const match = url.trim().match(/github\.com\/([\w.-]+\/[\w.-]+)/)
  return match ? match[1] : ''
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  active: PostType
  onChange: (t: PostType) => void
}

function TabBar({ active, onChange }: TabBarProps) {
  const tabs: { id: PostType; label: string }[] = [
    { id: 'post', label: 'Post' },
    { id: 'snippet', label: 'Code Snippet' },
    { id: 'repo', label: 'Share Repo' },
  ]

  return (
    <div className="flex border-b border-[var(--border)]">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            active === id
              ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post composer tab
// ---------------------------------------------------------------------------

interface PostTabProps {
  content: string
  onContentChange: (val: string) => void
  repoTag: string
  onRepoTagChange: (val: string) => void
  privacy: Privacy
  onPrivacyChange: (p: Privacy) => void
  imageFiles: File[]
  imagePreviewUrls: string[]
  onImagesAdd: (files: File[]) => void
  onImageRemove: (index: number) => void
}

function PostTab({
  content,
  onContentChange,
  repoTag,
  onRepoTagChange,
  privacy,
  onPrivacyChange,
  imageFiles,
  imagePreviewUrls,
  onImagesAdd,
  onImageRemove,
}: PostTabProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  const remaining = MAX_CHARS - content.length
  const isOverLimit = remaining < 0

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [content])

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      )
      onImagesAdd(files)
      e.target.value = ''
    },
    [onImagesAdd],
  )

  const privacyOptions: { value: Privacy; label: string }[] = [
    { value: 'public', label: 'Public' },
    { value: 'followers', label: 'Followers' },
    { value: 'private', label: 'Private' },
  ]

  return (
    <div className="space-y-4">
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-purple-500 flex-shrink-0 overflow-hidden">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {user?.fullName ?? user?.username ?? 'You'}
          </p>
          <p className="text-xs text-[var(--foreground-secondary)]">@{user?.username ?? 'you'}</p>
        </div>
      </div>

      {/* Textarea with overlay highlights */}
      <div className="relative">
        {/* Highlight layer — rendered behind the textarea */}
        <div
          aria-hidden="true"
          className="absolute inset-0 text-sm leading-relaxed whitespace-pre-wrap break-words px-0 py-0 pointer-events-none select-none text-transparent"
        >
          {highlightHashtags(content + ' ')}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) {
              onContentChange(e.target.value)
            }
          }}
          placeholder="What's on your mind? Use #hashtags to tag topics..."
          rows={4}
          className="w-full resize-none bg-transparent text-[var(--foreground)] placeholder-[var(--foreground-secondary)] text-sm leading-relaxed focus:outline-none caret-[var(--primary)]"
          aria-label="Post content"
        />
      </div>

      {/* Image previews */}
      {imagePreviewUrls.length > 0 && (
        <div
          className={`grid gap-1.5 ${
            imagePreviewUrls.length === 1
              ? 'grid-cols-1'
              : imagePreviewUrls.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-3'
          }`}
        >
          {imagePreviewUrls.map((url, i) => (
            <div key={i} className="relative group aspect-square">
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => onImageRemove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove image ${i + 1}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Repo tag */}
      <div>
        <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
          Repository tag (optional)
        </label>
        <input
          type="text"
          value={repoTag}
          onChange={(e) => onRepoTagChange(e.target.value)}
          placeholder="@owner/repo-name"
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Privacy */}
      <div>
        <p className="text-xs text-[var(--foreground-secondary)] mb-2">Privacy</p>
        <div className="flex gap-2">
          {privacyOptions.map(({ value, label }) => (
            <label
              key={value}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                privacy === value
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                  : 'border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--primary)]/50'
              }`}
            >
              <input
                type="radio"
                name="privacy"
                value={value}
                checked={privacy === value}
                onChange={() => onPrivacyChange(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
        <div className="flex items-center gap-1">
          {/* Image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={handleFileInput}
            aria-label="Upload images"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageFiles.length >= 10}
            className="p-1.5 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors disabled:opacity-40"
            title="Attach image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>

        {/* Char count */}
        <span
          className={`text-xs tabular-nums ${
            isOverLimit
              ? 'text-[var(--error)]'
              : remaining <= 100
              ? 'text-[var(--warning)]'
              : 'text-[var(--foreground-secondary)]'
          }`}
        >
          {remaining}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Code Snippet tab
// ---------------------------------------------------------------------------

interface SnippetTabProps {
  title: string
  onTitleChange: (val: string) => void
  language: SupportedLanguage
  onLanguageChange: (lang: SupportedLanguage) => void
  code: string
  onCodeChange: (val: string) => void
  showPreview: boolean
  onTogglePreview: () => void
}

function SnippetTab({
  title,
  onTitleChange,
  language,
  onLanguageChange,
  code,
  onCodeChange,
  showPreview,
  onTogglePreview,
}: SnippetTabProps) {
  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Binary search in TypeScript"
          maxLength={120}
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Language */}
      <div>
        <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
          Language
        </label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang.charAt(0).toUpperCase() + lang.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Code editor / preview toggle */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[var(--foreground-secondary)]">Code</label>
          <button
            type="button"
            onClick={onTogglePreview}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>

        {showPreview ? (
          <div className="rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] overflow-x-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <span className="text-xs text-[var(--foreground-secondary)] font-mono">
                {language}
              </span>
              {title && (
                <span className="text-xs text-[var(--foreground-secondary)] truncate max-w-[60%]">
                  {title}
                </span>
              )}
            </div>
            <pre className="p-4 text-sm text-[var(--foreground)] font-mono whitespace-pre leading-relaxed overflow-x-auto">
              <code>{code || '// your code here'}</code>
            </pre>
          </div>
        ) : (
          <textarea
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={`// Paste or type your ${language} code here`}
            rows={10}
            className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] font-mono resize-y"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Share Repo tab
// ---------------------------------------------------------------------------

interface RepoTabProps {
  repoUrl: string
  onRepoUrlChange: (val: string) => void
  repoPreview: RepoPreview | null
  previewLoading: boolean
  previewError: string | null
  comment: string
  onCommentChange: (val: string) => void
}

function RepoTab({
  repoUrl,
  onRepoUrlChange,
  repoPreview,
  previewLoading,
  previewError,
  comment,
  onCommentChange,
}: RepoTabProps) {
  return (
    <div className="space-y-4">
      {/* GitHub URL */}
      <div>
        <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
          GitHub repository URL
        </label>
        <input
          type="url"
          value={repoUrl}
          onChange={(e) => onRepoUrlChange(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Repo preview card */}
      {previewLoading && (
        <div className="flex items-center gap-2 text-xs text-[var(--foreground-secondary)]">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading repository info…
        </div>
      )}

      {previewError && !previewLoading && (
        <p className="text-xs text-[var(--error)]">{previewError}</p>
      )}

      {repoPreview && !previewLoading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--foreground-secondary)]"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--primary)] truncate">
                {repoPreview.fullName}
              </p>
              {repoPreview.description && (
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 line-clamp-2">
                  {repoPreview.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--foreground-secondary)]">
            {repoPreview.language && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] inline-block" />
                {repoPreview.language}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
              </svg>
              {repoPreview.stars.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Optional comment */}
      <div>
        <label className="block text-xs text-[var(--foreground-secondary)] mb-1">
          Add a comment (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="What's interesting about this repo?"
          rows={3}
          maxLength={500}
          className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] resize-none"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function CreatePostModal({ isOpen, onClose, onSuccess }: CreatePostModalProps) {
  const [activeTab, setActiveTab] = useState<PostType>('post')

  // Post tab state
  const [postContent, setPostContent] = useState('')
  const [repoTag, setRepoTag] = useState('')
  const [privacy, setPrivacy] = useState<Privacy>('public')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])

  // Snippet tab state
  const [snippetTitle, setSnippetTitle] = useState('')
  const [snippetLanguage, setSnippetLanguage] = useState<SupportedLanguage>('typescript')
  const [snippetCode, setSnippetCode] = useState('')
  const [showSnippetPreview, setShowSnippetPreview] = useState(false)

  // Repo tab state
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPreview, setRepoPreview] = useState<RepoPreview | null>(null)
  const [repoPreviewLoading, setRepoPreviewLoading] = useState(false)
  const [repoPreviewError, setRepoPreviewError] = useState<string | null>(null)
  const [repoComment, setRepoComment] = useState('')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Build object URLs for image previews
  useEffect(() => {
    const urls = imageFiles.map((f) => URL.createObjectURL(f))
    setImagePreviewUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [imageFiles])

  // Fetch GitHub repo preview when URL is valid
  useEffect(() => {
    if (!isValidGitHubUrl(repoUrl)) {
      setRepoPreview(null)
      setRepoPreviewError(null)
      return
    }

    const repoPath = extractRepoPath(repoUrl)
    if (!repoPath) return

    let cancelled = false
    setRepoPreviewLoading(true)
    setRepoPreviewError(null)

    fetch(`https://api.github.com/repos/${repoPath}`)
      .then((r) => {
        if (!r.ok) throw new Error('Repository not found')
        return r.json() as Promise<{
          full_name: string
          description: string | null
          stargazers_count: number
          language: string | null
          html_url: string
        }>
      })
      .then((data) => {
        if (cancelled) return
        setRepoPreview({
          fullName: data.full_name,
          description: data.description ?? '',
          stars: data.stargazers_count,
          language: data.language ?? '',
          htmlUrl: data.html_url,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load repository'
        setRepoPreviewError(msg)
        setRepoPreview(null)
      })
      .finally(() => {
        if (!cancelled) setRepoPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repoUrl])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleImagesAdd = useCallback((files: File[]) => {
    setImageFiles((prev) => [...prev, ...files].slice(0, 10))
  }, [])

  const handleImageRemove = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const postMutation = useMutation<PostResponse, Error, PostPayload>({
    mutationFn: async (payload) => {
      let uploadedUrls: string[] = []

      if (imageFiles.length > 0) {
        const form = new FormData()
        imageFiles.forEach((f) => form.append('files', f))
        const { data } = await api.post<{ urls: string[] }>('/v1/media/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploadedUrls = data.urls
      }

      const { data } = await api.post<PostResponse>('/v1/posts', {
        ...payload,
        mediaUrls: uploadedUrls,
      })
      return data
    },
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
    onError: (err) => {
      setErrorMsg(err.message || 'Failed to create post.')
    },
  })

  const snippetMutation = useMutation({
    mutationFn: () =>
      snippetService.createSnippet({
        title: snippetTitle.trim() || undefined,
        code: snippetCode,
        language: snippetLanguage,
      }),
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create snippet.'
      setErrorMsg(msg)
    },
  })

  const repoPostMutation = useMutation<PostResponse, Error>({
    mutationFn: async () => {
      const { data } = await api.post<PostResponse>('/v1/posts', {
        content: repoComment.trim(),
        repoFullName: repoPreview?.fullName,
        audience: 'public',
      })
      return data
    },
    onSuccess: () => {
      onSuccess?.()
      handleClose()
    },
    onError: (err) => {
      setErrorMsg(err.message || 'Failed to share repository.')
    },
  })

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(() => {
    setErrorMsg(null)

    if (activeTab === 'post') {
      if (!postContent.trim() && imageFiles.length === 0) {
        setErrorMsg('Please add some text or an image before posting.')
        return
      }
      const repoFullName = repoTag.trim().replace(/^@/, '') || undefined
      postMutation.mutate({ content: postContent.trim(), repoFullName, audience: privacy })
      return
    }

    if (activeTab === 'snippet') {
      if (!snippetCode.trim()) {
        setErrorMsg('Please add some code before sharing.')
        return
      }
      snippetMutation.mutate()
      return
    }

    if (activeTab === 'repo') {
      if (!repoPreview) {
        setErrorMsg('Please enter a valid GitHub repository URL.')
        return
      }
      repoPostMutation.mutate()
    }
  }, [
    activeTab,
    postContent,
    imageFiles,
    repoTag,
    privacy,
    snippetCode,
    repoPreview,
    postMutation,
    snippetMutation,
    repoPostMutation,
  ])

  const handleClose = useCallback(() => {
    setPostContent('')
    setRepoTag('')
    setPrivacy('public')
    setImageFiles([])
    setSnippetTitle('')
    setSnippetCode('')
    setShowSnippetPreview(false)
    setRepoUrl('')
    setRepoPreview(null)
    setRepoPreviewError(null)
    setRepoComment('')
    setErrorMsg(null)
    setActiveTab('post')
    onClose()
  }, [onClose])

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const isPending =
    postMutation.isPending || snippetMutation.isPending || repoPostMutation.isPending

  const isSubmitDisabled =
    isPending ||
    (activeTab === 'post' && postContent.length > MAX_CHARS) ||
    (activeTab === 'snippet' && !snippetCode.trim()) ||
    (activeTab === 'repo' && !repoPreview)

  const submitLabel = isPending
    ? 'Publishing…'
    : activeTab === 'repo'
    ? 'Share Repo'
    : activeTab === 'snippet'
    ? 'Share Snippet'
    : 'Publish'

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 flex-shrink-0">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Create</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex-shrink-0">
          <TabBar active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Error banner */}
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 text-sm text-[var(--error)]"
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'post' && (
            <PostTab
              content={postContent}
              onContentChange={setPostContent}
              repoTag={repoTag}
              onRepoTagChange={setRepoTag}
              privacy={privacy}
              onPrivacyChange={setPrivacy}
              imageFiles={imageFiles}
              imagePreviewUrls={imagePreviewUrls}
              onImagesAdd={handleImagesAdd}
              onImageRemove={handleImageRemove}
            />
          )}

          {activeTab === 'snippet' && (
            <SnippetTab
              title={snippetTitle}
              onTitleChange={setSnippetTitle}
              language={snippetLanguage}
              onLanguageChange={setSnippetLanguage}
              code={snippetCode}
              onCodeChange={setSnippetCode}
              showPreview={showSnippetPreview}
              onTogglePreview={() => setShowSnippetPreview((v) => !v)}
            />
          )}

          {activeTab === 'repo' && (
            <RepoTab
              repoUrl={repoUrl}
              onRepoUrlChange={setRepoUrl}
              repoPreview={repoPreview}
              previewLoading={repoPreviewLoading}
              previewError={repoPreviewError}
              comment={repoComment}
              onCommentChange={setRepoComment}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {isPending && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreatePostModal
