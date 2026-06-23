'use client'

import { useState, useCallback, useRef, KeyboardEvent } from 'react'

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void
  accept?: string[]
  maxSize?: number
  maxFiles?: number
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  ariaLabel?: string
}

export default function DropZone({
  onFilesDropped,
  accept = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
  maxSize = 100 * 1024 * 1024, // 100MB
  maxFiles = 10,
  children,
  className = '',
  disabled = false,
  ariaLabel = 'Drop files here or press Enter to browse',
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const processFiles = useCallback((files: File[]) => {
    const validFiles = files.filter(file => {
      if (accept.length > 0 && !accept.some(type => file.type.match(type))) return false
      if (file.size > maxSize) return false
      return true
    })
    if (validFiles.length > 0) {
      onFilesDropped(validFiles.slice(0, maxFiles))
    }
  }, [accept, maxSize, maxFiles, onFilesDropped])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }, [disabled])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) processFiles(files)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }, [processFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (disabled) return
    processFiles(Array.from(e.dataTransfer.files))
  }, [disabled, processFiles])

  const acceptAttr = accept.join(',')

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      className={`relative ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptAttr}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleFileInputChange}
        disabled={disabled}
      />
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold text-primary">Drop files here</p>
            <p className="text-sm text-primary/70 mt-1">Images or videos</p>
          </div>
        </div>
      )}
    </div>
  )
}
