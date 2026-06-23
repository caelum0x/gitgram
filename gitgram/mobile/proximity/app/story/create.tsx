import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { apiClient } from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONTENT_HEIGHT = SCREEN_WIDTH * (16 / 9);

const Colors = {
  background: '#000000',
  surface: '#0F0F1A',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  white: '#FFFFFF',
  border: '#2D2D50',
  overlay: 'rgba(0,0,0,0.55)',
  chipActive: '#7C3AED',
  chipInactive: '#1A1A2E',
} as const;

const BG_PALETTE: readonly string[] = [
  '#7C3AED',
  '#DB2777',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#0F0F1A',
];

type StoryMode = 'text' | 'photo';
type Privacy = 'public' | 'followers';

interface StoryCreatePayload {
  content?: string;
  imageUrl?: string;
  backgroundColor: string;
  privacy: Privacy;
  duration?: number;
}

interface StoryCreateResponse {
  id: string;
  authorId: string;
  content: string | null;
  imageUrl: string | null;
  backgroundColor: string;
  privacy: Privacy;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatExpiresIn(): string {
  return '24h';
}

function modeLabel(mode: StoryMode): string {
  return mode === 'text' ? 'Aa' : '\u{1F4F7}';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateStoryScreen(): React.JSX.Element {
  const [mode, setMode] = useState<StoryMode>('text');
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState<string>(BG_PALETTE[0]);
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePickImage = useCallback(() => {
    // Placeholder: integrate expo-image-picker here
    Alert.alert('Media Picker', 'Attach expo-image-picker to enable photo selection.');
  }, []);

  const handlePost = useCallback(async () => {
    if (mode === 'text' && text.trim().length === 0) {
      Alert.alert('Empty Story', 'Please enter some text for your story.');
      return;
    }
    if (mode === 'photo' && !imageUri) {
      Alert.alert('No Photo', 'Please select a photo for your story.');
      return;
    }

    setPosting(true);
    try {
      const payload: StoryCreatePayload = {
        backgroundColor: bgColor,
        privacy,
      };

      if (mode === 'text') {
        payload.content = text.trim();
      } else {
        payload.imageUrl = imageUri ?? undefined;
      }

      await apiClient<StoryCreateResponse>('/api/v1/stories', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.replace('/(tabs)');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post story.';
      Alert.alert('Error', message);
    } finally {
      setPosting(false);
    }
  }, [mode, text, imageUri, bgColor, privacy]);

  const toggleMode = useCallback((next: StoryMode) => {
    setMode(next);
    if (next === 'photo') {
      handlePickImage();
    }
  }, [handlePickImage]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Close">
            <Text style={styles.iconBtnText}>✕</Text>
          </Pressable>

          <View style={styles.titleRow}>
            <Text style={styles.topBarTitle}>Story</Text>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{formatExpiresIn()}</Text>
            </View>
          </View>

          {posting ? (
            <ActivityIndicator color={Colors.primary} style={styles.iconBtn} />
          ) : (
            <Pressable
              onPress={handlePost}
              style={[styles.postBtn, text.trim().length === 0 && mode === 'text' && styles.postBtnDisabled]}
              accessibilityLabel="Post story"
            >
              <Text style={styles.postBtnText}>Post</Text>
            </Pressable>
          )}
        </View>

        {/* Main Content Area (9:16) */}
        <View style={[styles.contentArea, { backgroundColor: mode === 'text' ? bgColor : Colors.background }]}>
          {mode === 'text' ? (
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="Tap to type..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              textAlign="center"
              textAlignVertical="center"
              maxLength={280}
              autoFocus
            />
          ) : (
            <Pressable style={styles.photoPlaceholder} onPress={handlePickImage}>
              {imageUri ? (
                <View style={styles.imagePreview}>
                  <Text style={styles.photoPlaceholderText}>Photo selected</Text>
                  <Text style={styles.photoHint}>{imageUri}</Text>
                </View>
              ) : (
                <View style={styles.photoPlaceholderInner}>
                  <Text style={styles.photoIcon}>📷</Text>
                  <Text style={styles.photoPlaceholderText}>Tap to select photo</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          {/* Background Color Row (text mode only) */}
          {mode === 'text' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.paletteRow}
            >
              {BG_PALETTE.map((color) => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    bgColor === color && styles.colorSwatchSelected,
                  ]}
                  onPress={() => setBgColor(color)}
                  accessibilityLabel={`Background color ${color}`}
                />
              ))}
            </ScrollView>
          )}

          {/* Mode Selector */}
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
              onPress={() => toggleMode('text')}
              accessibilityLabel="Text mode"
            >
              <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>
                Aa
              </Text>
            </Pressable>

            <Pressable
              style={[styles.modeBtn, mode === 'photo' && styles.modeBtnActive]}
              onPress={() => toggleMode('photo')}
              accessibilityLabel="Photo mode"
            >
              <Text style={[styles.modeBtnText, mode === 'photo' && styles.modeBtnTextActive]}>
                📷
              </Text>
            </Pressable>
          </View>

          {/* Privacy Selector */}
          <View style={styles.privacyRow}>
            <Pressable
              style={[styles.privacyChip, privacy === 'public' && styles.privacyChipActive]}
              onPress={() => setPrivacy('public')}
              accessibilityLabel="Share with Everyone"
            >
              <Text style={[styles.privacyChipText, privacy === 'public' && styles.privacyChipTextActive]}>
                🌍 Everyone
              </Text>
            </Pressable>

            <Pressable
              style={[styles.privacyChip, privacy === 'followers' && styles.privacyChipActive]}
              onPress={() => setPrivacy('followers')}
              accessibilityLabel="Share with Close Friends"
            >
              <Text style={[styles.privacyChipText, privacy === 'followers' && styles.privacyChipTextActive]}>
                ⭐ Close Friends
              </Text>
            </Pressable>
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
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timerBadge: {
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timerText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '600',
  },
  postBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  postBtnDisabled: {
    opacity: 0.45,
  },
  postBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // Content area
  contentArea: {
    width: SCREEN_WIDTH,
    height: Math.min(CONTENT_HEIGHT, SCREEN_HEIGHT * 0.58),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  textInput: {
    width: '85%',
    color: Colors.white,
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 36,
    textAlign: 'center',
    textAlignVertical: 'center',
    minHeight: 120,
  },
  photoPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderInner: {
    alignItems: 'center',
    gap: 12,
  },
  imagePreview: {
    alignItems: 'center',
    gap: 8,
  },
  photoIcon: {
    fontSize: 48,
  },
  photoPlaceholderText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '500',
  },
  photoHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    maxWidth: SCREEN_WIDTH * 0.8,
    textAlign: 'center',
  },

  // Bottom controls
  bottomControls: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 12,
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: Colors.white,
    transform: [{ scale: 1.15 }],
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 16,
  },
  modeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  modeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  modeBtnText: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  modeBtnTextActive: {
    color: Colors.primaryLight,
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  privacyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.chipInactive,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  privacyChipActive: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderColor: Colors.primary,
  },
  privacyChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  privacyChipTextActive: {
    color: Colors.primaryLight,
  },
});
