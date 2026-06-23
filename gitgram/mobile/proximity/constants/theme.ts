// Gitgram proximity theme — design tokens

export const Colors = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  text: '#E2E8F0',
  muted: '#64748B',
  border: '#2D2D50',
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
} as const;

export const Typography = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  weights: {
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
  } as const,
  families: {
    sans: 'System',
    mono: 'Courier',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const Theme = {
  colors: Colors,
  typography: Typography,
  spacing: Spacing,
  borderRadius: BorderRadius,
} as const;

export type ThemeColors = typeof Colors;
export type ThemeTypography = typeof Typography;
export type ThemeSpacing = typeof Spacing;
export type ThemeBorderRadius = typeof BorderRadius;
export type AppTheme = typeof Theme;
