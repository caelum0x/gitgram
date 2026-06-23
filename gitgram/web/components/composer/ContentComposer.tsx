'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import { postService } from '@/services/postService'
import { reelService } from '@/services/reelService'
import { storyService } from '@/services/storyService'
import { draftService } from '@/services/draftService'
import api from '@/services/api'
import MentionInput from '@/components/MentionInput'
import MediaUploader from './MediaUploader'
import CodeSnippetEditor from './CodeSnippetEditor'
import RepoLinker from './RepoLinker'
import SchedulePicker from './SchedulePicker'
import DraftManager from './DraftManager'
import MediaPreview from './MediaPreview'

export type ContentType = 'POST' | 'REEL' | 'STORY'

export interface CodeSnippet {
  code: string
  language: string
  title?: string
}

export interface LinkedRepo {
  owner: string
  name: string
  fullName: string
  description?: string
  stars?: number
  language?: string
}

export interface CheckpointAttachment {
  checkpointId: string
  projectId: string
  message: string
  files: string[]
  createdAt: string
}

export interface ComposerState {
  contentType: ContentType
  content: string
  mediaFiles: File[]
  mediaPreviews: string[]
  videoFile: File | null
  videoPreview: string | null
  videoThumbnail: string | null
  codeSnippet: CodeSnippet | null
  linkedRepo: LinkedRepo | null
  checkpoint: CheckpointAttachment | null
  hashtags: string[]
  scheduledAt: Date | null
  isDraft: boolean
  draftId: string | null
}

const initialState: ComposerState = {
  contentType: 'POST',
  content: '',
  mediaFiles: [],
  mediaPreviews: [],
  videoFile: null,
  videoPreview: null,
  videoThumbnail: null,
  codeSnippet: null,
  linkedRepo: null,
  checkpoint: null,
  hashtags: [],
  scheduledAt: null,
  isDraft: false,
  draftId: null,
}

const MAX_IMAGES = 10
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB
const MAX_CONTENT_LENGTH = 2200
const MAX_STORY_CONTENT_LENGTH = 500

interface ContentComposerProps {
  initialContentType?: ContentType
}

