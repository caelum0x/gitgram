'use client'

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  ChangeEvent,
  TextareaHTMLAttributes,
} from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '@/services/api'
import { getErrorMessage } from '@/utils/error'
import {
  HashtagSuggestions,
  MentionSuggestions,
  EmojiPicker,
  DropZone,
} from '@/components/composer'
import RepoLinker from '@/components/composer/RepoLinker'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedRepo {
  owner: string
  name: string
  fullName: string
  description?: string
  stars?: number
  language?: string
}

type Audience = 'public' | 'followers'

interface CreatePostPayload {
  content: string
  mediaUrls?: string[]
  videoUrl?: string
  repoFullName?: string
  audience: Audience
  scheduledAt?: string
}

interface CreatePostResponse {
  id: string
  content: string
  createdAt: string
}

interface PostPreviewProps {
  content: string
  imagePreviewUrls: string[]
  videoUrl: string
  linkedRepo: LinkedRepo | null
  audience: Audience
  scheduledAt: Date | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHARS = 500

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertAtCursor(
  text: string,
  cursorPos: number,
  insertion: string,
): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos)
  const after = text.slice(cursorPos)

  // Replace the partial token (hashtag/mention) before the cursor
  const trimmedBefore = before.replace(/(^|\s)[#@]\w*$/, (match) => {
    const prefix = match.match(/^(\s)/)?.[1] ?? ''
    return prefix
  })

  const newText = `${trimmedBefore}${insertion} ${after}`
  const newCursor = trimmedBefore.length + insertion.length + 1
  return { newText, newCursor }
}

/** Map a create/schedule failure to a user-friendly message. */
function getCreatePostError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status
  const message = getErrorMessage(err)
  if (status === 403 && /premium|subscription/i.test(message)) {
    return 'Scheduling posts requires a premium subscription. Upgrade to schedule, or post now instead.'
  }
  return message || 'Failed to create post. Please try again.'
}

