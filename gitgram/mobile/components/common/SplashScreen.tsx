import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* GitHub Logo SVG as text/emoji for simplicity */}
        <Text style={styles.logo}>🐙</Text>
        <Text style={styles.appName}>Gitgram</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    fontSize: 96,
  },
  appName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.text,
    letterSpacing: -1,
  },
});

