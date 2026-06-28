import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (proximity)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  background: '#0F0F1A',
  surfaceElevated: '#232340',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  white: '#FFFFFF',
} as const;

export interface EmptyStateProps {
  /** Emoji or short glyph displayed in the icon badge. */
  icon: string;
  /** Primary heading. */
  title: string;
  /** Supporting description shown beneath the title. */
  subtitle: string;
  /** Optional CTA button label. The button renders only when both this and
   * {@link EmptyStateProps.onAction} are provided. */
  actionLabel?: string;
  /** Optional CTA handler. */
  onAction?: () => void;
}

/**
 * Centered placeholder for empty lists, missing results, or first-run states.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const showAction = Boolean(actionLabel) && typeof onAction === 'function';

  return (
    <View style={styles.container}>
      <View style={styles.iconBadge}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {showAction && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    backgroundColor: Colors.background,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 34,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 300,
  },
  actionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  actionLabel: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default EmptyState;
