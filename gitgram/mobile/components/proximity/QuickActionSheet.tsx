import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (matches create.tsx)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  white: '#FFFFFF',
  backdrop: 'rgba(0, 0, 0, 0.6)',
} as const;

const ANIMATION_DURATION_MS = 260;

// ---------------------------------------------------------------------------
// Action model
// ---------------------------------------------------------------------------

export interface QuickAction {
  /** Stable identifier used as the React key. */
  id: string;
  /** Emoji or short glyph shown in the leading badge. */
  icon: string;
  /** Primary label. */
  label: string;
  /** Secondary descriptive line. */
  subtitle: string;
  /** Route pushed when the action is selected. */
  route: string;
}

/**
 * Default create actions for the mobile Create tab. Every route resolves to a
 * real screen: the post composer is the shared modal at /(modals)/create-post,
 * snippets/stories use their dedicated create screens, and reels use the full
 * editor at /create/reel (trim/effects/music).
 */
export const DEFAULT_QUICK_ACTIONS: ReadonlyArray<QuickAction> = [
  {
    id: 'post',
    icon: '✏️',
    label: 'New Post',
    subtitle: 'Share an update with your followers',
    route: '/(modals)/create-post',
  },
  {
    id: 'snippet',
    icon: '✨',
    label: 'New Snippet',
    subtitle: 'Post a piece of code with syntax highlighting',
    route: '/snippets/create',
  },
  {
    id: 'story',
    icon: '📸',
    label: 'New Story',
    subtitle: 'A moment that disappears in 24 hours',
    route: '/story/create',
  },
  {
    id: 'repo',
    icon: '📦',
    label: 'Share Repository',
    subtitle: 'Spotlight a repo on your profile',
    route: '/(modals)/create-post?mode=repo',
  },
  {
    id: 'reel',
    icon: '🎬',
    label: 'Create a Reel',
    subtitle: 'Record or upload a short video with effects & music',
    route: '/create/reel',
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuickActionSheetProps {
  /** Whether the sheet is mounted/visible. */
  visible: boolean;
  /** Called when the user dismisses (backdrop tap or after slide-out). */
  onClose: () => void;
  /** Called with the chosen action's route. */
  onSelect: (route: string) => void;
  /** Optional override for the action list. */
  actions?: ReadonlyArray<QuickAction>;
  /** Optional heading shown above the actions. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Single action row
// ---------------------------------------------------------------------------

interface ActionRowProps {
  action: QuickAction;
  onPress: (route: string) => void;
}

function ActionRow({ action, onPress }: ActionRowProps) {
  const handlePress = useCallback(() => onPress(action.route), [action.route, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.subtitle}
    >
      <View style={styles.iconBadge}>
        <Text style={styles.iconText}>{action.icon}</Text>
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{action.label}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {action.subtitle}
        </Text>
      </View>
      <Text style={styles.chevron}>{'›'}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// QuickActionSheet
// ---------------------------------------------------------------------------

export default function QuickActionSheet({
  visible,
  onClose,
  onSelect,
  actions = DEFAULT_QUICK_ACTIONS,
  title = 'Create',
}: QuickActionSheetProps) {
  const insets = useSafeAreaInsets();

  // Backdrop opacity (0 hidden, 1 shown) drives both fade + slide.
  const progress = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback(
    (toValue: number, onDone?: () => void) => {
      Animated.timing(progress, {
        toValue,
        duration: ANIMATION_DURATION_MS,
        easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    },
    [progress],
  );

  // Slide in whenever the sheet becomes visible.
  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      animateTo(1);
    }
  }, [visible, animateTo, progress]);

  // Animate out, then notify the parent.
  const handleDismiss = useCallback(() => {
    animateTo(0, onClose);
  }, [animateTo, onClose]);

  // Animate out, then route.
  const handleSelect = useCallback(
    (route: string) => {
      animateTo(0, () => onSelect(route));
    },
    [animateTo, onSelect],
  );

  if (!visible) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_TRAVEL, 0],
  });

  const sheetPaddingBottom = Math.max(insets.bottom, 12) + 8;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={styles.backdropPress}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: sheetPaddingBottom, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>What do you want to share?</Text>
        </View>

        <View style={styles.actions}>
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} onPress={handleSelect} />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Distance the sheet travels on slide-in/out. Generous so it clears the screen.
const SHEET_TRAVEL = 600;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.backdrop,
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowPressed: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primary,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 12,
  },
  iconText: {
    fontSize: 22,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: Colors.primaryLight,
    fontSize: 22,
    fontWeight: '700',
    marginLeft: 8,
  },
  cancel: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelPressed: {
    backgroundColor: Colors.surfaceElevated,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
