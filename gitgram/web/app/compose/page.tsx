'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { postService } from '@/services/postService'
import { reelService } from '@/services/reelService'
import { storyService } from '@/services/storyService'
import { githubService } from '@/services/githubService'
import { repoService } from '@/services/repoService'
import { draftService } from '@/services/draftService'
import { useToast } from '@/components/ui/toast'
import MentionInput from '@/components/MentionInput'
import CodeSnippetEmbed, { CodeSnippetEditor } from '@/components/CodeSnippetEmbed'
import api from '@/services/api'
import { getErrorMessage } from '@/utils/error'
import { buildRepoPath } from '@/utils/repositoryRouting'

type ComposeType = 'post' | 'reel' | 'story' | 'change_story'

interface RepoOption {
  id?: string
  owner: string
  name: string
  fullName?: string
}

interface CodeSnippetData {
  id: string
  code: string
  language: string
  filePath?: string
  lineStart?: number
  lineEnd?: number
}

interface MediaPreview {
  file: File
  url: string
  type: 'image' | 'video'
}

function ComposeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  const queryType = (searchParams.get('type') || 'post') as ComposeType
  const queryOwner = searchParams.get('owner') || ''
  const queryName = searchParams.get('name') || ''
  const queryCheckpointId = searchParams.get('checkpointId') || ''
  const queryFromCheckpointId = searchParams.get('fromCheckpointId') || ''
  const queryAitmProjectId = searchParams.get('projectId') || searchParams.get('aitmProjectId') || ''
  const queryTitle = searchParams.get('title') || ''
  const queryContent = searchParams.get('content') || ''
  const queryCaption = searchParams.get('caption') || ''
  const queryDiffAdded = searchParams.get('diffAdded') || '0'
  const queryDiffRemoved = searchParams.get('diffRemoved') || '0'
  const queryDiffModified = searchParams.get('diffModified') || '0'
  const queryChangedFiles = searchParams.get('changedFiles') || ''
  const queryDraftId = searchParams.get('draftId') || ''

  const [type, setType] = useState<ComposeType>(
    ['post', 'reel', 'story', 'change_story'].includes(queryType) ? queryType : 'post'
  )

  // Repository state
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [loadingRepos, setLoadingRepos] = useState(false)

  // Content state
  const [content, setContent] = useState(queryContent)
  const [caption, setCaption] = useState(queryCaption)
  const [hashtags, setHashtags] = useState('')
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([])

  // Media state
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Code snippet state
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippetData[]>([])
  const [showSnippetEditor, setShowSnippetEditor] = useState(false)

  // Markdown preview
  const [showPreview, setShowPreview] = useState(false)

  // Scheduling
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')

  // Change story state
  const [changeTitle, setChangeTitle] = useState(queryTitle || 'Repository Change Story')
  const [checkpointId, setCheckpointId] = useState(queryCheckpointId)
  const [fromCheckpointId, setFromCheckpointId] = useState(queryFromCheckpointId)
  const [aitmProjectId, setAitmProjectId] = useState(queryAitmProjectId)
  const [diffAdded, setDiffAdded] = useState(queryDiffAdded)
  const [diffRemoved, setDiffRemoved] = useState(queryDiffRemoved)
  const [diffModified, setDiffModified] = useState(queryDiffModified)
  const [changedFiles, setChangedFiles] = useState(queryChangedFiles)

  // AITM project selection for change stories
  const [aitmProjects, setAitmProjects] = useState<any[]>([])
  const [aitmCheckpoints, setAitmCheckpoints] = useState<any[]>([])
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false)
  const [autoGeneratingDiff, setAutoGeneratingDiff] = useState(false)

  // General state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState(queryDraftId)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load repos on mount
  useEffect(() => {
    const load = async () => {
      setLoadingRepos(true)
      try {
        const data = await githubService.getProjects()
        const projectOptions: RepoOption[] = (data.projects || []).map((p: any) => ({
          id: p.id,
          owner: p.owner,
          name: p.name,
          fullName: p.fullName || `${p.owner}/${p.name}`,
        }))
        setRepos(projectOptions)

        const pre = queryOwner && queryName ? `${queryOwner}/${queryName}` : ''
        if (pre && projectOptions.some((p) => `${p.owner}/${p.name}` === pre)) {
          setSelectedRepo(pre)
        } else if (projectOptions[0]) {
          setSelectedRepo(`${projectOptions[0].owner}/${projectOptions[0].name}`)
        }
      } catch {
        // Repos may fail silently
      } finally {
        setLoadingRepos(false)
      }
    }
    void load()
  }, [queryOwner, queryName])

  // Load draft if draftId provided
  useEffect(() => {
    if (queryDraftId) {
      const loadDraft = async () => {
        const draft = await draftService.getDraft(queryDraftId)
        if (draft) {
          setContent(draft.content || '')
          setCurrentDraftId(draft.id)
        }
      }
      void loadDraft()
    }
  }, [queryDraftId])

  // Load AITM projects for change stories
  useEffect(() => {
    if (type === 'change_story') {
      const loadAitmProjects = async () => {
        try {
          const { data } = await api.get('/aitm/projects')
          setAitmProjects(data.projects || [])
        } catch {
          // AITM may not be available
        }
      }
      void loadAitmProjects()
    }
  }, [type])

  // Load checkpoints when AITM project is selected
  useEffect(() => {
    if (aitmProjectId) {
      const loadCheckpoints = async () => {
        setLoadingCheckpoints(true)
        try {
          const { data } = await api.get(`/aitm/projects/${aitmProjectId}/checkpoints`)
          setAitmCheckpoints(data.checkpoints || [])
        } catch {
          setAitmCheckpoints([])
        } finally {
          setLoadingCheckpoints(false)
        }
      }
      void loadCheckpoints()
    }
  }, [aitmProjectId])

  // Auto-generate diff when both checkpoints are selected
  const handleAutoGenerateDiff = useCallback(async () => {
    if (!fromCheckpointId || !checkpointId || !aitmProjectId) return

    setAutoGeneratingDiff(true)
    try {
      const { data } = await api.get(
        `/aitm/projects/${aitmProjectId}/diff?from=${fromCheckpointId}&to=${checkpointId}`
      )
      if (data.diff) {
        setDiffAdded(String(data.diff.added || 0))
        setDiffRemoved(String(data.diff.removed || 0))
        setDiffModified(String(data.diff.modified || 0))
        if (data.diff.changedFiles) {
          setChangedFiles(data.diff.changedFiles.join('\n'))
        }
        if (data.diff.summary) {
          setContent(data.diff.summary)
        }
        showToast('Diff summary generated', 'success')
      }
    } catch {
      showToast('Could not auto-generate diff. Fill in manually.', 'warning')
    } finally {
      setAutoGeneratingDiff(false)
    }
  }, [fromCheckpointId, checkpointId, aitmProjectId, showToast])

  const repo = useMemo(() => {
    const [owner, name] = selectedRepo.split('/')
    return owner && name ? { owner, name } : null
  }, [selectedRepo])

  // Hashtag suggestion handling
  const handleHashtagInput = async (value: string) => {
    setHashtags(value)
    const parts = value.split(',')
    const lastTag = parts[parts.length - 1]?.trim()
    if (lastTag && lastTag.length > 1) {
      try {
        const { data } = await api.get('/tags/search', { params: { q: lastTag.replace('#', ''), limit: 5 } })
        setHashtagSuggestions(
          (data.hashtags || data || []).map((h: any) => h.name || h)
        )
      } catch {
        setHashtagSuggestions([])
      }
    } else {
      setHashtagSuggestions([])
    }
  }

  const insertHashtag = (tag: string) => {
    const parts = hashtags.split(',').map((p) => p.trim()).filter(Boolean)
    parts[parts.length - 1] = tag
    setHashtags(parts.join(', '))
    setHashtagSuggestions([])
  }

  // Media handling with drag-and-drop
  const processFiles = (files: FileList | File[]) => {
    const newPreviews: MediaPreview[] = []
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        newPreviews.push({
          file,
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video/') ? 'video' : 'image',
        })
      }
    })
    setMediaPreviews((prev) => [...prev, ...newPreviews])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files)
    }
  }

  const removeMedia = (index: number) => {
    setMediaPreviews((prev) => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[index].url)
      updated.splice(index, 1)
      return updated
    })
  }

  // Code snippet handling
  const handleInsertSnippet = (snippet: Omit<CodeSnippetData, 'id'>) => {
    const newSnippet: CodeSnippetData = {
      ...snippet,
      id: `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setCodeSnippets((prev) => [...prev, newSnippet])
    setShowSnippetEditor(false)
  }

  const removeSnippet = (id: string) => {
    setCodeSnippets((prev) => prev.filter((s) => s.id !== id))
  }

  // Markdown toolbar actions
  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.querySelector('textarea[data-compose-editor]') as HTMLTextAreaElement
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.substring(start, end)
    const newContent = content.substring(0, start) + before + selected + after + content.substring(end)
    setContent(newContent)

    setTimeout(() => {
      textarea.focus()
      const cursorPos = start + before.length + selected.length + after.length
      textarea.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }

  // Simple markdown to HTML for preview
  const renderMarkdownPreview = (text: string): string => {
    return text
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold my-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold my-2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold my-2">$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-secondary text-pink-400 text-sm font-mono">$1</code>')
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="p-3 rounded-lg bg-[#0d1117] my-2 overflow-x-auto"><code class="text-sm font-mono text-gray-300">$2</code></pre>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n/g, '<br/>')
  }

  // Draft saving
  const saveDraft = async () => {
    if (!content.trim() && codeSnippets.length === 0) return

    setSavingDraft(true)
    try {
      const draftContent = JSON.stringify({
        type,
        content,
        caption,
        hashtags,
        selectedRepo,
        codeSnippets,
        changeTitle,
        checkpointId,
        fromCheckpointId,
        aitmProjectId,
      })

      if (currentDraftId) {
        await draftService.updateDraft(currentDraftId, draftContent)
      } else {
        const draft = await draftService.createDraft(draftContent)
        setCurrentDraftId(draft.id)
      }
      setLastSaved(new Date())
      showToast('Draft saved', 'success')
    } catch {
      showToast('Failed to save draft', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  // Auto-save every 30 seconds if content changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (content.trim() || caption.trim()) {
        saveDraft()
      }
    }, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, caption, currentDraftId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!repo && type !== 'change_story') {
      setError('Select a repository first.')
      return
    }

    // Check if scheduling
    if (showScheduler && scheduledDate && scheduledTime) {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
      if (scheduledAt <= new Date()) {
        setError('Scheduled time must be in the future.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (type === 'post') {
        if (!content.trim() && mediaPreviews.length === 0 && codeSnippets.length === 0) {
          setError('Add post content, media, or a code snippet.')
          setSubmitting(false)
          return
        }

        // Build content with embedded snippets
        let fullContent = content
        if (codeSnippets.length > 0) {
          codeSnippets.forEach((snippet) => {
            fullContent += `\n\n\`\`\`${snippet.language}${snippet.filePath ? ` // ${snippet.filePath}` : ''}\n${snippet.code}\n\`\`\``
          })
        }

        const formData = new FormData()
        formData.append('content', fullContent)
        if (repo) {
          formData.append('repoOwner', repo.owner)
          formData.append('repoName', repo.name)
        }
        if (hashtags.trim()) formData.append('hashtags', hashtags)
        if (mediaPreviews.length > 0) {
          formData.append('media', mediaPreviews[0].file)
        }
        // Additional media files
        mediaPreviews.slice(1).forEach((preview, i) => {
          formData.append(`media_${i + 1}`, preview.file)
        })

        if (showScheduler && scheduledDate && scheduledTime) {
          formData.append('scheduledAt', new Date(`${scheduledDate}T${scheduledTime}`).toISOString())
          await api.post('/scheduled-posts', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          showToast('Post scheduled', 'success')
        } else {
          if (checkpointId.trim() && aitmProjectId.trim()) {
            await postService.createPostWithCheckpoint(formData, {
              checkpointId: checkpointId.trim(),
              projectId: aitmProjectId.trim(),
              fromCheckpointId: fromCheckpointId.trim() || undefined,
              diffSummary: {
                added: Number(diffAdded || 0),
                removed: Number(diffRemoved || 0),
                modified: Number(diffModified || 0),
              },
              changedFiles: changedFiles
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
              changeStoryTitle: changeTitle.trim() || undefined,
            })
          } else {
            await postService.createPost(formData)
          }
          showToast('Post published', 'success')
        }
      } else if (type === 'reel') {
        if (mediaPreviews.length === 0 || mediaPreviews[0].type !== 'video') {
          setError('Select a video file for reel.')
          setSubmitting(false)
          return
        }
        const formData = new FormData()
        formData.append('video', mediaPreviews[0].file)
        formData.append('title', caption.trim() || `Reel for ${repo?.owner}/${repo?.name}`)
        formData.append('description', caption)
        if (repo) {
          formData.append('repoOwner', repo.owner)
          formData.append('repoName', repo.name)
        }
        if (hashtags.trim()) formData.append('hashtags', hashtags)

        // Add code snippet overlay data if present
        if (codeSnippets.length > 0) {
          formData.append('codeSnippets', JSON.stringify(codeSnippets))
        }

        await reelService.createReel(formData)
        showToast('Reel published', 'success')
      } else if (type === 'story') {
        if (mediaPreviews.length === 0) {
          setError('Select image/video for story.')
          setSubmitting(false)
          return
        }
        const formData = new FormData()
        formData.append('media', mediaPreviews[0].file)
        formData.append('mediaType', mediaPreviews[0].type)
        formData.append('caption', caption)
        if (repo) {
          formData.append('repoOwner', repo.owner)
          formData.append('repoName', repo.name)
        }
        await storyService.createStory(formData)
        showToast('Story published', 'success')
      } else {
        // change_story
        if (!checkpointId.trim()) {
          setError('checkpointId is required for change story.')
          setSubmitting(false)
          return
        }
        if (!repo) {
          setError('Select a repository first.')
          setSubmitting(false)
          return
        }
        await repoService.createChangeStory(repo.owner, repo.name, {
          title: changeTitle,
          summary: content || caption,
          checkpointId: checkpointId.trim(),
          fromCheckpointId: fromCheckpointId.trim() || undefined,
          aitmProjectId: aitmProjectId.trim() || undefined,
          diffSummary: {
            added: Number(diffAdded || 0),
            removed: Number(diffRemoved || 0),
            modified: Number(diffModified || 0),
          },
          changedFiles: changedFiles
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        })
        showToast('Change story published', 'success')
      }

      // Clean up draft if exists
      if (currentDraftId) {
        await draftService.deleteDraft(currentDraftId).catch(() => {})
      }

      if (repo) {
        router.push(buildRepoPath(repo.owner, repo.name))
      } else {
        router.push('/feed')
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const typeConfig = [
    {
      key: 'post',
      label: 'Post',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      key: 'reel',
      label: 'Reel',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: 'story',
      label: 'Story',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      key: 'change_story',
      label: 'Change Story',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Compose</h1>
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-xs text-foreground-secondary">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={saveDraft}
            disabled={savingDraft}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-secondary transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {savingDraft ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => router.back()}
            className="text-foreground-secondary hover:text-foreground text-sm"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Type Selector Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {typeConfig.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setType(tab.key as ComposeType)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              type === tab.key
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-surface border border-border hover:bg-surface-secondary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Repository Selector */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="mb-2 block text-sm font-semibold">Repository</label>
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={loadingRepos}
          >
            <option value="">Select a repository...</option>
            {repos.map((r) => {
              const value = `${r.owner}/${r.name}`
              return (
                <option key={value} value={value}>
                  {r.fullName || value}
                </option>
              )
            })}
          </select>
          {loadingRepos && (
            <div className="mt-2 flex items-center gap-2 text-xs text-foreground-secondary">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading repositories...
            </div>
          )}
        </div>

        {checkpointId && aitmProjectId && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-blue-500/10 p-1.5 text-blue-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-foreground">AITM checkpoint linked</p>
                <p className="mt-1 text-foreground-secondary">
                  Publishing from this composer will attach checkpoint <span className="font-mono text-xs">{checkpointId}</span>
                  {' '}from project <span className="font-mono text-xs">{aitmProjectId}</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Post Editor */}
        {type === 'post' && (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
            {/* Markdown Toolbar */}
            <div className="flex flex-wrap items-center gap-1 pb-3 border-b border-border">
              <button
                type="button"
                onClick={() => insertMarkdown('**', '**')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="Bold"
              >
                <span className="text-sm font-bold">B</span>
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('*', '*')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="Italic"
              >
                <span className="text-sm italic">I</span>
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('`', '`')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="Inline code"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('## ')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="Heading"
              >
                <span className="text-sm font-bold">H</span>
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- ')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="List"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('[', '](url)')}
                className="p-2 rounded hover:bg-surface-secondary transition-colors"
                title="Link"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>

              <div className="w-px h-6 bg-border mx-1" />

              <button
                type="button"
                onClick={() => setShowSnippetEditor(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-surface-secondary transition-colors text-xs font-medium"
                title="Insert code snippet"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Code
              </button>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className={`px-2.5 py-1 rounded text-xs ${!showPreview ? 'bg-surface-secondary font-medium' : 'hover:bg-surface-secondary'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className={`px-2.5 py-1 rounded text-xs ${showPreview ? 'bg-surface-secondary font-medium' : 'hover:bg-surface-secondary'}`}
                >
                  Preview
                </button>
              </div>
            </div>

            {/* Content editor / preview */}
            {showPreview ? (
              <div
                className="min-h-[200px] px-4 py-3 prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }}
              />
            ) : (
              <MentionInput
                value={content}
                onChange={setContent}
                placeholder="Write your post with markdown support... Use @ to mention users and # for hashtags"
                rows={8}
              />
            )}
          </div>
        )}

        {/* Reel / Story Caption */}
        {(type === 'reel' || type === 'story') && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <label className="mb-2 block text-sm font-semibold">Caption</label>
            <MentionInput
              value={caption}
              onChange={setCaption}
              placeholder="Add a caption..."
              rows={3}
            />
          </div>
        )}

        {/* Hashtag Input */}
        {(type === 'post' || type === 'reel') && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <label className="mb-2 block text-sm font-semibold">Hashtags</label>
            <div className="relative">
              <input
                value={hashtags}
                onChange={(e) => handleHashtagInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="react, typescript, opensource (comma-separated)"
              />
              {hashtagSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50">
                  {hashtagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertHashtag(tag)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-secondary text-sm flex items-center gap-2"
                    >
                      <span className="text-foreground-secondary">#</span>
                      <span>{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Code Snippet Editor (inline) */}
        {showSnippetEditor && (
          <CodeSnippetEditor
            onInsert={handleInsertSnippet}
            onCancel={() => setShowSnippetEditor(false)}
            repoOwner={repo?.owner}
            repoName={repo?.name}
          />
        )}

        {/* Code Snippets List */}
        {codeSnippets.length > 0 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold">Attached Code Snippets</label>
            {codeSnippets.map((snippet) => (
              <div key={snippet.id} className="relative group">
                <button
                  type="button"
                  onClick={() => removeSnippet(snippet.id)}
                  className="absolute top-2 right-2 z-10 p-1.5 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove snippet"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <CodeSnippetEmbed
                  code={snippet.code}
                  language={snippet.language}
                  filePath={snippet.filePath}
                  lineStart={snippet.lineStart}
                  lineEnd={snippet.lineEnd}
                  repoOwner={repo?.owner}
                  repoName={repo?.name}
                  maxHeight="200px"
                />
              </div>
            ))}
          </div>
        )}

        {/* Media Upload with Drag-and-Drop */}
        {(type === 'post' || type === 'reel' || type === 'story') && (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
            <label className="block text-sm font-semibold">
              {type === 'reel' ? 'Video' : 'Media'}
            </label>

            {/* Drag and drop zone */}
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-surface-secondary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={type === 'reel' ? 'video/*' : 'image/*,video/*'}
                onChange={handleFileSelect}
                multiple={type === 'post'}
                className="hidden"
              />
              <svg className="w-10 h-10 mx-auto mb-3 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-foreground-secondary">
                <span className="text-primary font-medium">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-foreground-secondary mt-1">
                {type === 'reel' ? 'MP4, MOV, WebM' : 'PNG, JPG, GIF, MP4, MOV'}
              </p>
            </div>

            {/* Media previews */}
            {mediaPreviews.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {mediaPreviews.map((preview, index) => (
                  <div key={index} className="relative group rounded-lg overflow-hidden border border-border aspect-square">
                    {preview.type === 'image' ? (
                      <img
                        src={preview.url}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={preview.url}
                        className="w-full h-full object-cover"
                        muted
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeMedia(index)
                        }}
                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    {preview.type === 'video' && (
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
                        Video
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Change Story Fields */}
        {type === 'change_story' && (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
            <h3 className="text-sm font-semibold">Change Story Details</h3>

            <input
              value={changeTitle}
              onChange={(e) => setChangeTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Change story title"
            />

            {/* AITM Project selector */}
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">AITM Project (optional)</label>
              <select
                value={aitmProjectId}
                onChange={(e) => setAitmProjectId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select AITM project...</option>
                {aitmProjects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkpoint selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground-secondary mb-1">Before Checkpoint</label>
                {aitmCheckpoints.length > 0 ? (
                  <select
                    value={fromCheckpointId}
                    onChange={(e) => setFromCheckpointId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select...</option>
                    {aitmCheckpoints.map((cp: any) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.label || cp.id} - {new Date(cp.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={fromCheckpointId}
                    onChange={(e) => setFromCheckpointId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="fromCheckpointId"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-foreground-secondary mb-1">After Checkpoint *</label>
                {aitmCheckpoints.length > 0 ? (
                  <select
                    value={checkpointId}
                    onChange={(e) => setCheckpointId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select...</option>
                    {aitmCheckpoints.map((cp: any) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.label || cp.id} - {new Date(cp.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={checkpointId}
                    onChange={(e) => setCheckpointId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="checkpointId *"
                  />
                )}
              </div>
            </div>

            {/* Auto-generate diff button */}
            {fromCheckpointId && checkpointId && aitmProjectId && (
              <button
                type="button"
                onClick={handleAutoGenerateDiff}
                disabled={autoGeneratingDiff}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {autoGeneratingDiff ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                Auto-generate diff summary
              </button>
            )}

            {/* Diff stats */}
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">Diff Summary</label>
              <div className="grid grid-cols-3 gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 text-sm font-mono">+</span>
                  <input
                    value={diffAdded}
                    onChange={(e) => setDiffAdded(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="added"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-sm font-mono">-</span>
                  <input
                    value={diffRemoved}
                    onChange={(e) => setDiffRemoved(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="removed"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-400 text-sm font-mono">~</span>
                  <input
                    value={diffModified}
                    onChange={(e) => setDiffModified(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="modified"
                  />
                </div>
              </div>
            </div>

            {/* Changed files */}
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">Changed Files (one per line)</label>
              <textarea
                value={changedFiles}
                onChange={(e) => setChangedFiles(e.target.value)}
                className="min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="src/index.ts&#10;src/utils/helper.ts&#10;package.json"
              />
            </div>

            {/* Narrative text */}
            <div>
              <label className="block text-xs text-foreground-secondary mb-1">Narrative / Summary</label>
              <MentionInput
                value={content}
                onChange={setContent}
                placeholder="Describe what changed and why..."
                rows={4}
              />
            </div>
          </div>
        )}

        {/* Scheduling */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <button
            type="button"
            onClick={() => setShowScheduler(!showScheduler)}
            className="flex items-center gap-2 text-sm font-medium text-foreground-secondary hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {showScheduler ? 'Cancel scheduling' : 'Schedule for later'}
          </button>

          {showScheduler && (
            <div className="mt-3 flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-foreground-secondary mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-foreground-secondary mb-1">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-accent text-white px-4 py-3 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Publishing...
            </>
          ) : showScheduler && scheduledDate && scheduledTime ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule {type === 'change_story' ? 'Change Story' : type.charAt(0).toUpperCase() + type.slice(1)}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Publish {type === 'change_story' ? 'Change Story' : type.charAt(0).toUpperCase() + type.slice(1)}
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ComposeContent />
    </Suspense>
  )
}
