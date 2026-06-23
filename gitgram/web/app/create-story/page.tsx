'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { useAuthStore } from '@/store/authStore'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKGROUND_COLORS: string[] = [
  '#0d0d0d',
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#1e1b4b',
  '#14532d',
  '#431407',
  '#3b0764',
  '#0c0a09',
  '#1c1917',
]

const COMMON_STICKERS: string[] = [
  '😂', '❤️', '🔥', '👏', '😍',
  '🎉', '💯', '🙌', '😎', '🤩',
  '💪', '✨', '🚀', '👀', '💬',
  '🎯', '⭐', '🥳', '😊', '👋',
]

const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Create',
  2: 'Decorate',
  3: 'Preview',
}

type WizardStep = 1 | 2 | 3
type StoryMode = 'image' | 'text'
type Privacy = 'everyone' | 'followers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sticker {
  id: string
  emoji: string
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  step: WizardStep
}

function ProgressBar({ step }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {([1, 2, 3] as WizardStep[]).map((s) => (
        <div key={s} className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-300 ${
                s < step
                  ? 'bg-green-500 text-white'
                  : s === step
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {s < step ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                s
              )}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block ${
                s === step ? 'text-white' : 'text-zinc-500'
              }`}
            >
              {STEP_LABELS[s]}
            </span>
          </div>
          {s < 3 && (
            <div
              className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                s < step ? 'bg-green-500' : 'bg-zinc-800'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

interface StoryCanvasProps {
  mode: StoryMode
  imageUrl: string | null
  textContent: string
  backgroundColor: string
  fontSize: number
  caption: string
  stickers: Sticker[]
  interactive?: boolean
  onStickerMove?: (id: string, x: number, y: number) => void
  containerRef?: React.RefObject<HTMLDivElement>
}

function StoryCanvas({
  mode,
  imageUrl,
  textContent,
  backgroundColor,
  fontSize,
  caption,
  stickers,
  interactive = false,
  onStickerMove,
  containerRef,
}: StoryCanvasProps) {
  const handleStickerMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    stickerId: string
  ) => {
    if (!interactive || !onStickerMove || !containerRef?.current) return
    e.stopPropagation()

    const rect = containerRef.current.getBoundingClientRect()
    const sticker = stickers.find((s) => s.id === stickerId)
    if (!sticker) return

    const startX = e.clientX
    const startY = e.clientY
    const startStickerX = sticker.x
    const startStickerY = sticker.y

    const onMove = (moveEvent: MouseEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100
      onStickerMove(
        stickerId,
        Math.max(5, Math.min(95, startStickerX + dx)),
        Math.max(5, Math.min(95, startStickerY + dy))
      )
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl select-none"
      style={{
        aspectRatio: '9/16',
        backgroundColor: mode === 'text' ? backgroundColor : '#000',
      }}
    >
      {/* Background image */}
      {mode === 'image' && imageUrl && (
        <img
          src={imageUrl}
          alt="Story"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* Crop handle corners (image mode) */}
      {mode === 'image' && imageUrl && (
        <>
          <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm pointer-events-none" />
          <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm pointer-events-none" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm pointer-events-none" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm pointer-events-none" />
        </>
      )}

      {/* Text story content */}
      {mode === 'text' && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p
            className="text-white font-bold text-center leading-snug break-words"
            style={{ fontSize: `${fontSize}px`, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
          >
            {textContent || (
              <span className="opacity-30 text-2xl">Your story text...</span>
            )}
          </p>
        </div>
      )}

      {/* Stickers */}
      {stickers.map((sticker) => (
        <div
          key={sticker.id}
          className={`absolute text-3xl leading-none ${interactive ? 'cursor-move' : ''}`}
          style={{
            left: `${sticker.x}%`,
            top: `${sticker.y}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            userSelect: 'none',
          }}
          onMouseDown={(e) => handleStickerMouseDown(e, sticker.id)}
        >
          {sticker.emoji}
        </div>
      ))}

      {/* Caption overlay */}
      {caption.trim() && (
        <div className="absolute bottom-0 left-0 right-0 px-3 py-3 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-xs text-center leading-snug">{caption}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CreateStoryPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1)

  // Story mode
  const [mode, setMode] = useState<StoryMode>('image')

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Text story
  const [textContent, setTextContent] = useState('')
  const [fontSize, setFontSize] = useState(28)
  const [backgroundColor, setBackgroundColor] = useState(BACKGROUND_COLORS[0])

  // Step 2 — decoration
  const [caption, setCaption] = useState('')
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Step 3 — preview
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [privacy, setPrivacy] = useState<Privacy>('everyone')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Canvas ref for interactive sticker drag
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  // ---------------------------------------------------------------------------
  // Image handling
  // ---------------------------------------------------------------------------

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        showToast('Only image files are supported', 'error')
        return
      }
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      setImageUrl(URL.createObjectURL(file))
      setImageFile(file)
    },
    [imageUrl, showToast]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ---------------------------------------------------------------------------
  // Stickers
  // ---------------------------------------------------------------------------

  const addSticker = (emoji: string) => {
    const sticker: Sticker = {
      id: generateId(),
      emoji,
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
    }
    setStickers((prev) => [...prev, sticker])
    setShowEmojiPicker(false)
  }

  const removeSticker = (id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id))
  }

  const moveStickerTo = (id: string, x: number, y: number) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x, y } : s))
    )
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const canGoToStep2 =
    mode === 'image' ? imageFile !== null : textContent.trim().length > 0

  const handleNext = () => {
    if (step === 1 && !canGoToStep2) {
      showToast(
        mode === 'image'
          ? 'Please upload an image first'
          : 'Please enter some text first',
        'error'
      )
      return
    }
    if (step < 3) setStep(((step + 1) as WizardStep))
    if (step === 2) setShowPreviewModal(true)
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(((step - 1) as WizardStep))
      setShowPreviewModal(false)
    } else {
      router.back()
    }
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const formData = new FormData()

      if (mode === 'image' && imageFile) {
        formData.append('image', imageFile)
      } else {
        formData.append('textContent', textContent)
        formData.append('backgroundColor', backgroundColor)
      }

      formData.append('caption', caption)
      formData.append('privacy', privacy)
      formData.append('stickers', JSON.stringify(stickers))

      const res = await fetch('/api/v1/stories', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const json = (await res.json()) as { error?: string; message?: string }
        throw new Error(json.error ?? json.message ?? 'Failed to post story')
      }

      showToast('Story posted!', 'success')
      router.push('/feed')
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Step renders
  // ---------------------------------------------------------------------------

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-zinc-800 p-1 gap-1">
        <button
          type="button"
          onClick={() => setMode('image')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            mode === 'image'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Image
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            mode === 'text'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Text
        </button>
      </div>

      {/* Image upload */}
      {mode === 'image' && (
        <div>
          {!imageUrl ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-zinc-700 hover:border-indigo-500/60 hover:bg-zinc-900/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  <span className="text-indigo-400">Click to upload</span> or drag &amp; drop
                </p>
                <p className="text-xs text-zinc-500 mt-1">JPG, PNG, GIF, WebP</p>
              </div>
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/10 rounded-2xl pointer-events-none">
                  <p className="text-indigo-400 font-semibold">Drop image here</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-zinc-700 aspect-video">
                <img
                  src={imageUrl}
                  alt="Selected"
                  className="w-full h-full object-cover"
                />
                {/* Crop handles */}
                <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl" />
                <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br" />
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(imageUrl)
                  setImageUrl(null)
                  setImageFile(null)
                }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove image
              </button>
            </div>
          )}
        </div>
      )}

      {/* Text story */}
      {mode === 'text' && (
        <div className="space-y-4">
          {/* Full-screen style text area */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{ aspectRatio: '9/16', maxHeight: '400px', backgroundColor }}
          >
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              maxLength={280}
              placeholder="Your story text..."
              className="absolute inset-0 w-full h-full bg-transparent text-white placeholder-white/30 font-bold text-center resize-none p-6 focus:outline-none"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: '1.3',
                textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
              }}
            />
            <div className="absolute bottom-2 right-2 text-xs text-white/40">
              {textContent.length}/280
            </div>
          </div>

          {/* Font size slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-300">Font Size</label>
              <span className="text-xs text-zinc-500 font-mono">{fontSize}px</span>
            </div>
            <input
              type="range"
              min={16}
              max={56}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          {/* Background color picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Background</label>
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackgroundColor(color)}
                  className={`w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
                    backgroundColor === color
                      ? 'border-white scale-110 shadow-lg shadow-white/20'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color, boxShadow: backgroundColor === color ? `0 0 0 2px ${color}` : undefined }}
                  aria-label={`Background color ${color}`}
                />
              ))}
              <label
                className="w-9 h-9 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors"
                title="Custom color"
              >
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Canvas preview with interactive stickers */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Story Preview — drag stickers to reposition
          </p>
          <div className="max-w-[220px] mx-auto lg:mx-0">
            <StoryCanvas
              mode={mode}
              imageUrl={imageUrl}
              textContent={textContent}
              backgroundColor={backgroundColor}
              fontSize={fontSize}
              caption={caption}
              stickers={stickers}
              interactive
              onStickerMove={moveStickerTo}
              containerRef={canvasContainerRef}
            />
          </div>
        </div>

        {/* Decoration controls */}
        <div className="space-y-5">
          {/* Caption */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">
              Caption
              <span className="text-zinc-600 font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Add a caption..."
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm px-3 py-2.5 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
            />
            <p className="text-xs text-zinc-600 text-right">{caption.length}/200</p>
          </div>

          {/* Sticker/emoji picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-300">Stickers</label>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  showEmojiPicker
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                }`}
              >
                <span>😊</span>
                {showEmojiPicker ? 'Close picker' : 'Add sticker'}
              </button>
            </div>

            {showEmojiPicker && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm p-3">
                <p className="text-xs text-zinc-600 mb-2 font-medium">Common reactions</p>
                <div className="grid grid-cols-10 gap-1">
                  {COMMON_STICKERS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => addSticker(emoji)}
                      className="text-xl leading-none p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sticker list */}
            {stickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stickers.map((sticker) => (
                  <div
                    key={sticker.id}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  >
                    <span>{sticker.emoji}</span>
                    <button
                      type="button"
                      onClick={() => removeSticker(sticker.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors ml-0.5"
                      aria-label="Remove sticker"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Full-screen preview modal trigger */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Preview */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            Final Preview
          </p>
          <div
            className="max-w-[240px] mx-auto sm:mx-0 cursor-pointer group relative"
            onClick={() => setShowPreviewModal(true)}
          >
            <StoryCanvas
              mode={mode}
              imageUrl={imageUrl}
              textContent={textContent}
              backgroundColor={backgroundColor}
              fontSize={fontSize}
              caption={caption}
              stickers={stickers}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
              <div className="flex items-center gap-2 text-white text-sm font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Full screen
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-5">
          {/* Privacy */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-300">Privacy</label>
            <div className="space-y-2">
              {(['everyone', 'followers'] as Privacy[]).map((option) => (
                <label
                  key={option}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    privacy === option
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="privacy"
                    value={option}
                    checked={privacy === option}
                    onChange={() => setPrivacy(option)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      privacy === option ? 'border-indigo-500' : 'border-zinc-600'
                    }`}
                  >
                    {privacy === option && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white capitalize">{option}</p>
                    <p className="text-xs text-zinc-500">
                      {option === 'everyone'
                        ? 'Visible to all Gitgram users'
                        : 'Only your followers can see this'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Story summary */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 text-sm">
            <p className="font-medium text-zinc-300">Story summary</p>
            <div className="space-y-1 text-zinc-500">
              <p>Type: <span className="text-zinc-300">{mode === 'image' ? 'Image' : 'Text'}</span></p>
              {caption.trim() && (
                <p>Caption: <span className="text-zinc-300 truncate">&ldquo;{caption}&rdquo;</span></p>
              )}
              {stickers.length > 0 && (
                <p>Stickers: <span className="text-zinc-300">{stickers.map((s) => s.emoji).join(' ')}</span></p>
              )}
              <p>Expires: <span className="text-zinc-300">24 hours after posting</span></p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-6 pb-28">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
              aria-label="Go back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Create Story</h1>
              <p className="text-xs text-zinc-500">Disappears in 24 hours</p>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <ProgressBar step={step} />

        {/* Step content */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-5 md:p-7">
          <div className="mb-5">
            <h2 className="text-base font-semibold">
              {step === 1 && 'Step 1 of 3 — Choose your content'}
              {step === 2 && 'Step 2 of 3 — Add caption & stickers'}
              {step === 3 && 'Step 3 of 3 — Preview & post'}
            </h2>
          </div>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Bottom navigation */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-800">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-shrink-0 px-5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 1 && !canGoToStep2}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
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
            )}
          </div>
        </div>
      </div>

      {/* Full-screen preview modal */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowPreviewModal(false)}
        >
          <button
            type="button"
            onClick={() => setShowPreviewModal(false)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-center mb-3">
              Full Preview
            </p>
            <StoryCanvas
              mode={mode}
              imageUrl={imageUrl}
              textContent={textContent}
              backgroundColor={backgroundColor}
              fontSize={fontSize}
              caption={caption}
              stickers={stickers}
            />
            <p className="text-xs text-zinc-600 text-center mt-3">
              Tap outside to close
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
