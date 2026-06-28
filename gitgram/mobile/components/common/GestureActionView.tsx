import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { Colors } from '../../constants/Colors';
import { useHaptics } from '../../hooks/useHaptics';

/**
 * Reusable swipe-to-action row, ported from Bluesky's GestureActionView.
 *
 * Bluesky's original is built on reanimated worklets. To stay on the product
 * stack (and avoid pulling in reanimated, which the app does not use) this is
 * reimplemented on react-native-gesture-handler's `Swipeable` - the same
 * primitive already used by the reading list - plus the product's `useHaptics`
 * for the confirmation tap. It supports up to two actions per side with
 * per-action color, icon, and label.
 */

export interface GestureAction {
  /** Background color revealed as the row is swiped open. */
  color: string;
  /** MaterialIcons glyph name. */
  icon: string;
  /** Short label shown under the icon. */
  label: string;
  /** Invoked when the row is released past this action's threshold. */
  action: () => void;
}

export interface GestureActions {
  left?: GestureAction;
  leftSecond?: GestureAction;
  right?: GestureAction;
  rightSecond?: GestureAction;
}

interface GestureActionViewProps {
  children: React.ReactNode;
  actions: GestureActions;
}

const ACTION_WIDTH = 80;

function SwipeAction({
  action,
  onActivate,
}: {
  action: GestureAction;
  onActivate: () => void;
}) {
  return (
    <Pressable
      style={[styles.action, { backgroundColor: action.color }]}
      onPress={onActivate}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <Icon name={action.icon} size={20} color={Colors.white} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

export default function GestureActionView({
  children,
  actions,
}: GestureActionViewProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const haptic = useHaptics();

  // A second action without a first is meaningless and almost certainly a bug.
  if (
    (actions.leftSecond && !actions.left) ||
    (actions.rightSecond && !actions.right)
  ) {
    throw new Error(
      'GestureActionView: provide the first action before the second action',
    );
  }

  const close = () => swipeableRef.current?.close();

  const runAction = (action: GestureAction) => {
    haptic('Light');
    close();
    action.action();
  };

  // The revealed action buttons are tapped to confirm, mirroring the reading
  // list pattern. The first action sits closest to the row edge.
  const renderSide = (
    first: GestureAction | undefined,
    second: GestureAction | undefined,
    side: 'left' | 'right',
  ) => {
    if (!first) {
      return undefined;
    }
    return () => (
      <View style={side === 'left' ? styles.leftGroup : styles.rightGroup}>
        {side === 'left' ? (
          <>
            {second && (
              <SwipeAction action={second} onActivate={() => runAction(second)} />
            )}
            <SwipeAction action={first} onActivate={() => runAction(first)} />
          </>
        ) : (
          <>
            <SwipeAction action={first} onActivate={() => runAction(first)} />
            {second && (
              <SwipeAction action={second} onActivate={() => runAction(second)} />
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderSide(actions.left, actions.leftSecond, 'left')}
      renderRightActions={renderSide(actions.right, actions.rightSecond, 'right')}
    >
      {/* Animated wrapper keeps the row composable with other Animated parents. */}
      <Animated.View>{children}</Animated.View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  leftGroup: {
    flexDirection: 'row',
  },
  rightGroup: {
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionLabel: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
