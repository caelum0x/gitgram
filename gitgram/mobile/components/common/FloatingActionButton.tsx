import React from 'react';
import { TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';

interface FloatingActionButtonProps {
  icon?: string;
  onPress?: () => void;
  route?: string;
}

export default function FloatingActionButton({
  icon = '+',
  onPress,
  route,
}: FloatingActionButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    if (route) {
      router.push(route as any);
    } else if (onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity style={styles.fab} onPress={handlePress}>
      <Text style={styles.fabIcon}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.buttonPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabIcon: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
});

