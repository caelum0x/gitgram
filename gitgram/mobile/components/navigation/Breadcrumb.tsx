import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../constants/Colors';

interface BreadcrumbItem {
  label: string;
  route?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <Icon name="chevron-right" size={16} color={Colors.textSecondary} style={styles.separator} />
          )}
          {item.route ? (
            <TouchableOpacity onPress={() => router.push(item.route as any)}>
              <Text style={[styles.item, index === items.length - 1 && styles.activeItem]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.item, styles.activeItem]}>{item.label}</Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  item: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  activeItem: {
    color: Colors.text,
    fontWeight: '600',
  },
  separator: {
    marginHorizontal: 8,
  },
});

