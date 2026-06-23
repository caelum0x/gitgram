import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export interface ThemedViewProps extends ViewProps {
  lightColor?: string;
  darkColor?: string;
  variant?: 'default' | 'surface' | 'secondary';
}

export function ThemedView({ style, lightColor, darkColor, variant = 'default', ...otherProps }: ThemedViewProps) {
  const backgroundColor = variant === 'surface' 
    ? Colors.surface 
    : variant === 'secondary' 
      ? Colors.secondary 
      : Colors.background;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}

