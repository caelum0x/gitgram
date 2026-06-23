'use client'

import { useRef, useState, useCallback } from 'react'

interface MediaUploaderProps {
  type: 'image' | 'video'
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  multiple?: boolean
  maxFiles?: number
}

export default function MediaUploader({
  type,
  onFilesSelected,
  disabled = false,
  multiple = false,
  maxFiles = 10,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const accept = type === 'image'
    ? 'image/jpeg,image/png,image/gif,image/webp'
    : 'video/mp4,video/webm,video/quicktime'

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files.slice(0, maxFiles))
    }
    // Reset input so same file can be selected again
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (disabled) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    const filteredFiles = droppedFiles.filter(file => {
      if (type === 'image') return file.type.startsWith('image/')
      return file.type.startsWith('video/')
    })

    if (filteredFiles.length > 0) {
      onFilesSelected(filteredFiles.slice(0, maxFiles))
    }
  }, [disabled, type, maxFiles, onFilesSelected])

  return (
    <>
      <button
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          isDragging
            ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
            : disabled
            ? 'text-foreground-secondary/40 cursor-not-allowed'
            : 'text-foreground-secondary hover:bg-surface-secondary'
        }`}
        title={type === 'image' ? 'Add images (drag & drop supported)' : 'Add video (drag & drop supported)'}
      >
        {type === 'image' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        <span className="hidden sm:inline">
          {type === 'image' ? 'Photo' : 'Video'}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={type === 'image' && multiple}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  )
}
