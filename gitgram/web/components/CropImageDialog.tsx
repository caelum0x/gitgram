'use client'

import 'cropperjs/dist/cropper.css'
import { useRef, useState, type ComponentType } from 'react'
import { Cropper as RawCropper, type ReactCropperElement, type ReactCropperProps } from 'react-cropper'

// react-cropper ships types compiled against a different @types/react major
// than this app, which makes TS reject it as a JSX component. Re-type it
// against this app's React types (behaviour is identical at runtime).
const Cropper = RawCropper as unknown as ComponentType<
  ReactCropperProps & { ref?: React.Ref<ReactCropperElement> }
>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CropImageDialogProps {
  /** Object URL of the source image to crop. */
  src: string
  /** Aspect ratio for the crop box (width / height). e.g. 1 for square avatar. */
  cropAspectRatio: number
  /** Receives the cropped image as a webp Blob, or null if the canvas failed. */
  onCropped: (blob: Blob | null) => void
  /** Called when the dialog should close (cancel or after crop). */
  onClose: () => void
  /** Optional title shown in the header. */
  title?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal crop + resize dialog. Produces an aspect-correct webp Blob via the
 * cropper canvas. Adapted from the nextjs-15 social app's CropImageDialog to
 * the product's plain-overlay modal convention (matching ContentComposer's
 * checkpoint picker) and CSS-variable dark theme.
 */
export default function CropImageDialog({
  src,
  cropAspectRatio,
  onCropped,
  onClose,
  title = 'Crop image',
}: CropImageDialogProps) {
  const cropperRef = useRef<ReactCropperElement>(null)
  const [processing, setProcessing] = useState(false)

  const handleCrop = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return

    setProcessing(true)
    // getCroppedCanvas is bounded to avoid oversized uploads.
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 1024,
      maxHeight: 1024,
      imageSmoothingQuality: 'high',
    })

    if (!canvas) {
      setProcessing(false)
      onCropped(null)
      onClose()
      return
    }

    canvas.toBlob(
      (blob) => {
        setProcessing(false)
        onCropped(blob)
        onClose()
      },
      'image/webp',
      0.9,
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--foreground)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-[var(--foreground-secondary)] transition-colors hover:text-[var(--foreground)]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-hidden rounded-lg bg-[var(--background)]">
          <Cropper
            src={src}
            aspectRatio={cropAspectRatio}
            guides={false}
            viewMode={1}
            dragMode="move"
            background={false}
            autoCropArea={1}
            responsive
            checkOrientation={false}
            ref={cropperRef}
            className="mx-auto max-h-[60vh] w-full"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={processing}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary)]/90 disabled:opacity-50"
          >
            {processing ? 'Processing…' : 'Crop & Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
