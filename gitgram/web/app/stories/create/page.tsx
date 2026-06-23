'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { storyService } from '@/services/storyService'
import { useToast } from '@/components/ui/toast'
import MentionInput from '@/components/MentionInput'
import { getErrorMessage } from '@/utils/error'

// ─── Types ────────────────────────────────────────────────────────────────────

type Duration = 5 | 10 | 15

interface TextOverlay {
  id: string
  text: string
  x: number // percentage 0-100
  y: number // percentage 0-100
  color: string
  fontSize: number
}

interface StoryDraft {
  textOverlays: TextOverlay[]
  backgroundColor: string
  duration: Duration
  captionText: string
  savedAt: string
}

const DRAFT_KEY = 'story_create_draft'

const BACKGROUND_COLORS = [
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#533483',
  '#e94560',
  '#0d7377',
  '#14a085',
  '#f5a623',
  '#d0021b',
  '#7b68ee',
  '#4ecdc4',
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
]

const TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
  '#4ecdc4',
  '#a29bfe',
  '#fd79a8',
  '#fdcb6e',
  '#00cec9',
]

const DURATIONS: Duration[] = [5, 10, 15]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateStoryPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  // Media
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Background (used when no media selected)
  const [backgroundColor, setBackgroundColor] = useState(BACKGROUND_COLORS[0])

  // Text overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [showTextInput, setShowTextInput] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [pendingTextColor, setPendingTextColor] = useState(TEXT_COLORS[0])
  const [pendingFontSize, setPendingFontSize] = useState(24)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)

  // Doodle / canvas
  const [showDoodle, setShowDoodle] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [doodleColor, setDoodleColor] = useState('#ffffff')
  const [brushSize, setBrushSize] = useState(4)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  // Duration
  const [duration, setDuration] = useState<Duration>(10)

  // Caption (MentionInput for hashtag/mention support)
  const [captionText, setCaptionText] = useState('')

  // Submitting
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Preview panel
  const [showPreview, setShowPreview] = useState(false)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // ─── Auth guard ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  // ─── Load draft from localStorage ────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as StoryDraft
        setTextOverlays(draft.textOverlays ?? [])
        setBackgroundColor(draft.backgroundColor ?? BACKGROUND_COLORS[0])
        setDuration(draft.duration ?? 10)
        setCaptionText(draft.captionText ?? '')
      }
    } catch {
      // Malformed draft — ignore
    }
  }, [])

  // ─── Auto-save draft every 15 s ─────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      saveDraftToLocalStorage()
    }, 15000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textOverlays, backgroundColor, duration, captionText])

  const saveDraftToLocalStorage = useCallback(() => {
    const draft: StoryDraft = {
      textOverlays,
      backgroundColor,
      duration,
      captionText,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [textOverlays, backgroundColor, duration, captionText])

  const handleSaveDraft = () => {
    saveDraftToLocalStorage()
    showToast('Draft saved locally', 'success')
  }

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
  }

  // ─── Media handling ──────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showToast('Only image and video files are supported', 'error')
      return
    }
    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl)
    }
    const url = URL.createObjectURL(file)
    setMediaFile(file)
    setMediaUrl(url)
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image')
  }, [mediaUrl, showToast])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
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
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const removeMedia = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl)
    setMediaFile(null)
    setMediaUrl(null)
    setMediaType(null)
  }

  // ─── Text overlay ────────────────────────────────────────────────────────

  const handleAddTextOverlay = () => {
    if (!pendingText.trim()) return
    const overlay: TextOverlay = {
      id: generateId(),
      text: pendingText.trim(),
      x: 50,
      y: 50,
      color: pendingTextColor,
      fontSize: pendingFontSize,
    }
    setTextOverlays((prev) => [...prev, overlay])
    setPendingText('')
    setShowTextInput(false)
    setSelectedOverlayId(overlay.id)
  }

  const removeOverlay = (id: string) => {
    setTextOverlays((prev) => prev.filter((o) => o.id !== id))
    if (selectedOverlayId === id) setSelectedOverlayId(null)
  }

  const handleOverlayDragStart = (
    e: React.MouseEvent<HTMLDivElement>,
    overlayId: string
  ) => {
    e.stopPropagation()
    setSelectedOverlayId(overlayId)

    const container = previewRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const overlay = textOverlays.find((o) => o.id === overlayId)
    if (!overlay) return

    const startOverlayX = overlay.x
    const startOverlayY = overlay.y

    const onMove = (moveEvent: MouseEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100
      setTextOverlays((prev) =>
        prev.map((o) =>
          o.id === overlayId
            ? {
                ...o,
                x: Math.max(0, Math.min(100, startOverlayX + dx)),
                y: Math.max(0, Math.min(100, startOverlayY + dy)),
              }
            : o
        )
      )
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Doodle / canvas ─────────────────────────────────────────────────────

  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX =
      'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY =
      'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault()
    setIsDrawing(true)
    const pos = getCanvasPos(e)
    lastPosRef.current = pos
  }

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault()
    if (!isDrawing || !canvasRef.current || !lastPosRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    const pos = getCanvasPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = doodleColor
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPosRef.current = pos
  }

  const endDraw = () => {
    setIsDrawing(false)
    lastPosRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError('')

    if (!mediaFile && textOverlays.length === 0) {
      setError('Add media or at least one text overlay before posting.')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()

      if (mediaFile) {
        formData.append('media', mediaFile)
        formData.append('mediaType', mediaType ?? 'image')
      } else {
        formData.append('mediaType', 'text')
        formData.append('backgroundColor', backgroundColor)
      }

      formData.append('duration', String(duration))
      formData.append('caption', captionText)
      formData.append('textOverlays', JSON.stringify(textOverlays))

      await storyService.createStory(formData)

      clearDraft()
      showToast('Story posted!', 'success')
      router.push('/stories')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const StoryCanvas = ({ forPreview = false }: { forPreview?: boolean }) => (
    <div
      ref={forPreview ? undefined : previewRef}
      className="relative overflow-hidden rounded-2xl select-none"
      style={{
        width: forPreview ? '100%' : undefined,
        aspectRatio: '9/16',
        background: mediaUrl ? undefined : backgroundColor,
      }}
      onClick={() => setSelectedOverlayId(null)}
    >
      {/* Background media */}
      {mediaUrl && mediaType === 'image' && (
        <img
          src={mediaUrl}
          alt="Story media"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}
      {mediaUrl && mediaType === 'video' && (
        <video
          src={mediaUrl}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      )}

      {/* Doodle canvas */}
      {showDoodle && (
        <canvas
          ref={canvasRef}
          width={540}
          height={960}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: 'crosshair', zIndex: 10 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      )}

      {/* Text overlays */}
      {textOverlays.map((overlay) => (
        <div
          key={overlay.id}
          className={`absolute cursor-move group ${
            selectedOverlayId === overlay.id
              ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent rounded'
              : ''
          }`}
          style={{
            left: `${overlay.x}%`,
            top: `${overlay.y}%`,
            transform: 'translate(-50%, -50%)',
            color: overlay.color,
            fontSize: overlay.fontSize,
            fontWeight: 700,
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            zIndex: 20,
            userSelect: 'none',
            whiteSpace: 'pre-wrap',
            maxWidth: '80%',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
          onMouseDown={(e) => {
            if (!forPreview) handleOverlayDragStart(e, overlay.id)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {overlay.text}
          {!forPreview && selectedOverlayId === overlay.id && (
            <button
              className="absolute -top-5 -right-5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                removeOverlay(overlay.id)
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Duration badge */}
      <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded-full text-white text-xs font-medium z-30">
        {duration}s
      </div>
    </div>
  )

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 pb-24">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg hover:bg-surface-secondary transition-colors text-foreground-secondary"
              aria-label="Go back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">Create Story</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-secondary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                showPreview
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-surface-secondary'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">

          {/* Left column — editor */}
          <div className="space-y-5">

            {/* Drop zone / media upload */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Media</label>
                {mediaUrl && (
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="text-xs text-error hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              {!mediaUrl ? (
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-primary bg-primary/5 scale-[1.01]'
                      : 'border-border hover:border-primary/50 hover:bg-surface-secondary/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-surface-secondary flex items-center justify-center">
                      <svg className="w-7 h-7 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        <span className="text-primary">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-foreground-secondary mt-1">
                        JPG, PNG, GIF, WebP, MP4, MOV, WebM
                      </p>
                    </div>
                  </div>
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-xl pointer-events-none">
                      <p className="text-primary font-semibold">Drop to upload</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border border-border aspect-video relative">
                  {mediaType === 'image' ? (
                    <img
                      src={mediaUrl}
                      alt="Selected media"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={mediaUrl}
                      className="w-full h-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-full text-white text-xs font-medium capitalize">
                    {mediaType}
                  </div>
                </div>
              )}
            </div>

            {/* Background color — shown when no media */}
            {!mediaUrl && (
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <label className="text-sm font-semibold block">Background Color</label>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUND_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBackgroundColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        backgroundColor === color
                          ? 'border-white scale-110 shadow-lg'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Background color ${color}`}
                    />
                  ))}
                  <label className="w-8 h-8 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors" title="Custom color">
                    <svg className="w-4 h-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Duration selector */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <label className="text-sm font-semibold block">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      duration === d
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                        : 'bg-surface border-border hover:bg-surface-secondary'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Text overlay */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Text Overlay</label>
                <button
                  type="button"
                  onClick={() => setShowTextInput((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    showTextInput
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border hover:bg-surface-secondary'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Add Text
                </button>
              </div>

              {showTextInput && (
                <div className="space-y-3 p-3 bg-surface-secondary rounded-xl">
                  {/* Text input with mention/hashtag support */}
                  <MentionInput
                    value={pendingText}
                    onChange={setPendingText}
                    placeholder="Type text... Use @ to mention, # for hashtags"
                    rows={2}
                    maxLength={120}
                  />

                  {/* Text color */}
                  <div>
                    <p className="text-xs text-foreground-secondary mb-1.5">Text Color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setPendingTextColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            pendingTextColor === color
                              ? 'border-primary scale-110'
                              : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color, boxShadow: color === '#ffffff' ? '0 0 0 1px #888 inset' : undefined }}
                          aria-label={`Text color ${color}`}
                        />
                      ))}
                      <label className="w-6 h-6 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors" title="Custom color">
                        <svg className="w-3 h-3 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <input
                          type="color"
                          value={pendingTextColor}
                          onChange={(e) => setPendingTextColor(e.target.value)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Font size */}
                  <div>
                    <p className="text-xs text-foreground-secondary mb-1.5">
                      Font Size: <span className="font-semibold">{pendingFontSize}px</span>
                    </p>
                    <input
                      type="range"
                      min={12}
                      max={64}
                      value={pendingFontSize}
                      onChange={(e) => setPendingFontSize(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Live preview text */}
                  <div
                    className="py-2 px-3 rounded-lg bg-black/20 min-h-[40px] flex items-center justify-center text-center font-bold"
                    style={{ color: pendingTextColor, fontSize: Math.min(pendingFontSize, 32) }}
                  >
                    {pendingText || <span className="opacity-30 text-white text-sm">Preview</span>}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTextOverlay}
                    disabled={!pendingText.trim()}
                    className="w-full py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    Add to Story
                  </button>
                </div>
              )}

              {/* Existing overlays list */}
              {textOverlays.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {textOverlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedOverlayId === overlay.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-surface-secondary'
                      }`}
                      onClick={() => setSelectedOverlayId(overlay.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: overlay.color }}
                      />
                      <span className="text-sm flex-1 truncate">{overlay.text}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeOverlay(overlay.id)
                        }}
                        className="p-1 rounded hover:bg-error/10 hover:text-error transition-colors text-foreground-secondary flex-shrink-0"
                        aria-label="Remove overlay"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Doodle */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Draw</label>
                <div className="flex items-center gap-2">
                  {showDoodle && (
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-xs text-foreground-secondary hover:text-error transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowDoodle((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      showDoodle
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'border-border hover:bg-surface-secondary'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {showDoodle ? 'Drawing On' : 'Draw'}
                  </button>
                </div>
              </div>

              {showDoodle && (
                <div className="flex flex-wrap items-center gap-4">
                  {/* Brush color */}
                  <div>
                    <p className="text-xs text-foreground-secondary mb-1.5">Brush Color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setDoodleColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            doodleColor === color ? 'border-primary scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color, boxShadow: color === '#ffffff' ? '0 0 0 1px #888 inset' : undefined }}
                          aria-label={`Brush color ${color}`}
                        />
                      ))}
                      <label className="w-6 h-6 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer" title="Custom brush color">
                        <svg className="w-3 h-3 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <input
                          type="color"
                          value={doodleColor}
                          onChange={(e) => setDoodleColor(e.target.value)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Brush size */}
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-xs text-foreground-secondary mb-1.5">
                      Brush Size: <span className="font-semibold">{brushSize}px</span>
                    </p>
                    <input
                      type="range"
                      min={1}
                      max={24}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Caption */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <label className="text-sm font-semibold block">
                Caption
                <span className="text-xs text-foreground-secondary font-normal ml-2">
                  (supports @mentions and #hashtags)
                </span>
              </label>
              <MentionInput
                value={captionText}
                onChange={setCaptionText}
                placeholder="Add a caption... Use @ to mention, # for hashtags"
                rows={3}
                maxLength={300}
              />
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

            {/* Post button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl bg-accent text-white px-4 py-3 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Post Story
                </>
              )}
            </button>
          </div>

          {/* Right column — story preview (mobile sized) */}
          {showPreview && (
            <div className="hidden lg:flex flex-col items-center gap-3 sticky top-6 self-start">
              <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-widest">
                Preview
              </p>
              <div className="w-[200px]">
                <StoryCanvas forPreview />
              </div>
              <p className="text-xs text-foreground-secondary">
                As seen on mobile
              </p>
            </div>
          )}
        </div>

        {/* Floating preview for small screens when preview toggled */}
        {showPreview && (
          <div className="lg:hidden fixed bottom-24 right-4 w-28 z-40 shadow-2xl rounded-xl overflow-hidden border border-border">
            <StoryCanvas forPreview />
          </div>
        )}

        {/* Inline story canvas (edit mode) — shown on editor directly */}
        {(showDoodle || textOverlays.length > 0) && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-widest">
              Story Canvas — drag text to reposition
            </p>
            <div className="w-full max-w-xs">
              <StoryCanvas />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
