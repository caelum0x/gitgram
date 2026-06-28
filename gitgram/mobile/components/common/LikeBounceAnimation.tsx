import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const AnimationValues = {
  opacity: { initial: 0, final: 1 },
  bounce: { initial: 0.4, final: 1 },
};

export interface LikeBounceAnimationHandle {
  animate: () => void;
}

interface LikeBounceAnimationProps {
  // Diameter of the heart burst. Defaults to a large Instagram-style burst.
  size?: number;
  // Heart fill color. Defaults to white for overlays on imagery.
  color?: string;
  // Override container positioning (e.g. for full-screen media).
  style?: StyleProp<ViewStyle>;
}

/**
 * Animated heart-burst overlay for double-tap-to-like. Exposes an imperative
 * `animate()` via ref so the parent fires the burst on a recognised double tap.
 *
 * Ported from proximity's LikeBounceAnimation: pure react-native Animated
 * (spring scale + fade in/out), no reanimated dependency.
 */
const LikeBounceAnimation = forwardRef<LikeBounceAnimationHandle, LikeBounceAnimationProps>(
  ({ size = 96, color = '#FFFFFF', style }, ref) => {
    const [animating, setAnimating] = useState(false);
    const likeOpacity = useRef(new Animated.Value(AnimationValues.opacity.initial)).current;
    const likeBounce = useRef(new Animated.Value(AnimationValues.bounce.initial)).current;

    useImperativeHandle(
      ref,
      () => ({
        animate: () => {
          if (animating) return;
          setAnimating(true);

          const opacityConfig = { duration: 250, useNativeDriver: true };

          Animated.parallel([
            Animated.spring(likeBounce, {
              toValue: AnimationValues.bounce.final,
              friction: 2,
              useNativeDriver: true,
            }),
            Animated.timing(likeOpacity, {
              toValue: AnimationValues.opacity.final,
              ...opacityConfig,
            }),
          ]).start(() => {
            Animated.timing(likeOpacity, {
              toValue: AnimationValues.opacity.initial,
              ...opacityConfig,
            }).start(() => {
              likeBounce.setValue(AnimationValues.bounce.initial);
              setAnimating(false);
            });
          });
        },
      }),
      [animating, likeBounce, likeOpacity],
    );

    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.container,
          style,
          {
            opacity: likeOpacity,
            transform: [{ scale: likeBounce }],
          },
        ]}
      >
        <Icon name="favorite" color={color} size={size} />
      </Animated.View>
    );
  },
);

LikeBounceAnimation.displayName = 'LikeBounceAnimation';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LikeBounceAnimation;
