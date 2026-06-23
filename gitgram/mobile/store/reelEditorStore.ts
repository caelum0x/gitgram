import { create } from 'zustand';

// Visual effect definitions with color matrix values for preview
export interface VisualEffect {
  id: string;
  label: string;
  icon: string;
  // CSS-like filter values for preview overlay
  overlay?: {
    color: string;
    opacity: number;
    blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  };
  // Brightness, contrast, saturation adjustments
  adjustments?: {
    brightness?: number; // 0-2, 1 is normal
    contrast?: number; // 0-2, 1 is normal
    saturation?: number; // 0-2, 1 is normal
  };
}

export interface ReelMusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  previewUrl?: string | null;
  albumArt?: string | null;
}

export const VISUAL_EFFECTS: VisualEffect[] = [
  {
    id: 'none',
    label: 'None',
    icon: 'image',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    icon: 'palette',
    overlay: {
      color: 'rgba(255, 200, 150, 0.3)',
      opacity: 0.3,
      blendMode: 'overlay',
    },
    adjustments: {
      saturation: 0.8,
      contrast: 1.1,
    },
  },
  {
    id: 'blackwhite',
    label: 'B&W',
    icon: 'invert-colors',
    adjustments: {
      saturation: 0,
    },
  },
  {
    id: 'warm',
    label: 'Warm',
    icon: 'wb-sunny',
    overlay: {
      color: 'rgba(255, 150, 50, 0.2)',
      opacity: 0.2,
      blendMode: 'overlay',
    },
    adjustments: {
      brightness: 1.05,
    },
  },
  {
    id: 'cool',
    label: 'Cool',
    icon: 'ac-unit',
    overlay: {
      color: 'rgba(50, 100, 255, 0.15)',
      opacity: 0.15,
      blendMode: 'overlay',
    },
    adjustments: {
      brightness: 1.02,
      saturation: 0.95,
    },
  },
  {
    id: 'dramatic',
    label: 'Dramatic',
    icon: 'flare',
    overlay: {
      color: 'rgba(0, 0, 0, 0.1)',
      opacity: 0.1,
    },
    adjustments: {
      contrast: 1.3,
      saturation: 1.2,
    },
  },
  {
    id: 'fade',
    label: 'Fade',
    icon: 'blur-on',
    overlay: {
      color: 'rgba(200, 200, 200, 0.2)',
      opacity: 0.2,
      blendMode: 'screen',
    },
    adjustments: {
      contrast: 0.9,
      saturation: 0.85,
    },
  },
  {
    id: 'vivid',
    label: 'Vivid',
    icon: 'photo-filter',
    adjustments: {
      saturation: 1.4,
      contrast: 1.15,
      brightness: 1.05,
    },
  },
  {
    id: 'noir',
    label: 'Noir',
    icon: 'gradient',
    overlay: {
      color: 'rgba(0, 0, 0, 0.2)',
      opacity: 0.2,
    },
    adjustments: {
      saturation: 0,
      contrast: 1.4,
      brightness: 0.95,
    },
  },
  {
    id: 'sepia',
    label: 'Sepia',
    icon: 'filter-vintage',
    overlay: {
      color: 'rgba(160, 120, 60, 0.35)',
      opacity: 0.35,
      blendMode: 'overlay',
    },
    adjustments: {
      saturation: 0.6,
    },
  },
];

interface ReelEditorState {
  // Video source
  videoUri: string | null;
  thumbnailUri: string | null;

  // Effect selection
  selectedEffect: string;
  previewEffect: string | null; // For temporary preview before applying

  // Caption and metadata
  caption: string;
  hashtags: string[];
  musicTrack: ReelMusicTrack | null;
  musicVolume: number;

  // Trim settings
  startTime: number;
  endTime: number;
  duration: number;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;

  // Actions
  setVideoUri: (uri: string | null) => void;
  setThumbnailUri: (uri: string | null) => void;
  setSelectedEffect: (effectId: string) => void;
  setPreviewEffect: (effectId: string | null) => void;
  applyPreviewEffect: () => void;
  setCaption: (caption: string) => void;
  setHashtags: (hashtags: string[]) => void;
  setMusicTrack: (track: ReelMusicTrack | null) => void;
  setMusicVolume: (volume: number) => void;
  setTrimSettings: (startTime: number, endTime: number) => void;
  setDuration: (duration: number) => void;
  setUploadProgress: (progress: number) => void;
  setIsUploading: (uploading: boolean) => void;

  // Utility
  getSelectedEffectData: () => VisualEffect | undefined;
  getPreviewEffectData: () => VisualEffect | undefined;
  reset: () => void;
}

const initialState = {
  videoUri: null,
  thumbnailUri: null,
  selectedEffect: 'none',
  previewEffect: null,
  caption: '',
  hashtags: [],
  musicTrack: null,
  musicVolume: 1,
  startTime: 0,
  endTime: 0,
  duration: 0,
  isUploading: false,
  uploadProgress: 0,
};

export const useReelEditorStore = create<ReelEditorState>((set, get) => ({
  ...initialState,

  setVideoUri: (uri) => set({ videoUri: uri }),

  setThumbnailUri: (uri) => set({ thumbnailUri: uri }),

  setSelectedEffect: (effectId) => set({ selectedEffect: effectId }),

  setPreviewEffect: (effectId) => set({ previewEffect: effectId }),

  applyPreviewEffect: () => {
    const { previewEffect } = get();
    if (previewEffect) {
      set({ selectedEffect: previewEffect, previewEffect: null });
    }
  },

  setCaption: (caption) => set({ caption }),

  setHashtags: (hashtags) => set({ hashtags }),

  setMusicTrack: (track) => set({ musicTrack: track }),

  setMusicVolume: (volume) => set({ musicVolume: Math.max(0, Math.min(1, volume)) }),

  setTrimSettings: (startTime, endTime) => set({ startTime, endTime }),

  setDuration: (duration) => set({ duration, startTime: 0, endTime: duration }),

  setUploadProgress: (progress) => set({ uploadProgress: progress }),

  setIsUploading: (uploading) => set({ isUploading: uploading }),

  getSelectedEffectData: () => {
    const { selectedEffect } = get();
    return VISUAL_EFFECTS.find((e) => e.id === selectedEffect);
  },

  getPreviewEffectData: () => {
    const { previewEffect, selectedEffect } = get();
    const effectId = previewEffect || selectedEffect;
    return VISUAL_EFFECTS.find((e) => e.id === effectId);
  },

  reset: () => set(initialState),
}));
