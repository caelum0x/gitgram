import React from 'react';
import { Animated } from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';

import { useMinimalFooterStyle } from '../../hooks/useMinimalShell';

/** Height of the tab bar; the footer collapses by this much when hidden. */
const TAB_BAR_HEIGHT = 80;

/**
 * Bottom tab bar that participates in the "minimal shell" hide-on-scroll:
 * it slides down and fades out as the shared shell collapses (driven by the
 * feed's scroll via `useMinimalShell`), and reveals on upward scroll.
 *
 * Wraps the default `BottomTabBar` in an `Animated.View` so we keep all the
 * stock tab behavior (icons, labels, accessibility, soft-reset listeners)
 * while animating the container. The bar stays in normal layout flow so other
 * tab screens keep their existing bottom spacing — it slides off-screen on
 * collapse rather than being absolutely positioned, avoiding any cross-tab
 * content-overlap regression.
 */
export default function MinimalShellTabBar(props: BottomTabBarProps) {
  const footerStyle = useMinimalFooterStyle(TAB_BAR_HEIGHT);

  return (
    <Animated.View style={footerStyle}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}
