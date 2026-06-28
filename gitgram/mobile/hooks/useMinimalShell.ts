import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * "Minimal shell" hide-on-scroll, reimplemented from Bluesky's
 * useMinimalShellTransform + ScrollContext + minimal-mode state
 * (src/lib/hooks/useMinimalShellTransform.ts).
 *
 * Bluesky drives this with reanimated shared values; we reimplement on the RN
 * `Animated` API the product already uses (LoadLatestButton, GestureActionView)
 * so no new dependency is pulled in.
 *
 * `mode` is a single shared Animated.Value in [0, 1]:
 *   0 = shell fully visible, 1 = shell fully hidden (collapsed).
 *
 * The value is a module-level singleton so the feed header and the bottom tab
 * bar (which live in different component trees) collapse and reveal in sync.
 */

// Singleton: shared by every consumer (header + tab bar) so they animate as one.
const sharedMode = new Animated.Value(0);

// Distance (px) the user must scroll in a direction before we flip the shell.
const SCROLL_THRESHOLD = 12;
// Don't react to scrolls near the very top — the header should always be shown.
const TOP_REVEAL_OFFSET = 24;
const ANIM_DURATION = 200;

function setMode(target: 0 | 1): void {
  Animated.timing(sharedMode, {
    toValue: target,
    duration: ANIM_DURATION,
    easing: Easing.out(Easing.cubic),
    // translate/opacity are native-driver safe.
    useNativeDriver: true,
  }).start();
}

export interface MinimalShellScroll {
  /** Attach to a scrollable's `onScroll`. Pair with `scrollEventThrottle`. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Force the shell back to fully-visible (e.g. on tab focus / soft reset). */
  reveal: () => void;
}

/**
 * Returns a scroll handler that collapses the shell on downward scroll and
 * reveals it on upward scroll. Call once per scrollable feed.
 */
export function useMinimalShell(): MinimalShellScroll {
  const lastOffset = useRef(0);
  const lastMode = useRef<0 | 1>(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const delta = offsetY - lastOffset.current;

      // Always reveal near the top regardless of direction.
      if (offsetY <= TOP_REVEAL_OFFSET) {
        if (lastMode.current !== 0) {
          lastMode.current = 0;
          setMode(0);
        }
        lastOffset.current = offsetY;
        return;
      }

      if (Math.abs(delta) < SCROLL_THRESHOLD) {
        return;
      }

      const next: 0 | 1 = delta > 0 ? 1 : 0; // scrolling down hides, up reveals
      if (next !== lastMode.current) {
        lastMode.current = next;
        setMode(next);
      }
      lastOffset.current = offsetY;
    },
    [],
  );

  const reveal = useCallback(() => {
    lastMode.current = 0;
    lastOffset.current = 0;
    setMode(0);
  }, []);

  // Reset the shared shell when the consuming screen unmounts so a collapsed
  // header never leaks into a screen without a scroll handler.
  useEffect(() => {
    return () => {
      setMode(0);
    };
  }, []);

  return { onScroll, reveal };
}

/**
 * Animated style for a top header: slides up and fades out as the shell
 * collapses. `height` is the header's pixel height (the collapse distance).
 */
export function useMinimalHeaderStyle(height: number): {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: { translateY: Animated.AnimatedInterpolation<number> }[];
} {
  return {
    opacity: sharedMode.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        translateY: sharedMode.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -height],
        }),
      },
    ],
  };
}

/**
 * Animated style for the bottom tab bar: slides down and fades out as the
 * shell collapses. `height` is the tab bar's pixel height.
 */
export function useMinimalFooterStyle(height: number): {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: { translateY: Animated.AnimatedInterpolation<number> }[];
} {
  return {
    opacity: sharedMode.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        translateY: sharedMode.interpolate({
          inputRange: [0, 1],
          outputRange: [0, height],
        }),
      },
    ],
  };
}
