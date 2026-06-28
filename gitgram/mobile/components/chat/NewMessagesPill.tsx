import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../../constants/Colors';
import { useHaptics } from '../../hooks/useHaptics';

/**
 * Floating "new messages" pill for an inverted chat list, ported from Bluesky's
 * `src/components/dms/NewMessagesPill.tsx`.
 *
 * Bluesky's original uses reanimated entering/exiting animations and ALF atoms.
 * This product does not depend on reanimated, so the fade/scale is reimplemented
 * on the React Native `Animated` API (matching `LoadLatestButton`) and styled
 * with MaterialIcons + the GitHub `Colors` palette.
 *
 * Render it as an absolutely-positioned sibling of the chat `FlatList`. Because
 * the list is `inverted`, offset 0 is the newest message ("the bottom"), so the
 * pill points down and taps scroll back to offset 0.
 */
interface NewMessagesPillProps {
  /** Whether the pill is shown (typically: scrolled away + new message arrived). */
  visible: boolean;
  /** Scroll the inverted list back to the newest message. */
  onPress: () => void;
}

export function NewMessagesPill({ visible, onPress }: NewMessagesPillProps) {
  const haptics = useHaptics();
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  // Keep it unmounted while hidden so it never intercepts list touches.
  if (!visible) {
    return null;
  }

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 1.075,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    haptics('Light');
    onPress();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
            { scale },
          ],
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel="Scroll to newest messages"
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        hitSlop={8}
      >
        <Icon name="arrow-downward" size={22} color={Colors.text} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  pill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillPressed: {
    opacity: 0.85,
  },
});

export default NewMessagesPill;
