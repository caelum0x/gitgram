import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { subscribeToNetworkChanges } from '../../utils/network';
import { Colors } from '../../constants/Colors';

type ConnectionState = 'connected' | 'disconnected' | 'reconnected';

export default function NetworkStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [fadeAnim] = useState(new Animated.Value(0));
  const wasDisconnected = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkChanges((connected) => {
      if (!connected) {
        wasDisconnected.current = true;
        setConnectionState('disconnected');

        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } else if (wasDisconnected.current) {
        // Show reconnected message
        setConnectionState('reconnected');

        // Hide after 3 seconds
        hideTimeoutRef.current = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setConnectionState('connected');
            wasDisconnected.current = false;
          });
        }, 3000);
      }
    });

    return () => {
      unsubscribe();
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [fadeAnim]);

  if (connectionState === 'connected') {
    return null;
  }

  const isReconnected = connectionState === 'reconnected';

  return (
    <Animated.View
      style={[
        styles.container,
        isReconnected && styles.reconnectedContainer,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.indicator, isReconnected && styles.reconnectedIndicator]} />
        <Text style={styles.text}>
          {isReconnected ? 'Back online' : 'No internet connection'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#dc2626',
    padding: 12,
    alignItems: 'center',
    zIndex: 1000,
  },
  reconnectedContainer: {
    backgroundColor: '#16a34a',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fca5a5',
  },
  reconnectedIndicator: {
    backgroundColor: '#86efac',
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

