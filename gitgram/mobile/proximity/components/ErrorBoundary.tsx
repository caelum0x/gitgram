import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (proximity)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  background: '#0F0F1A',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  white: '#FFFFFF',
} as const;

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional render-prop fallback. Receives the captured error and a reset
   * callback. When omitted, the default dark fallback UI is shown.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional hook for reporting errors to a logging/telemetry sink. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors in its subtree and shows a recoverable fallback
 * UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset(): void {
    this.setState({ error: null });
  }

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error === null) {
      return children;
    }

    if (fallback) {
      return fallback(error, this.reset);
    }

    return (
      <View style={styles.container}>
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>⚠️</Text>
        </View>

        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          An unexpected error occurred. You can try again — if it keeps
          happening, please restart the app.
        </Text>

        <Text style={styles.detail} numberOfLines={3}>
          {error.message}
        </Text>

        <TouchableOpacity
          style={styles.retryBtn}
          onPress={this.reset}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
    maxWidth: 320,
  },
  detail: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 320,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  retryLabel: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ErrorBoundary;
