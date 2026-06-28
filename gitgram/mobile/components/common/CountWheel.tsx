import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * Animated rolling count ("odometer") that pairs with a like button, ported from
 * Bluesky's `src/lib/custom-animations/CountWheel.tsx`.
 *
 * Bluesky's original uses reanimated entering/exiting layout animations. This
 * product does not depend on reanimated, so the roll is reimplemented on the
 * React Native `Animated` API: when the count changes, the previous value slides
 * out while the new value slides in, in the direction implied by the toggle
 * (up when liking, down when unliking). The `decideShouldRoll` heuristic is
 * preserved verbatim so big numbers (e.g. 1.2k) snap instead of rolling.
 */
interface CountWheelProps {
  /** Current (already-updated) count. */
  count: number;
  /** Whether the associated control is toggled on (e.g. liked). */
  isToggled: boolean;
  /** False on first mount so the initial render does not animate. */
  hasBeenToggled: boolean;
  /** Renders a single count value; lets the caller control text styling. */
  renderCount: (props: { count: number }) => React.ReactNode;
}

const ROLL_DISTANCE = 18;
const DURATION = 300;

/**
 * Mirrors Bluesky's `decideShouldRoll`: roll for small/mid counts and at the
 * boundaries of each hundred, otherwise snap (so "1.2k"-style values do not
 * roll digit-by-digit).
 */
function decideShouldRoll(isToggled: boolean, count: number): boolean {
  if (!isToggled && count === 1) {
    return true;
  }
  if (count > 1 && count < 1000) {
    return true;
  }
  if (count > 0) {
    const mod = count % 100;
    if (isToggled && mod === 0) {
      return true;
    }
    if (!isToggled && mod === 99) {
      return true;
    }
  }
  return false;
}

export function CountWheel({
  count,
  isToggled,
  hasBeenToggled,
  renderCount,
}: CountWheelProps) {
  const [displayCount, setDisplayCount] = useState(count);
  const [prevCount, setPrevCount] = useState(count);
  const [animating, setAnimating] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const prevIsToggled = useRef(isToggled);

  useEffect(() => {
    // No animation on first mount, or when nothing meaningful changed.
    if (count === displayCount) {
      return;
    }

    const toggledChanged = isToggled !== prevIsToggled.current;
    const shouldRoll =
      hasBeenToggled && toggledChanged && decideShouldRoll(isToggled, count);
    prevIsToggled.current = isToggled;

    if (!shouldRoll) {
      // Snap without animating.
      setPrevCount(count);
      setDisplayCount(count);
      return;
    }

    setPrevCount(displayCount);
    setDisplayCount(count);
    setAnimating(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setAnimating(false);
      }
    });
  }, [count, displayCount, hasBeenToggled, isToggled, progress]);

  if (displayCount <= 0) {
    return null;
  }

  // Liking rolls the new value up from below; unliking rolls it down from above.
  const incoming = isToggled ? 1 : -1;

  const currentTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [incoming * ROLL_DISTANCE, 0],
  });
  const currentOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const prevTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -incoming * ROLL_DISTANCE],
  });
  const prevOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  if (!animating) {
    return <View style={styles.container}>{renderCount({ count: displayCount })}</View>;
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: currentOpacity,
          transform: [{ translateY: currentTranslate }],
        }}
      >
        {renderCount({ count: displayCount })}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.previous,
          {
            opacity: prevOpacity,
            transform: [{ translateY: prevTranslate }],
          },
        ]}
      >
        {renderCount({ count: prevCount })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previous: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
});

export default CountWheel;
