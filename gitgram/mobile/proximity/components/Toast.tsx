import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (proximity)
// ---------------------------------------------------------------------------
const Colors = {
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  white: '#FFFFFF',
  success: '#22C55E',
  error: '#EF4444',
  info: '#7C3AED',
} as const;

const AUTO_DISMISS_MS = 3000;
const ANIMATION_DURATION_MS = 240;

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  /** Show a toast notification. Type defaults to 'info'. */
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ACCENT_BY_TYPE: Record<ToastType, string> = {
  success: Colors.success,
  error: Colors.error,
  info: Colors.info,
};

const ICON_BY_TYPE: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Provides toast notifications to descendants. Wrap the app root with this and
 * call {@link useToast} from any component to surface messages.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: ANIMATION_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  }, [clearTimer, opacity, translateY]);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (!message.trim()) {
        return;
      }

      clearTimer();
      nextId.current += 1;
      setToast({ id: nextId.current, message, type });

      translateY.setValue(-120);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      dismissTimer.current = setTimeout(hide, AUTO_DISMISS_MS);
    },
    [clearTimer, hide, opacity, translateY]
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast !== null && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrapper,
            { top: insets.top + 8, opacity, transform: [{ translateY }] },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            style={[
              styles.toast,
              { borderLeftColor: ACCENT_BY_TYPE[toast.type] },
            ]}
          >
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: ACCENT_BY_TYPE[toast.type] },
              ]}
            >
              <Text style={styles.iconText}>{ICON_BY_TYPE[toast.type]}</Text>
            </View>
            <Text style={styles.message} numberOfLines={3}>
              {toast.message}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast controller. Must be called within a {@link ToastProvider}.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  message: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
});

export default ToastProvider;
