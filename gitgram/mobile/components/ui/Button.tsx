import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, TouchableOpacityProps } from 'react-native';
import { ThemedText } from './ThemedText';
import { Colors } from '../../constants/Colors';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ 
  title, 
  variant = 'primary', 
  size = 'default', 
  loading = false,
  disabled,
  style,
  ...props 
}: ButtonProps) {
  const getBackgroundColor = () => {
    if (disabled) return Colors.disabled;
    switch (variant) {
      case 'primary': return Colors.buttonPrimary;
      case 'secondary': return Colors.buttonSecondary;
      case 'outline': return 'transparent';
      case 'ghost': return 'transparent';
      default: return Colors.buttonPrimary;
    }
  };

  const getTextColor = () => {
    if (disabled) return Colors.textSecondary;
    switch (variant) {
      case 'primary': return '#FFFFFF';
      case 'secondary': return Colors.text;
      case 'outline': return Colors.text;
      case 'ghost': return Colors.text;
      default: return '#FFFFFF';
    }
  };

  const getBorderColor = () => {
    if (disabled) return 'transparent';
    if (variant === 'outline') return Colors.border;
    return 'transparent';
  };

  const paddingVertical = size === 'sm' ? 8 : size === 'lg' ? 16 : 12;
  const paddingHorizontal = size === 'sm' ? 16 : size === 'lg' ? 32 : 24;
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 1 : 0,
          paddingVertical,
          paddingHorizontal,
        },
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <ThemedText style={{ color: getTextColor(), fontSize, fontWeight: '600', textAlign: 'center' }}>
          {title}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

