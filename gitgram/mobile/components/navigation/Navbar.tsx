import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/authStore';

interface NavbarProps {
  showBack?: boolean;
  title?: string;
  rightAction?: React.ReactNode;
}

export default function Navbar({ showBack = false, title, rightAction }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {showBack && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
        
        {title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}

        {rightAction || (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.profileButton}
          >
            {user?.avatar ? (
              <Icon name="account-circle" size={28} color={Colors.accent} />
            ) : (
              <Icon name="account-circle" size={28} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 8,
  },
  profileButton: {
    padding: 4,
  },
});

