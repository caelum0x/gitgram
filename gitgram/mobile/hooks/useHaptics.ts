import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '../store/settingsStore';

export type HapticStrength = 'Light' | 'Medium' | 'Heavy';

/**
 * Returns a stable callback that fires a tactile impact, respecting the user's
 * "disable haptics" preference. Ported from Bluesky's useHaptics hook.
 *
 * Android's medium/heavy impacts feel too strong, so non-iOS platforms always
 * use the Light style regardless of the requested strength.
 */
export function useHaptics(): (strength?: HapticStrength) => void {
  const hapticsDisabled = useSettingsStore((state) => state.hapticsDisabled);

  return useCallback(
    (strength: HapticStrength = 'Medium') => {
      if (hapticsDisabled || Platform.OS === 'web') {
        return;
      }

      const style =
        Platform.OS === 'ios'
          ? Haptics.ImpactFeedbackStyle[strength]
          : Haptics.ImpactFeedbackStyle.Light;

      // impactAsync returns a promise; fire-and-forget is intentional and any
      // failure (e.g. unsupported device) must not interrupt the interaction.
      void Haptics.impactAsync(style).catch(() => {});
    },
    [hapticsDisabled],
  );
}
