import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '../../constants/Colors';
import { useHaptics } from '../../hooks/useHaptics';

/**
 * Quick emoji reaction picker for a message, ported from Bluesky's
 * `src/components/dms/EmojiReactionPicker.tsx`.
 *
 * Bluesky's original renders inside its ALF `ContextMenu` and is positioned
 * relative to the long-pressed message. This product has no ContextMenu
 * primitive, so the picker is reimplemented as a centered, dismiss-on-backdrop
 * `Modal` (the same pattern as `PostOptionsModal`) using the GitHub `Colors`
 * palette. The quick-reaction emoji set matches Bluesky's.
 *
 * Selecting an emoji that the user has already applied toggles it off, so the
 * picker doubles as a remove affordance for existing reactions.
 */
export const REACTION_EMOJIS = ['❤️', '👍', '😆', '👀', '😢'] as const;

interface EmojiReactionPickerProps {
  visible: boolean;
  /** Emoji the current user has already reacted with (rendered highlighted). */
  reactedEmojis?: string[];
  /** Whether the user has hit the per-message reaction cap (disables new ones). */
  limitReached?: boolean;
  onClose: () => void;
  /** Called with the chosen emoji; the caller performs add/remove. */
  onSelect: (emoji: string) => void;
}

export function EmojiReactionPicker({
  visible,
  reactedEmojis = [],
  limitReached = false,
  onClose,
  onSelect,
}: EmojiReactionPickerProps) {
  const haptics = useHaptics();

  const handleSelect = (emoji: string) => {
    haptics('Light');
    onSelect(emoji);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reaction picker"
      >
        {/* Stop propagation so taps on the tray don't dismiss it. */}
        <Pressable style={styles.tray} onPress={() => {}}>
          {REACTION_EMOJIS.map((emoji) => {
            const alreadyReacted = reactedEmojis.includes(emoji);
            // When at the cap, only allow toggling emoji already applied.
            const disabled = limitReached && !alreadyReacted;
            return (
              <TouchableOpacity
                key={emoji}
                onPress={() => handleSelect(emoji)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: alreadyReacted, disabled }}
                accessibilityLabel={
                  alreadyReacted ? `Remove ${emoji} reaction` : `React with ${emoji}`
                }
                style={[
                  styles.emojiButton,
                  alreadyReacted && styles.emojiButtonActive,
                  disabled && styles.emojiButtonDisabled,
                ]}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tray: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonActive: {
    backgroundColor: `${Colors.primary}33`,
  },
  emojiButtonDisabled: {
    opacity: 0.4,
  },
  emoji: {
    fontSize: 28,
  },
});

export default EmojiReactionPicker;