export default function ContentComposer({ initialContentType }: ContentComposerProps = {}) {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const { showToast } = useToast()

  const [state, setState] = useState<ComposerState>({
    ...initialState,
    contentType: initialContentType || 'POST',
  })
  const [submitting, setSubmitting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showCodeEditor, setShowCodeEditor] = useState(false)
  const [showRepoLinker, setShowRepoLinker] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | null>(null)

  // Auto-save draft every 30 seconds if content exists
  useEffect(() => {
    if (state.content.trim() && !state.isDraft) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      const timer = setTimeout(() => {
        handleAutoSave()
      }, 30000)
      setAutoSaveTimer(timer)
    }
    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
    }
  }, [state.content])

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  const updateState = useCallback((updates: Partial<ComposerState>) => {
    setState(prev => ({ ...prev, ...updates }))
    setErrors([])
  }, [])

  // --- Content Type Switching ---
  const switchContentType = (type: ContentType) => {
    // Clear media if switching between incompatible types
    if (type === 'REEL' && state.mediaFiles.length > 0) {
      // Keep only video or clear
      updateState({ contentType: type, mediaFiles: [], mediaPreviews: [] })
    } else if (type === 'STORY') {
      updateState({
        contentType: type,
        codeSnippet: null,
        linkedRepo: null,
        scheduledAt: null,
      })
    } else {
      updateState({ contentType: type })
    }
  }

  // --- Media Management ---
  const handleImagesSelected = (files: File[]) => {
    const validFiles: File[] = []
    const previews: string[] = []
    const newErrors: string[] = []

    const totalFiles = state.mediaFiles.length + files.length
    if (totalFiles > MAX_IMAGES) {
      newErrors.push(`Maximum ${MAX_IMAGES} images allowed. You can add ${MAX_IMAGES - state.mediaFiles.length} more.`)
      files = files.slice(0, MAX_IMAGES - state.mediaFiles.length)
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        newErrors.push(`${file.name} is not an image file`)
        continue
      }
      if (file.size > MAX_IMAGE_SIZE) {
        newErrors.push(`${file.name} exceeds 10MB limit`)
        continue
      }
      validFiles.push(file)
      previews.push(URL.createObjectURL(file))
    }

    if (newErrors.length > 0) setErrors(newErrors)

    updateState({
      mediaFiles: [...state.mediaFiles, ...validFiles],
      mediaPreviews: [...state.mediaPreviews, ...previews],
    })
  }

  const handleVideoSelected = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setErrors(['Please select a video file'])
      return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setErrors(['Video file exceeds 100MB limit'])
      return
    }

    const preview = URL.createObjectURL(file)

    // Generate thumbnail from video
    const video = document.createElement('video')
    video.src = preview
    video.crossOrigin = 'anonymous'
    video.addEventListener('loadeddata', () => {
      video.currentTime = 1 // Seek to 1 second
    })
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
        updateState({
          videoFile: file,
          videoPreview: preview,
          videoThumbnail: thumbnail,
          mediaFiles: [],
          mediaPreviews: [],
        })
      }
    })

    updateState({
      videoFile: file,
      videoPreview: preview,
    })
  }

  const removeImage = (index: number) => {
    const newFiles = [...state.mediaFiles]
    const newPreviews = [...state.mediaPreviews]

    // Revoke the object URL
    URL.revokeObjectURL(newPreviews[index])

    newFiles.splice(index, 1)
    newPreviews.splice(index, 1)

    updateState({
      mediaFiles: newFiles,
      mediaPreviews: newPreviews,
    })
  }

  const removeVideo = () => {
    if (state.videoPreview) URL.revokeObjectURL(state.videoPreview)
    updateState({
      videoFile: null,
      videoPreview: null,
      videoThumbnail: null,
    })
  }

  // --- Code Snippet ---
  const handleCodeSnippetSave = (snippet: CodeSnippet) => {
    updateState({ codeSnippet: snippet })
    setShowCodeEditor(false)
  }

  const removeCodeSnippet = () => {
    updateState({ codeSnippet: null })
  }

  // --- Repository Linking ---
  const handleRepoLinked = (repo: LinkedRepo) => {
    updateState({ linkedRepo: repo })
    setShowRepoLinker(false)
  }

  const removeLinkedRepo = () => {
    updateState({ linkedRepo: null })
  }

  // --- Checkpoint Attachment ---
  const [showCheckpointPicker, setShowCheckpointPicker] = useState(false)
  const [checkpointSearch, setCheckpointSearch] = useState('')
  const [checkpointResults, setCheckpointResults] = useState<CheckpointAttachment[]>([])
  const [searchingCheckpoints, setSearchingCheckpoints] = useState(false)

  const searchCheckpoints = async (query: string) => {
    if (!query.trim()) {
      setCheckpointResults([])
      return
    }
    setSearchingCheckpoints(true)
    try {
      const { data } = await api.get('/v1/aitm/checkpoints/search', { params: { q: query } })
      setCheckpointResults(Array.isArray(data) ? data : data.checkpoints || [])
    } catch {
      setCheckpointResults([])
    } finally {
      setSearchingCheckpoints(false)
    }
  }

  const attachCheckpoint = (cp: CheckpointAttachment) => {
    updateState({ checkpoint: cp })
    setShowCheckpointPicker(false)
    setCheckpointSearch('')
    setCheckpointResults([])
  }

  const removeCheckpoint = () => {
    updateState({ checkpoint: null })
  }

  // --- Scheduling ---
  const handleScheduleSet = (date: Date | null) => {
    updateState({ scheduledAt: date })
    setShowScheduler(false)
  }

  // --- Draft Management ---
  const handleAutoSave = async () => {
    if (!state.content.trim()) return

    try {
      const mediaUrls = state.mediaPreviews
      if (state.draftId) {
        await draftService.updateDraft(state.draftId, state.content, mediaUrls)
      } else {
        const draft = await draftService.createDraft(state.content, mediaUrls)
        updateState({ draftId: draft.id, isDraft: true })
      }
    } catch {
      // Silent fail for auto-save
    }
  }

  const handleSaveDraft = async () => {
    if (!state.content.trim() && state.mediaFiles.length === 0) {
      showToast('Add some content before saving a draft', 'warning')
      return
    }

    setSavingDraft(true)
    try {
      const mediaUrls = state.mediaPreviews
      if (state.draftId) {
        await draftService.updateDraft(state.draftId, state.content, mediaUrls)
      } else {
        const draft = await draftService.createDraft(state.content, mediaUrls)
        updateState({ draftId: draft.id, isDraft: true })
      }
      showToast('Draft saved', 'success')
    } catch {
      showToast('Failed to save draft', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleLoadDraft = (draft: { id: string; content: string | null; mediaUrls: string[] }) => {
    updateState({
      content: draft.content || '',
      draftId: draft.id,
      isDraft: true,
      mediaPreviews: draft.mediaUrls || [],
    })
    setShowDrafts(false)
    showToast('Draft loaded', 'info')
  }

  // --- Extract Hashtags ---
  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#(\w+)/g)
    return matches ? matches.map(tag => tag.substring(1)) : []
  }

  // --- Validation ---
  const validate = (): string[] => {
    const errs: string[] = []
    const maxLen = state.contentType === 'STORY' ? MAX_STORY_CONTENT_LENGTH : MAX_CONTENT_LENGTH

    if (state.contentType === 'REEL' && !state.videoFile) {
      errs.push('Reels require a video file')
    }

    if (state.contentType === 'STORY' && !state.content.trim() && state.mediaFiles.length === 0 && !state.videoFile) {
      errs.push('Stories need content or media')
    }

    if (state.contentType === 'POST' && !state.content.trim() && state.mediaFiles.length === 0 && !state.videoFile && !state.codeSnippet) {
      errs.push('Posts need content, media, or a code snippet')
    }

    if (state.content.length > maxLen) {
      errs.push(`Content exceeds ${maxLen} character limit`)
    }

    if (state.scheduledAt && state.scheduledAt <= new Date()) {
      errs.push('Scheduled time must be in the future')
    }

    return errs
  }

  // --- Submit ---
  const handleSubmit = async () => {
    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setSubmitting(true)
    setErrors([])

    try {
      const hashtags = extractHashtags(state.content)

      if (state.scheduledAt) {
        // Scheduled post
        await api.post('/v1/scheduled-posts', {
          content: state.content,
          scheduledFor: state.scheduledAt.toISOString(),
          mediaType: state.videoFile ? 'video' : state.mediaFiles.length > 0 ? 'image' : state.codeSnippet ? 'code' : 'text',
          hashtags,
          codeSnippet: state.codeSnippet?.code,
          language: state.codeSnippet?.language,
          repoOwner: state.linkedRepo?.owner,
          repoName: state.linkedRepo?.name,
        })
        showToast('Post scheduled successfully', 'success')
        router.push('/scheduled')
        return
      }

      if (state.contentType === 'REEL') {
        const formData = new FormData()
        if (state.videoFile) formData.append('video', state.videoFile)
        formData.append('caption', state.content)
        if (hashtags.length > 0) formData.append('hashtags', JSON.stringify(hashtags))
        if (state.linkedRepo) {
          formData.append('repoOwner', state.linkedRepo.owner)
          formData.append('repoName', state.linkedRepo.name)
        }

        await reelService.createReel(formData)
        showToast('Reel created successfully', 'success')
        router.push('/reels')
      } else if (state.contentType === 'STORY') {
        const formData = new FormData()
        if (state.content) formData.append('caption', state.content)
        if (state.mediaFiles.length > 0) {
          formData.append('media', state.mediaFiles[0])
        } else if (state.videoFile) {
          formData.append('media', state.videoFile)
        }
        formData.append(
          'mediaType',
          state.videoFile ? 'video' : state.mediaFiles.length > 0 ? 'image' : 'image'
        )

        await storyService.createStory(formData)
        showToast('Story created! Visible for 24 hours', 'success')
        router.push('/stories')
      } else {
        // Regular POST
        const formData = new FormData()
        formData.append('content', state.content)

        if (state.mediaFiles.length > 0) {
          state.mediaFiles.forEach((file) => {
            formData.append('media', file)
          })
          formData.append('mediaType', 'image')
        } else if (state.videoFile) {
          formData.append('media', state.videoFile)
          formData.append('mediaType', 'video')
        } else if (state.codeSnippet) {
          formData.append('codeSnippet', state.codeSnippet.code)
          formData.append('language', state.codeSnippet.language)
          formData.append('mediaType', 'code')
          if (state.codeSnippet.title) {
            formData.append('codeTitle', state.codeSnippet.title)
          }
        } else {
          formData.append('mediaType', 'text')
        }

        if (hashtags.length > 0) {
          formData.append('hashtags', JSON.stringify(hashtags))
        }

        if (state.linkedRepo) {
          formData.append('repoOwner', state.linkedRepo.owner)
          formData.append('repoName', state.linkedRepo.name)
        }

        // Attach checkpoint data if present
        if (state.checkpoint) {
          formData.append('checkpointId', state.checkpoint.checkpointId)
          formData.append('aitmProjectId', state.checkpoint.projectId)
          formData.append('aitmCheckpointRef', JSON.stringify({
            sha: state.checkpoint.checkpointId,
            message: state.checkpoint.message,
            files: state.checkpoint.files,
            createdAt: state.checkpoint.createdAt,
          }))
        }

        await postService.createPost(formData)
        showToast('Post created successfully', 'success')

        // Delete draft if existed
        if (state.draftId) {
          try {
            await draftService.deleteDraft(state.draftId)
          } catch {
            // Ignore
          }
        }

        router.push('/feed')
      }
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { message?: string } }; message?: string }
      const message = axiosErr.response?.data?.message || axiosErr.message || 'Failed to create content'
      setErrors([message])
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) return null

  const maxContentLength = state.contentType === 'STORY' ? MAX_STORY_CONTENT_LENGTH : MAX_CONTENT_LENGTH
  const contentLength = state.content.length
  const hasContent = state.content.trim().length > 0
  const hasMedia = state.mediaFiles.length > 0 || state.videoFile !== null
  const hasSnippet = state.codeSnippet !== null
  const hasCheckpoint = state.checkpoint !== null
  const canSubmit = (hasContent || hasMedia || hasSnippet || hasCheckpoint) && !submitting

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Create</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDrafts(true)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-foreground-secondary hover:bg-surface transition-colors"
            >
              Drafts
            </button>
            <button
              onClick={() => router.back()}
              className="text-foreground-secondary hover:text-foreground transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Type Tabs */}
        <div className="flex gap-1 p-1 bg-surface rounded-xl mb-6">
          {(['POST', 'REEL', 'STORY'] as ContentType[]).map((type) => (
            <button
              key={type}
              onClick={() => switchContentType(type)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                state.contentType === type
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {type === 'POST' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
                {type === 'REEL' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {type === 'STORY' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {type === 'POST' ? 'Post' : type === 'REEL' ? 'Reel' : 'Story'}
              </div>
            </button>
          ))}
        </div>

        {/* Story disclaimer */}
        {state.contentType === 'STORY' && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-primary/10 rounded-lg">
            <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-primary">Stories disappear after 24 hours</span>
          </div>
        )}

        {/* User avatar + text composer */}
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <div className="flex gap-3">
            {/* User Avatar */}
            <div className="flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">
                    {user?.username?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>

            {/* Content Input */}
            <div className="flex-1 min-w-0">
              <MentionInput
                value={state.content}
                onChange={(val) => updateState({ content: val })}
                placeholder={
                  state.contentType === 'POST'
                    ? 'Share your code, progress, or thoughts... Use @mentions and #hashtags'
                    : state.contentType === 'REEL'
                    ? 'Add a caption for your reel...'
                    : 'What is on your mind? (disappears in 24h)'
                }
                maxLength={maxContentLength}
                rows={state.contentType === 'STORY' ? 3 : 5}
                onSubmit={handleSubmit}
              />

              {/* Character count bar */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex-1 h-1 bg-border rounded-full overflow-hidden mr-3">
                  <div
                    className={`h-full rounded-full transition-all ${
                      contentLength > maxContentLength
                        ? 'bg-error'
                        : contentLength > maxContentLength * 0.9
                        ? 'bg-warning'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min((contentLength / maxContentLength) * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-mono ${
                  contentLength > maxContentLength ? 'text-error' : 'text-foreground-secondary'
                }`}>
                  {contentLength}/{maxContentLength}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Media Previews */}
        {(state.mediaPreviews.length > 0 || state.videoPreview) && (
          <div className="mb-4">
            <MediaPreview
              images={state.mediaPreviews}
              videoSrc={state.videoPreview}
              videoThumbnail={state.videoThumbnail}
              onRemoveImage={removeImage}
              onRemoveVideo={removeVideo}
            />
          </div>
        )}

        {/* Code Snippet Preview */}
        {state.codeSnippet && (
          <div className="mb-4 bg-surface border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-sm font-medium text-foreground">
                  {state.codeSnippet.title || 'Code Snippet'}
                </span>
                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {state.codeSnippet.language}
                </span>
              </div>
              <button
                onClick={removeCodeSnippet}
                className="p-1 text-foreground-secondary hover:text-error transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm font-mono text-foreground bg-[#0d1117] max-h-48">
              <code>{state.codeSnippet.code}</code>
            </pre>
          </div>
        )}

        {/* Linked Repository Preview */}
        {state.linkedRepo && (
          <div className="mb-4 bg-surface border border-border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-foreground-secondary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm">{state.linkedRepo.fullName}</p>
                  {state.linkedRepo.description && (
                    <p className="text-xs text-foreground-secondary mt-0.5 line-clamp-2">{state.linkedRepo.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {state.linkedRepo.language && (
                      <span className="text-xs text-foreground-secondary">{state.linkedRepo.language}</span>
                    )}
                    {state.linkedRepo.stars !== undefined && (
                      <span className="text-xs text-foreground-secondary flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z" />
                        </svg>
                        {state.linkedRepo.stars}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={removeLinkedRepo}
                className="p-1 text-foreground-secondary hover:text-error transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Checkpoint Preview */}
        {state.checkpoint && (
          <div className="mb-4 bg-surface border border-border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm">Checkpoint Attached</p>
                  <p className="text-xs text-foreground-secondary mt-0.5 line-clamp-2">
                    {state.checkpoint.message || 'No description'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono text-foreground-secondary">
                      {state.checkpoint.checkpointId.slice(0, 12)}
                    </span>
                    {state.checkpoint.files.length > 0 && (
                      <span className="text-xs text-foreground-secondary">
                        {state.checkpoint.files.length} file{state.checkpoint.files.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={removeCheckpoint}
                className="p-1 text-foreground-secondary hover:text-error transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Scheduled Time Preview */}
        {state.scheduledAt && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-primary font-medium">
              Scheduled for {state.scheduledAt.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <button
              onClick={() => updateState({ scheduledAt: null })}
              className="ml-auto p-1 text-primary hover:text-error transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Action Bar */}
        <div className="bg-surface border border-border rounded-xl p-3 mb-4">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Image Upload - Not for REEL */}
            {state.contentType !== 'REEL' && (
              <MediaUploader
                type="image"
                onFilesSelected={handleImagesSelected}
                disabled={state.videoFile !== null}
                multiple
                maxFiles={MAX_IMAGES - state.mediaFiles.length}
              />
            )}

            {/* Video Upload */}
            <MediaUploader
              type="video"
              onFilesSelected={(files) => handleVideoSelected(files[0])}
              disabled={state.mediaFiles.length > 0}
            />

            {/* Code Snippet - Not for STORY */}
            {state.contentType !== 'STORY' && (
              <button
                onClick={() => setShowCodeEditor(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  state.codeSnippet
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground-secondary hover:bg-surface-secondary'
                }`}
                title="Add code snippet"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="hidden sm:inline">Code</span>
              </button>
            )}

            {/* Repository Link - Not for STORY */}
            {state.contentType !== 'STORY' && (
              <button
                onClick={() => setShowRepoLinker(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  state.linkedRepo
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground-secondary hover:bg-surface-secondary'
                }`}
                title="Link repository"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="hidden sm:inline">Repo</span>
              </button>
            )}

            {/* Checkpoint - Not for STORY */}
            {state.contentType !== 'STORY' && (
              <button
                onClick={() => setShowCheckpointPicker(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  state.checkpoint
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground-secondary hover:bg-surface-secondary'
                }`}
                title="Attach checkpoint"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">Checkpoint</span>
              </button>
            )}

            {/* Separator */}
            <div className="w-px h-6 bg-border mx-1" />

            {/* Schedule - Not for STORY */}
            {state.contentType !== 'STORY' && (
              <button
                onClick={() => setShowScheduler(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  state.scheduledAt
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground-secondary hover:bg-surface-secondary'
                }`}
                title="Schedule post"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">Schedule</span>
              </button>
            )}

            {/* Save Draft */}
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || (!hasContent && !hasMedia)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-surface-secondary transition-colors disabled:opacity-40"
              title="Save as draft"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span className="hidden sm:inline">{savingDraft ? 'Saving...' : 'Draft'}</span>
            </button>
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-xl">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-error flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-3 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {state.scheduledAt ? 'Scheduling...' : 'Creating...'}
              </>
            ) : (
              <>
                {state.scheduledAt ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule {state.contentType === 'REEL' ? 'Reel' : 'Post'}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {state.contentType === 'POST'
                      ? 'Create Post'
                      : state.contentType === 'REEL'
                      ? 'Publish Reel'
                      : 'Share Story'}
                  </>
                )}
              </>
            )}
          </button>
        </div>

        {/* Draft indicator */}
        {state.isDraft && state.draftId && (
          <p className="text-xs text-foreground-secondary mt-2 text-center">
            Draft auto-saved. ID: {state.draftId.substring(0, 8)}...
          </p>
        )}

        {/* Modals */}
        {showCodeEditor && (
          <CodeSnippetEditor
            initialSnippet={state.codeSnippet}
            onSave={handleCodeSnippetSave}
            onClose={() => setShowCodeEditor(false)}
          />
        )}

        {showRepoLinker && (
          <RepoLinker
            onSelect={handleRepoLinked}
            onClose={() => setShowRepoLinker(false)}
          />
        )}

        {showScheduler && (
          <SchedulePicker
            initialDate={state.scheduledAt}
            onSchedule={handleScheduleSet}
            onClose={() => setShowScheduler(false)}
          />
        )}

        {showDrafts && (
          <DraftManager
            onLoadDraft={handleLoadDraft}
            onClose={() => setShowDrafts(false)}
          />
        )}

        {/* Checkpoint Picker Modal */}
        {showCheckpointPicker && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Attach Checkpoint</h3>
                <button
                  onClick={() => {
                    setShowCheckpointPicker(false)
                    setCheckpointSearch('')
                    setCheckpointResults([])
                  }}
                  className="p-1 text-foreground-secondary hover:text-foreground transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-foreground-secondary">
                Search your AITimeMachine checkpoints to attach to this post.
              </p>

              <div className="relative">
                <input
                  type="text"
                  value={checkpointSearch}
                  onChange={(e) => {
                    setCheckpointSearch(e.target.value)
                    searchCheckpoints(e.target.value)
                  }}
                  placeholder="Search checkpoints..."
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                {searchingCheckpoints && (
                  <div className="absolute right-3 top-3.5">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {checkpointResults.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {checkpointResults.map((cp) => (
                    <button
                      key={cp.checkpointId}
                      onClick={() => attachCheckpoint(cp)}
                      className="w-full text-left p-3 bg-surface border border-border rounded-lg hover:border-primary transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {cp.message || 'Untitled checkpoint'}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-mono text-foreground-secondary">
                          {cp.checkpointId.slice(0, 12)}
                        </span>
                        <span className="text-xs text-foreground-secondary">
                          {cp.files.length} file{cp.files.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-foreground-secondary">
                          {new Date(cp.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : checkpointSearch.trim() && !searchingCheckpoints ? (
                <p className="text-sm text-foreground-secondary text-center py-4">
                  No checkpoints found for &ldquo;{checkpointSearch}&rdquo;
                </p>
              ) : null}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-secondary">
                  You can also paste a checkpoint ID directly:
                </p>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Checkpoint ID"
                    id="checkpoint-id-input"
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('checkpoint-id-input') as HTMLInputElement
                      const id = input?.value?.trim()
                      if (id) {
                        attachCheckpoint({
                          checkpointId: id,
                          projectId: '',
                          message: '',
                          files: [],
                          createdAt: new Date().toISOString(),
                        })
                      }
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
                  >
                    Attach
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
