'use client';

import { useState } from 'react';

interface ImageCarouselProps {
  images: string[];
  /** Per-image alt text, parallel to `images`. Falls back to empty when absent. */
  alts?: string[];
}

/**
 * Resolve the alt text for the image at `index`. Returns the author-supplied
 * description when present, otherwise an empty string so screen readers treat
 * the image as decorative rather than announcing a meaningless filename.
 */
function altFor(alts: string[] | undefined, index: number): string {
  return alts?.[index]?.trim() || '';
}

export default function ImageCarousel({ images, alts }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);

  if (!images || images.length === 0) return null;
  if (images.length === 1) {
    return <img src={images[0]} alt={altFor(alts, 0)} className="w-full" />;
  }

  const next = () => setCurrent((i) => (i + 1) % images.length);
  const prev = () => setCurrent((i) => (i - 1 + images.length) % images.length);

  return (
    <div className="relative">
      <img src={images[current]} alt={altFor(alts, current)} className="w-full" />

      {current > 0 && (
        <button
          onClick={prev}
          aria-label="Previous image"
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
        >
          ‹
        </button>
      )}

      {current < images.length - 1 && (
        <button
          onClick={next}
          aria-label="Next image"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
        >
          ›
        </button>
      )}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
        {images.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i === current ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
