import React, { useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import {
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../../constants/Colors';
import { useHaptics } from '../../hooks/useHaptics';

/**
 * Swipe a message bubble inward to reply, Signal/WhatsApp style. Ported from
 * Bluesky's `src/components/dms/SwipeToReply.tsx`.
 *
 * Bluesky's original is built on reanimated worklets and ALF tokens. This
 * product depends on neither, so the gesture is reimplemented on
 * `react-native-gesture-handler`'s `PanGestureHandler` (already used elsewhere
 * in the app) driving a React Native `Animated.Value`, styled with the GitHub
 * `Colors` palette. The behaviour is preserved 1:1:
 *
 * - Self messages (right-aligned) swipe left; others' messages swipe right.
 * - 1:1 movement up to the activation threshold, then exponentially decaying
 *   "resistance" toward a soft cap (`threshold + MAX_OVERSHOOT`).
 * - Crossing the threshold fires a single medium haptic.
 * - Releasing past the threshold triggers `onReply`; the bubble always springs
 *   home afterwards, even if the gesture is cancelled.
 *
 * A stationary reply icon sits in the gutter on the bubble's resting edge and
 * fades/scales in as the bubble slides away from it.
 */
interface SwipeToReplyProps {
  /** Right-aligned (current user's) bubble swipes left; others swipe right. */
  isFromSelf: boolean;
  /** Fired once when a swipe is released past the activation threshold. */
  onReply: () => void;
  /** Disable the gesture entirely (e.g. for pending/optimistic messages). */
  enabled?: boolean;
  children: React.ReactNode;
}

// Distance the bubble must travel before releasing fires a reply.
const ACTIVATION_THRESHOLD = 56;
// Past the activation point the bubble keeps moving with increasing resistance,
// asymptotically approaching this much extra travel.
const MAX_OVERSHOOT = 32;
const ICON_DIAMETER = 32;
// Bubble can occupy at most this share of the row, matching the chat styles.
const MESSAGE_BUBBLE_MAX_WIDTH_PCT = '75%';

/**
 * 1:1 up to `ACTIVATION_THRESHOLD`, then exponentially diminishing travel so the
 * bubble eases toward a soft cap rather than hitting a hard wall.
 */
function applyResistance(value: number): number {
  const abs = Math.abs(value);
  if (abs <= ACTIVATION_THRESHOLD) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const excess = abs - ACTIVATION_THRESHOLD;
  return (
    sign *
    (ACTIVATION_THRESHOLD +
      MAX_OVERSHOOT * (1 - Math.exp(-excess / MAX_OVERSHOOT)))
  );
}

export function SwipeToReply({
  isFromSelf,
  onReply,
  enabled = true,
  children,
}: SwipeToReplyProps) {
  const haptics = useHaptics();

  const transX = useRef(new Animated.Value(0)).current;
  // Tracks whether the haptic has fired for the current swipe so it only fires
  // once per crossing of the threshold.
  const hasHitRef = useRef(false);

  const onGestureEvent = useMemo(
    () =>
      (event: PanGestureHandlerGestureEvent) => {
        const { translationX } = event.nativeEvent;
        // Arm only on the inward axis; the outward direction is clamped so the
        // bubble can't be dragged off its own edge.
        const directional = isFromSelf
          ? Math.min(translationX, 0)
          : Math.max(translationX, 0);
        const resisted = applyResistance(directional);
        transX.setValue(resisted);

        const pastThreshold = Math.abs(resisted) >= ACTIVATION_THRESHOLD;
        if (pastThreshold && !hasHitRef.current) {
          hasHitRef.current = true;
          haptics('Medium');
        } else if (!pastThreshold && hasHitRef.current) {
          hasHitRef.current = false;
        }
      },
    [isFromSelf, haptics, transX],
  );

  const onHandlerStateChange = useMemo(
    () =>
      (event: PanGestureHandlerStateChangeEvent) => {
        const { state, oldState } = event.nativeEvent;
        // The gesture has just finished (END / FAIL / CANCELLED): decide whether
        // to fire the reply, then always animate the bubble home.
        if (oldState === State.ACTIVE) {
          if (hasHitRef.current && state === State.END) {
            onReply();
          }
          hasHitRef.current = false;
          Animated.timing(transX, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    [onReply, transX],
  );

  const iconOpacity = transX.interpolate({
    inputRange: isFromSelf
      ? [-ACTIVATION_THRESHOLD, 0]
      : [0, ACTIVATION_THRESHOLD],
    outputRange: isFromSelf ? [1, 0] : [0, 1],
    extrapolate: 'clamp',
  });

  const iconScale = transX.interpolate({
    inputRange: isFromSelf
      ? [-ACTIVATION_THRESHOLD, 0]
      : [0, ACTIVATION_THRESHOLD],
    outputRange: isFromSelf ? [1, 0.5] : [0.5, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.iconGutter,
          isFromSelf ? styles.iconGutterRight : styles.iconGutterLeft,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <View style={styles.iconCircle}>
          <Icon name="reply" size={18} color={Colors.textSecondary} />
        </View>
      </Animated.View>

      <PanGestureHandler
        enabled={enabled}
        activeOffsetX={isFromSelf ? [-10, 10000] : [-10000, 10]}
        failOffsetY={[-12, 12]}
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
      >
        <Animated.View
          style={[
            styles.bubbleWrap,
            isFromSelf ? styles.selfEnd : styles.selfStart,
            { transform: [{ translateX: transX }] },
          ]}
        >
          {children}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  iconGutter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  iconGutterLeft: {
    left: 16,
  },
  iconGutterRight: {
    right: 16,
  },
  iconCircle: {
    width: ICON_DIAMETER,
    height: ICON_DIAMETER,
    borderRadius: ICON_DIAMETER / 2,
    backgroundColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleWrap: {
    maxWidth: MESSAGE_BUBBLE_MAX_WIDTH_PCT,
  },
  selfEnd: {
    alignSelf: 'flex-end',
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
});

export default SwipeToReply;
