import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../../constants/Colors';

interface LoadLatestButtonProps {
  /** Whether the pill is shown at all (typically: user has scrolled down). */
  visible: boolean;
  /** Highlights the pill and shows a dot when fresh content is available. */
  showIndicator?: boolean;
  /** Optional short count label (e.g. "3") rendered next to the arrow. */
  label?: string;
  /** Scroll the feed to the top and reload the latest content. */
  onPress: () => void;
}

/**
 * Floating "load latest / new posts" pill, ported from Bluesky's LoadLatestBtn.
 *
 * Reimplemented on the product stack: the React Native `Animated` API (no
 * reanimated) drives a fade/translate, and MaterialIcons + the GitHub palette
 * replace ALF. Render it as a sibling of the feed FlatList inside a
 * position-relative container.
 */
export default function LoadLatestButton({
  visible,
  showIndicator = false,
  label,
  onPress,
}: LoadLatestButtonProps) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  // Keep it mounted only while it can be seen so it never intercepts touches
  // on the feed when hidden.
  if (!visible) {
    return null;
  }

  const accessibilityLabel = showIndicator
    ? 'Load new posts'
    : 'Scroll to top';

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
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.pill,
          showIndicator && styles.pillActive,
          pressed && styles.pillPressed,
        ]}
        hitSlop={8}
      >
        <Icon
          name="arrow-upward"
          size={18}
          color={Colors.white}
          style={styles.icon}
        />
        {showIndicator && (
          <Text style={styles.label} numberOfLines={1}>
            {label && label.trim().length > 0
              ? `${label} new`
              : 'New posts'}
          </Text>
        )}
        {showIndicator && !label && <View style={styles.dot} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillActive: {
    backgroundColor: Colors.buttonPrimary,
    borderColor: Colors.buttonPrimary,
  },
  pillPressed: {
    opacity: 0.85,
  },
  icon: {
    marginRight: 0,
  },
  label: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
});
