import { create } from 'zustand';

export interface LightboxImage {
  uri: string;
  // Optional accessible description for the image.
  alt?: string;
}

interface LightboxState {
  visible: boolean;
  images: LightboxImage[];
  initialIndex: number;

  /** Open the fullscreen lightbox with one or more images. */
  open: (images: LightboxImage[], initialIndex?: number) => void;
  close: () => void;
}

const sanitizeIndex = (index: number, length: number): number => {
  if (length === 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
};

/**
 * Global state backing the app-wide image lightbox. Any component can call
 * `open([...])` to present a fullscreen, zoomable, swipeable image viewer.
 */
export const useLightboxStore = create<LightboxState>((set) => ({
  visible: false,
  images: [],
  initialIndex: 0,

  open: (images, initialIndex = 0) => {
    const valid = images.filter((image) => Boolean(image?.uri));
    if (valid.length === 0) return;
    set({
      visible: true,
      images: valid,
      initialIndex: sanitizeIndex(initialIndex, valid.length),
    });
  },

  close: () => set({ visible: false }),
}));
