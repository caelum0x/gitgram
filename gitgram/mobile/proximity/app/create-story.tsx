import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { apiClient } from '../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_HEIGHT = Dimensions.get('window').height;

const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  white: '#FFFFFF',
  error: '#F87171',
  success: '#34D399',
} as const;

const BACKGROUND_COLORS: readonly string[] = [
  '#0F0F1A',
  '#1A1A2E',
  '#312E81',
  '#1E3A5F',
  '#14532D',
  '#4A1942',
  '#431407',
  '#1C1917',
] as const;

type Privacy = 'everyone' | 'followers';
type Mode = 'text' | 'colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateStoryPayload {
  textContent: string;
  backgroundColor: string;
  privacy: Privacy;
}

interface CreateStoryResponse {
  id: string;
  textContent: string;
  backgroundColor: string;
  privacy: Privacy;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Color swatch component
// ---------------------------------------------------------------------------

interface ColorSwatchProps {
  color: string;
  selected: boolean;
  onPress: (color: string) => void;
}

function ColorSwatch({ color, selected, onPress }: ColorSwatchProps) {
  return (
    <Pressable
      onPress={() => onPress(color)}
      style={({ pressed }) => [
        swatchStyles.circle,
        { backgroundColor: color },
        selected && swatchStyles.selected,
        pressed && swatchStyles.pressed,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Background color ${color}`}
    />
  );
}

const swatchStyles = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: Colors.white,
    transform: [{ scale: 1.15 }],
  },
  pressed: {
    opacity: 0.8,
  },
});

// ---------------------------------------------------------------------------
// Privacy toggle
// ---------------------------------------------------------------------------

interface PrivacyToggleProps {
  value: Privacy;
  onChange: (next: Privacy) => void;
}

function PrivacyToggle({ value, onChange }: PrivacyToggleProps) {
  return (
    <View style={privacyStyles.container}>
      <Pressable
        style={[privacyStyles.option, value === 'everyone' && privacyStyles.optionActive]}
        onPress={() => onChange('everyone')}
        accessibilityRole="radio"
        accessibilityState={{ checked: value === 'everyone' }}
      >
        <Text
          style={[
            privacyStyles.optionText,
            value === 'everyone' && privacyStyles.optionTextActive,
          ]}
        >
          Everyone
        </Text>
      </Pressable>

      <Pressable
        style={[privacyStyles.option, value === 'followers' && privacyStyles.optionActive]}
        onPress={() => onChange('followers')}
        accessibilityRole="radio"
        accessibilityState={{ checked: value === 'followers' }}
      >
        <Text
          style={[
            privacyStyles.optionText,
            value === 'followers' && privacyStyles.optionTextActive,
          ]}
        >
          Followers
        </Text>
      </Pressable>
    </View>
  );
}

const privacyStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 17,
  },
  optionActive: {
    backgroundColor: Colors.primary,
  },
  optionText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextActive: {
    color: Colors.white,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CreateStoryScreen() {
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState<string>(BACKGROUND_COLORS[0]);
  const [privacy, setPrivacy] = useState<Privacy>('everyone');
  const [mode, setMode] = useState<Mode>('text');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPost = textContent.trim().length > 0;

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePost = useCallback(async () => {
    if (!canPost || posting) return;

    setPosting(true);
    setError(null);

    try {
      const payload: CreateStoryPayload = {
        textContent: textContent.trim(),
        backgroundColor,
        privacy,
      };

      await apiClient<CreateStoryResponse>('/v1/stories', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to post story. Please try again.';
      setError(message);
      setPosting(false);
    }
  }, [canPost, posting, textContent, backgroundColor, privacy]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'text' ? 'colors' : 'text'));
  }, []);

  const handleColorSelect = useCallback((color: string) => {
    setBackgroundColor(color);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            disabled={posting}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          <Text style={styles.headerTitle}>New Story</Text>

          <Pressable
            onPress={handlePost}
            style={({ pressed }) => [
              styles.postBtn,
              !canPost && styles.postBtnDisabled,
              pressed && canPost && styles.btnPressed,
            ]}
            disabled={!canPost || posting}
            accessibilityRole="button"
            accessibilityLabel="Post Story"
            accessibilityState={{ disabled: !canPost || posting }}
          >
            {posting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={[styles.postBtnText, !canPost && styles.postBtnTextDisabled]}>
                Post Story
              </Text>
            )}
          </Pressable>
        </View>

        {/* Error banner */}
        {error !== null ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Main content area */}
        <View style={[styles.canvas, { backgroundColor }]}>
          {mode === 'text' ? (
            <TextInput
              style={styles.textInput}
              value={textContent}
              onChangeText={setTextContent}
              placeholder="Tap to type..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              textAlignVertical="center"
              autoFocus
              maxLength={500}
              editable={!posting}
              accessibilityLabel="Story text"
              accessibilityHint="Type the content of your story here"
            />
          ) : (
            <View style={styles.colorPickerOverlay}>
              <Text style={styles.colorPickerLabel}>Choose background</Text>
            </View>
          )}
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Color picker row (visible in both modes, prominent in colors mode) */}
          <View style={styles.colorRow}>
            {BACKGROUND_COLORS.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                selected={backgroundColor === color}
                onPress={handleColorSelect}
              />
            ))}
          </View>

          {/* Mode toggle + privacy row */}
          <View style={styles.controlsRow}>
            <Pressable
              onPress={toggleMode}
              style={({ pressed }) => [styles.modeToggleBtn, pressed && styles.btnPressed]}
              disabled={posting}
              accessibilityRole="button"
              accessibilityLabel={mode === 'text' ? 'Switch to color picker' : 'Switch to text input'}
            >
              <Text style={styles.modeToggleText}>
                {mode === 'text' ? 'Colors' : 'Text'}
              </Text>
            </Pressable>

            <PrivacyToggle value={privacy} onChange={setPrivacy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    padding: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  closeIcon: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  postBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  postBtnDisabled: {
    backgroundColor: Colors.border,
  },
  postBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  postBtnTextDisabled: {
    color: Colors.textMuted,
  },
  btnPressed: {
    opacity: 0.65,
  },

  // Error banner
  errorBanner: {
    backgroundColor: '#7F1D1D',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Canvas (text / color mode area)
  canvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 24,
    fontSize: 24,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: '500',
  },
  colorPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPickerLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: Colors.background,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 14,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Mode toggle button
  modeToggleBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 80,
    alignItems: 'center',
  },
  modeToggleText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
});
