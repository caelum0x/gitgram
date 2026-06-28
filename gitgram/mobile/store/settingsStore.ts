import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const HAPTICS_DISABLED_KEY = 'settings:hapticsDisabled';
const ALT_TEXT_REQUIRED_KEY = 'settings:altTextRequired';

interface SettingsState {
  // Whether tactile haptic feedback is disabled across the app.
  hapticsDisabled: boolean;
  // Whether the composer requires alt text on every image before posting.
  altTextRequired: boolean;
  // True once persisted preferences have been read from storage.
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setHapticsDisabled: (disabled: boolean) => Promise<void>;
  setAltTextRequired: (required: boolean) => Promise<void>;
}

/**
 * Lightweight, app-wide user preferences persisted to AsyncStorage. Kept
 * separate from authStore so settings survive logout and stay focused.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  hapticsDisabled: false,
  altTextRequired: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const [hapticsValue, altTextValue] = await Promise.all([
        AsyncStorage.getItem(HAPTICS_DISABLED_KEY),
        AsyncStorage.getItem(ALT_TEXT_REQUIRED_KEY),
      ]);
      set({
        hapticsDisabled: hapticsValue === 'true',
        altTextRequired: altTextValue === 'true',
        hydrated: true,
      });
    } catch (error) {
      logger.error('Failed to hydrate settings:', error);
      set({ hydrated: true });
    }
  },

  setHapticsDisabled: async (disabled: boolean) => {
    set({ hapticsDisabled: disabled });
    try {
      await AsyncStorage.setItem(HAPTICS_DISABLED_KEY, disabled ? 'true' : 'false');
    } catch (error) {
      logger.error('Failed to persist hapticsDisabled:', error);
    }
  },

  setAltTextRequired: async (required: boolean) => {
    set({ altTextRequired: required });
    try {
      await AsyncStorage.setItem(ALT_TEXT_REQUIRED_KEY, required ? 'true' : 'false');
    } catch (error) {
      logger.error('Failed to persist altTextRequired:', error);
    }
  },
}));
