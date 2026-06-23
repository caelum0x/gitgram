import React, { ReactNode } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface AnimatedViewProps {
  children: ReactNode;
  style?: ViewStyle;
  fadeIn?: boolean;
  slideIn?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
}

export default function AnimatedView({
  children,
  style,
  fadeIn = false,
  slideIn,
  duration = 300,
}: AnimatedViewProps) {
  const fadeAnim = React.useRef(new Animated.Value(fadeIn ? 0 : 1)).current;
  const slideAnim = React.useRef(
    new Animated.Value(
      slideIn === 'up' ? 50 : slideIn === 'down' ? -50 : slideIn === 'left' ? 50 : slideIn === 'right' ? -50 : 0
    )
  ).current;

  React.useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];

    if (fadeIn) {
      animations.push(
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (slideIn) {
      animations.push(
        Animated.timing(slideAnim, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (animations.length > 0) {
      Animated.parallel(animations).start();
    }
  }, [fadeIn, slideIn, duration]);

  const animatedStyle: any = {
    opacity: fadeIn ? fadeAnim : 1,
  };

  if (slideIn === 'up') {
    animatedStyle.transform = [{ translateY: slideAnim }];
  } else if (slideIn === 'down') {
    animatedStyle.transform = [{ translateY: slideAnim }];
  } else if (slideIn === 'left') {
    animatedStyle.transform = [{ translateX: slideAnim }];
  } else if (slideIn === 'right') {
    animatedStyle.transform = [{ translateX: slideAnim }];
  }

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

