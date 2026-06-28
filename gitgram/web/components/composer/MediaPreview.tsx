'use client'

import { useState, useRef } from 'react'

interface MediaPreviewProps {
  images: string[]
  /** Per-image alt text, parallel to `images`. */
  imageAlts?: string[]
  videoSrc: string | null
  videoThumbnail: string | null
  onRemoveImage: (index: number) => void
  onRemoveVideo: () => void
  /** Called with the preview src of the image whose alt text should be edited. */
  onEditAlt?: (previewSrc: string) => void
}

export default function MediaPreview({
  images,
  imageAlts = [],
  videoSrc,
  videoThumbnail,
  onRemoveImage,
  onRemoveVideo,
  onEditAlt,
}: MediaPreviewProps) {
  const [currentImage, setCurrentImage] = useState(0)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const toggleVideoPlay = () => {
    if (videoRef.current) {
      if (videoPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setVideoPlaying(!videoPlaying)
    }
  }

  // Video preview
  if (videoSrc) {
    return (
      <div className="relative bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full max-h-96 object-contain"
          loop
          playsInline
          muted
          onClick={toggleVideoPlay}
        />

        {/* Thumbnail overlay when not playing */}
        {!videoPlaying && videoThumbnail && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <button
              onClick={toggleVideoPlay}
              className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
            >
              <svg className="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        )}

        {/* Remove button */}
        <button
          onClick={onRemoveVideo}
          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Video indicator */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-white font-medium">Video</span>
        </div>
      </div>
    )
  }

  // Single image
  if (images.length === 1) {
    const alt = imageAlts[0] || ''
    return (
      <div className="relative rounded-xl overflow-hidden">
        <img
          src={images[0]}
          alt={alt || 'Upload preview'}
          className="w-full max-h-96 object-cover rounded-xl"
        />
        {onEditAlt && (
          <button
            onClick={() => onEditAlt(images[0])}
            aria-label={alt ? 'Edit image description' : 'Add image description'}
            className={`absolute bottom-2 left-2 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
              alt ? 'bg-primary text-white' : 'bg-black/60 text-white hover:bg-black/80'
            }`}
          >
            ALT
          </button>
        )}
        <button
          onClick={() => onRemoveImage(0)}
          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // Multi-image carousel
  if (images.length > 1) {
    return (
      <div className="space-y-2">
        {/* Main carousel view */}
        <div className="relative rounded-xl overflow-hidden">
          <img
            src={images[currentImage]}
            alt={`Preview ${currentImage + 1}`}
            className="w-full max-h-96 object-cover"
          />

          {/* Navigation arrows */}
          {currentImage > 0 && (
            <button
              onClick={() => setCurrentImage(currentImage - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {currentImage < images.length - 1 && (
            <button
              onClick={() => setCurrentImage(currentImage + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Remove current image */}
          <button
            onClick={() => {
              onRemoveImage(currentImage)
              if (currentImage >= images.length - 1 && currentImage > 0) {
                setCurrentImage(currentImage - 1)
              }
            }}
            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Image counter */}
          <div className="absolute top-2 left-2 px-2.5 py-1 bg-black/60 rounded-full text-xs text-white font-medium">
            {currentImage + 1} / {images.length}
          </div>

          {/* Dots indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentImage ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Thumbnail strip */}
        <div className="flex gap-2 overflow-x-auto pb-1 px-1">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setCurrentImage(i)}
              className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                i === currentImage ? 'border-primary' : 'border-transparent'
              }`}
            >
              <img src={src} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
              {/* Remove button on hover */}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center group">
                <svg
                  className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}
