import { useCallback } from 'react';

import { useLightboxStore, LightboxImage } from './lightboxStore';

/**
 * Convenience hook to open the global lightbox from any component.
 *
 * Usage:
 *   const openLightbox = useLightbox();
 *   openLightbox([{ uri, alt }], 0);
 */
export function useLightbox(): (
  images: LightboxImage[],
  initialIndex?: number,
) => void {
  const open = useLightboxStore((state) => state.open);

  return useCallback(
    (images: LightboxImage[], initialIndex = 0) => {
      open(images, initialIndex);
    },
    [open],
  );
}
