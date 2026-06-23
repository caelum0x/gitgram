import { create } from 'zustand';

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  placeName?: string;
}

interface LocationState {
  // Selected location from the picker
  selectedLocation: LocationData | null;

  // Callback to notify when location is selected
  onLocationSelected: ((location: LocationData) => void) | null;

  // Actions
  setSelectedLocation: (location: LocationData | null) => void;
  setOnLocationSelected: (callback: ((location: LocationData) => void) | null) => void;
  selectLocation: (location: LocationData) => void;
  clearLocation: () => void;
  reset: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  selectedLocation: null,
  onLocationSelected: null,

  setSelectedLocation: (location) => {
    set({ selectedLocation: location });
  },

  setOnLocationSelected: (callback) => {
    set({ onLocationSelected: callback });
  },

  selectLocation: (location) => {
    const { onLocationSelected } = get();
    set({ selectedLocation: location });

    // Call the callback if one was registered
    if (onLocationSelected) {
      onLocationSelected(location);
    }
  },

  clearLocation: () => {
    set({ selectedLocation: null });
  },

  reset: () => {
    set({
      selectedLocation: null,
      onLocationSelected: null,
    });
  },
}));