function formatScheduleLabel(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// PostPreview
// ---------------------------------------------------------------------------

function PostPreview({
  content,
  imagePreviewUrls,
  videoUrl,
  linkedRepo,
  audience,
  scheduledAt,
}: PostPreviewProps) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">You</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {scheduledAt ? `Scheduled: ${formatScheduleLabel(scheduledAt)}` : 'Just now'} &middot;{' '}
            {audience === 'public' ? 'Public' : 'Followers only'}
          </p>
        </div>
      </div>

      {content && (
        <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
          {content.split(/(\s)/).map((token, i) => {
            if (token.startsWith('#'))
              return (
                <span key={i} className="text-blue-500 hover:underline cursor-pointer">
                  {token}
                </span>
              )
            if (token.startsWith('@'))
              return (
                <span key={i} className="text-blue-500 hover:underline cursor-pointer">
                  {token}
                </span>
              )
            return token
          })}
        </p>
      )}

      {imagePreviewUrls.length > 0 && (
        <div
          className={`grid gap-1 ${
            imagePreviewUrls.length === 1
              ? 'grid-cols-1'
              : imagePreviewUrls.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-3'
          }`}
        >
          {imagePreviewUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Attachment ${i + 1}`}
              className="w-full aspect-square object-cover rounded-lg"
            />
          ))}
        </div>
      )}

      {videoUrl && !imagePreviewUrls.length && (
        <div className="rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
          <p className="text-xs text-neutral-400">Video: {videoUrl}</p>
        </div>
      )}

      {linkedRepo && (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800 flex items-start gap-2">
          <svg
            className="w-4 h-4 mt-0.5 flex-shrink-0 text-neutral-500"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {linkedRepo.fullName}
            </p>
            {linkedRepo.description && (
              <p className="text-xs text-neutral-500 truncate">{linkedRepo.description}</p>
            )}
          </div>
        </div>
      )}

      {!content && !imagePreviewUrls.length && !videoUrl && !linkedRepo && (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 italic">
          Start typing to see a preview…
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreatePage() {
  const [content, setContent] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [linkedRepo, setLinkedRepo] = useState<LinkedRepo | null>(null)
  const [showRepoLinker, setShowRepoLinker] = useState(false)
  const [audience, setAudience] = useState<Audience>('public')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [content])

  // Build object URLs for image previews
  useEffect(() => {
    const urls = imageFiles.map((f) => URL.createObjectURL(f))
    setImagePreviewUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [imageFiles])

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  const mutation = useMutation<CreatePostResponse, Error, CreatePostPayload>({
    mutationFn: async (payload) => {
      let uploadedImageUrls: string[] = []

      if (imageFiles.length > 0) {
        const form = new FormData()
        imageFiles.forEach((f) => form.append('files', f))
        const { data } = await api.post<{ urls: string[] }>('/v1/media/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        uploadedImageUrls = data.urls
      }

      // Scheduled posts MUST go to the dedicated scheduling endpoint. The
      // immediate-post endpoint (/v1/posts) ignores `scheduledAt` and would
      // publish straight away, making the "Post scheduled!" screen misleading.
      if (payload.scheduledAt) {
        const { data } = await api.post<{ scheduledPost: { id: string } }>(
          '/v1/scheduled-posts',
          {
            content: payload.content,
            mediaUrls: uploadedImageUrls,
            scheduledFor: payload.scheduledAt,
          },
        )
        return {
          id: data.scheduledPost?.id ?? '',
          content: payload.content,
          createdAt: payload.scheduledAt,
        }
      }

      const { data } = await api.post<CreatePostResponse>('/v1/posts', {
        ...payload,
        mediaUrls: uploadedImageUrls,
      })
      return data
    },
    onError: (err) => {
      setErrorMsg(getCreatePostError(err))
    },
  })

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleContentChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    if (val.length <= MAX_CHARS) {
      setContent(val)
      setCursorPos(e.target.selectionStart ?? val.length)
    }
  }, [])

  const handleTextareaClick = useCallback(() => {
    setCursorPos(textareaRef.current?.selectionStart ?? 0)
  }, [])

  const handleTextareaKeyUp = useCallback(() => {
    setCursorPos(textareaRef.current?.selectionStart ?? 0)
  }, [])

  const handleHashtagInsert = useCallback(
    (tag: string) => {
      const hashtag = tag.startsWith('#') ? tag : `#${tag}`
      const { newText, newCursor } = insertAtCursor(content, cursorPos, hashtag)
      setContent(newText)
      setCursorPos(newCursor)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newCursor, newCursor)
        }
      })
    },
    [content, cursorPos],
  )

  const handleMentionInsert = useCallback(
    (username: string) => {
      const mention = username.startsWith('@') ? username : `@${username}`
      const { newText, newCursor } = insertAtCursor(content, cursorPos, mention)
      setContent(newText)
      setCursorPos(newCursor)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newCursor, newCursor)
        }
      })
    },
    [content, cursorPos],
  )

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const before = content.slice(0, cursorPos)
      const after = content.slice(cursorPos)
      const newText = `${before}${emoji}${after}`
      if (newText.length <= MAX_CHARS) {
        const newCursor = cursorPos + emoji.length
        setContent(newText)
        setCursorPos(newCursor)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(newCursor, newCursor)
          }
        })
      }
    },
    [content, cursorPos],
  )

  const handleImagesDrop = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    setImageFiles((prev) => {
      const combined = [...prev, ...imageFiles]
      return combined.slice(0, 10)
    })
  }, [])

  const removeImage = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleScheduleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setScheduledAt(val ? new Date(val) : null)
  }, [])

  const handleSubmit = useCallback(() => {
    setErrorMsg(null)
    if (!content.trim() && imageFiles.length === 0 && !videoUrl.trim()) {
      setErrorMsg('Please add some text, media, or a video URL before posting.')
      return
    }

    // When scheduling is toggled on, a future date/time is required — otherwise
    // the post would publish immediately despite the "Schedule post" label.
    if (scheduleEnabled) {
      if (!scheduledAt) {
        setErrorMsg('Please pick a date and time to schedule this post.')
        return
      }
      if (scheduledAt.getTime() <= Date.now()) {
        setErrorMsg('Scheduled time must be in the future.')
        return
      }
    }

    const payload: CreatePostPayload = {
      content: content.trim(),
      videoUrl: videoUrl.trim() || undefined,
      repoFullName: linkedRepo?.fullName,
      audience,
      scheduledAt: scheduleEnabled ? scheduledAt?.toISOString() : undefined,
    }

    mutation.mutate(payload)
  }, [content, imageFiles, videoUrl, linkedRepo, audience, scheduleEnabled, scheduledAt, mutation])

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const remaining = MAX_CHARS - content.length
  const isOverLimit = remaining < 0
  const isSubmitDisabled =
    mutation.isPending ||
    isOverLimit ||
    (!content.trim() && imageFiles.length === 0 && !videoUrl.trim())

  // Min datetime for schedule input (now + 5 minutes)
  const minSchedule = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (mutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {scheduledAt ? 'Post scheduled!' : 'Post published!'}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {scheduledAt
              ? `Your post will be published on ${formatScheduleLabel(scheduledAt)}.`
              : 'Your post is now live.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setContent('')
              setImageFiles([])
              setVideoUrl('')
              setLinkedRepo(null)
              setScheduleEnabled(false)
              setScheduledAt(null)
              setAudience('public')
              setShowPreview(false)
              mutation.reset()
            }}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Create another post
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Create post</h1>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-400"
          >
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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

        {/* Composer card */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
          {/* Text area */}
          <div className="relative px-4 pt-4 pb-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onClick={handleTextareaClick}
              onKeyUp={handleTextareaKeyUp}
              placeholder="What's on your mind? Use # for hashtags and @ for mentions…"
              rows={4}
              className="w-full resize-none bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 text-sm leading-relaxed focus:outline-none"
              aria-label="Post content"
              aria-describedby="char-counter"
            />

            {/* Inline hashtag suggestions */}
            <div className="relative">
              <HashtagSuggestions
                value={content}
                cursorPosition={cursorPos}
                onInsert={handleHashtagInsert}
              />
            </div>

            {/* Inline mention suggestions */}
            <div className="relative">
              <MentionSuggestions
                value={content}
                cursorPosition={cursorPos}
                onInsert={handleMentionInsert}
              />
            </div>
          </div>

          {/* Image previews */}
          {imagePreviewUrls.length > 0 && (
            <div className="px-4 pb-3">
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
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      aria-label={`Remove image ${i + 1}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked repo badge */}
          {linkedRepo && (
            <div className="px-4 pb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm max-w-full">
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                </svg>
                <span className="truncate text-neutral-700 dark:text-neutral-300 font-medium">
                  {linkedRepo.fullName}
                </span>
                <button
                  type="button"
                  onClick={() => setLinkedRepo(null)}
                  className="ml-1 flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  aria-label="Remove repository link"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1">
              {/* Image upload via DropZone */}
              <DropZone
                onFilesDropped={handleImagesDrop}
                accept={['image/jpeg', 'image/png', 'image/gif', 'image/webp']}
                maxFiles={10}
                disabled={imageFiles.length >= 10}
                ariaLabel="Upload images"
                className="inline-flex"
              >
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                  disabled={imageFiles.length >= 10}
                  aria-label="Attach image"
                  title="Attach image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
              </DropZone>

              {/* Emoji picker */}
              <EmojiPicker onSelect={handleEmojiSelect} />

              {/* Repo linker */}
              <button
                type="button"
                onClick={() => setShowRepoLinker(true)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Link repository"
                title="Link a repository"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                </svg>
              </button>
            </div>

            {/* Char counter */}
            <span
              id="char-counter"
              className={`text-xs tabular-nums ${
                isOverLimit
                  ? 'text-red-500'
                  : remaining <= 50
                  ? 'text-amber-500'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`}
              aria-live="polite"
            >
              {remaining}
            </span>
          </div>
        </div>

        {/* Video URL input */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 space-y-1">
          <label
            htmlFor="video-url"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Video URL (optional)
          </label>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <input
              id="video-url"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 text-sm bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none"
              aria-label="Video URL"
            />
            {videoUrl && (
              <button
                type="button"
                onClick={() => setVideoUrl('')}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                aria-label="Clear video URL"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Audience selector */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Audience
          </p>
          <div className="flex gap-2">
            {(['public', 'followers'] as Audience[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAudience(opt)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  audience === opt
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
                aria-pressed={audience === opt}
              >
                {opt === 'public' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
                {opt === 'public' ? 'Public' : 'Followers only'}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule toggle */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {scheduleEnabled ? 'Scheduled' : 'Post now'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={scheduleEnabled}
              onClick={() => {
                setScheduleEnabled((v) => !v)
                if (scheduleEnabled) setScheduledAt(null)
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                scheduleEnabled
                  ? 'bg-blue-600'
                  : 'bg-neutral-200 dark:bg-neutral-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {scheduleEnabled && (
            <div>
              <label
                htmlFor="schedule-datetime"
                className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1"
              >
                Pick date and time
              </label>
              <input
                id="schedule-datetime"
                type="datetime-local"
                min={minSchedule}
                value={scheduledAt ? scheduledAt.toISOString().slice(0, 16) : ''}
                onChange={handleScheduleChange}
                className="w-full text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Schedule date and time"
              />
            </div>
          )}
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 px-1">
              Preview
            </p>
            <PostPreview
              content={content}
              imagePreviewUrls={imagePreviewUrls}
              videoUrl={videoUrl}
              linkedRepo={linkedRepo}
              audience={audience}
              scheduledAt={scheduledAt}
            />
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          aria-label={scheduleEnabled ? 'Schedule post' : 'Publish post'}
        >
          {mutation.isPending ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {scheduleEnabled ? 'Scheduling…' : 'Publishing…'}
            </>
          ) : scheduleEnabled ? (
            'Schedule post'
          ) : (
            'Publish now'
          )}
        </button>
      </div>

      {/* Repo linker modal */}
      {showRepoLinker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Link a repository"
        >
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Link a repository
              </h2>
              <button
                type="button"
                onClick={() => setShowRepoLinker(false)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Close repository picker"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <RepoLinker
              onSelect={(repo) => {
                setLinkedRepo(repo)
                setShowRepoLinker(false)
              }}
              onClose={() => setShowRepoLinker(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
