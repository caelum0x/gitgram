'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import api from '@/services/api'
import { getErrorMessage } from '@/utils/error'

type Tab = 'story' | 'post' | 'reel'
type StoryMode = 'text' | 'photo'
type Privacy = 'everyone' | 'followers'

const BG_COLORS: string[] = [
  '#1e1b4b',
  '#1e3a5f',
  '#14532d',
  '#7c2d12',
  '#4a1d96',
  '#164e63',
  '#713f12',
  '#1c1917',
]

const STICKERS: string[] = ['🎉', '🔥', '❤️', '💯', '🚀', '⚡', '🎯', '💻']

interface StoryPayload {
  textContent?: string
  imageUrl?: string
  backgroundColor: string
  caption: string
  privacy: Privacy
}

export default function CameraPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<Tab>('story')
  const [mode, setMode] = useState<StoryMode>('text')
  const [textContent, setTextContent] = useState('')
  const [bgColor, setBgColor] = useState(BG_COLORS[0])
  const [fontSize, setFontSize] = useState(32)
  const [overlayStickers, setOverlayStickers] = useState<string[]>([])
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [privacy, setPrivacy] = useState<Privacy>('everyone')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) {
    return null
  }

  const handleTabChange = (tab: Tab) => {
    if (tab === 'post') {
      router.push('/create')
      return
    }
    if (tab === 'reel') {
      router.push('/reels/create')
      return
    }
    setActiveTab(tab)
  }

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }, [showToast])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const toggleSticker = (sticker: string) => {
    setOverlayStickers((prev) =>
      prev.includes(sticker)
        ? prev.filter((s) => s !== sticker)
        : [...prev, sticker]
    )
  }

  const handleShare = async () => {
    if (mode === 'text' && !textContent.trim()) {
      showToast('Add some text to your story', 'error')
      return
    }
    if (mode === 'photo' && !photoFile) {
      showToast('Select a photo for your story', 'error')
      return
    }

    setLoading(true)
    try {
      if (mode === 'photo' && photoFile) {
        const formData = new FormData()
        formData.append('media', photoFile, photoFile.name)
        formData.append('backgroundColor', bgColor)
        formData.append('caption', caption)
        formData.append('privacy', privacy)
        if (overlayStickers.length > 0) {
          formData.append('stickers', overlayStickers.join(','))
        }
        await api.post('/v1/stories', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        const payload: StoryPayload = {
          textContent: textContent.trim(),
          backgroundColor: bgColor,
          caption,
          privacy,
        }
        await api.post('/v1/stories', payload)
      }

      showToast('Story shared!', 'success')
      router.push('/feed')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h1 className="text-base font-semibold tracking-wide">Create</h1>

        <div className="w-9" />
      </div>

      {/* Tab Switcher */}
      <div className="flex justify-center gap-1 px-4 pb-4">
        {(['story', 'post', 'reel'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-5 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${
              activeTab === tab
                ? 'bg-purple-600 text-white'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Story Content */}
      {activeTab === 'story' && (
        <div className="flex flex-col items-center gap-4 px-4 pb-8 flex-1">
          {/* Mode Toggle */}
          <div className="flex gap-1 bg-[var(--surface)] rounded-full p-1">
            {(['text', 'photo'] as StoryMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-6 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? 'bg-[var(--surface-secondary)] text-[var(--foreground)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Canvas — 9:16 aspect */}
          <div
            className="relative w-full max-w-xs rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: '9/16', maxHeight: '55vh', background: bgColor }}
          >
            {mode === 'text' ? (
              <>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Type something..."
                  maxLength={280}
                  className="absolute inset-0 w-full h-full bg-transparent text-center text-white font-bold placeholder-white/50 resize-none focus:outline-none p-8 flex items-center"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.3 }}
                />
                {overlayStickers.length > 0 && (
                  <div className="absolute bottom-4 right-4 flex flex-wrap gap-1 max-w-[60%] justify-end pointer-events-none">
                    {overlayStickers.map((s, i) => (
                      <span key={i} className="text-2xl drop-shadow">{s}</span>
                    ))}
                  </div>
                )}
              </>
            ) : photoPreview ? (
              <>
                <img
                  src={photoPreview}
                  alt="Story preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {overlayStickers.length > 0 && (
                  <div className="absolute bottom-4 right-4 flex flex-wrap gap-1 max-w-[60%] justify-end pointer-events-none">
                    {overlayStickers.map((s, i) => (
                      <span key={i} className="text-2xl drop-shadow">{s}</span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setPhotoPreview(null); setPhotoFile(null) }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-black/80"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`absolute inset-4 flex flex-col items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-purple-400 bg-purple-400/10'
                    : 'border-white/30 hover:border-white/60 hover:bg-white/5'
                }`}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="mb-3 opacity-70">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-white/70 text-sm font-medium">Tap to add photo</span>
                <span className="text-white/40 text-xs mt-1">or drag & drop</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            )}
          </div>

          {/* Background Color Swatches */}
          <div className="flex gap-2">
            {BG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBgColor(color)}
                className={`w-8 h-8 rounded-full transition-transform ${
                  bgColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[var(--background)]' : 'hover:scale-110'
                }`}
                style={{ background: color }}
                aria-label={`Background color ${color}`}
              />
            ))}
          </div>

          {/* Text Size Slider — only in text mode */}
          {mode === 'text' && (
            <div className="w-full max-w-xs flex items-center gap-3">
              <span className="text-[var(--foreground-secondary)] text-xs w-6">Aa</span>
              <input
                type="range"
                min={18}
                max={64}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 accent-purple-500"
                aria-label="Text size"
              />
              <span className="text-[var(--foreground-secondary)] text-lg font-bold w-6">Aa</span>
            </div>
          )}

          {/* Sticker Row */}
          <div className="w-full max-w-xs">
            <p className="text-[var(--foreground-secondary)] text-xs mb-2">Stickers</p>
            <div className="flex gap-2">
              {STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  onClick={() => toggleSticker(sticker)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl transition-colors ${
                    overlayStickers.includes(sticker)
                      ? 'bg-purple-600/40 ring-1 ring-purple-500'
                      : 'bg-[var(--surface)] hover:bg-[var(--surface-secondary)]'
                  }`}
                  aria-label={`Toggle sticker ${sticker}`}
                  aria-pressed={overlayStickers.includes(sticker)}
                >
                  {sticker}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div className="w-full max-w-xs">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              maxLength={200}
              className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Privacy */}
          <div className="w-full max-w-xs">
            <p className="text-[var(--foreground-secondary)] text-xs mb-2">Audience</p>
            <div className="flex gap-4">
              {(['everyone', 'followers'] as Privacy[]).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="privacy"
                    value={p}
                    checked={privacy === p}
                    onChange={() => setPrivacy(p)}
                    className="accent-purple-500"
                  />
                  <span className="text-sm capitalize text-[var(--foreground)]">{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Share Button */}
          <button
            onClick={handleShare}
            disabled={loading}
            className="w-full max-w-xs py-3.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl transition-colors"
          >
            {loading ? 'Sharing...' : 'Share Story'}
          </button>
        </div>
      )}
    </div>
  )
}
