import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface SecurityItem {
  icon: string;
  label: string;
  description: string;
  route: string;
}

const SECURITY_ITEMS: SecurityItem[] = [
  {
    icon: 'lock',
    label: 'Change Password',
    description: 'Update the password used to sign in',
    route: '/profile/settings/password',
  },
  {
    icon: 'verified-user',
    label: 'Two-Factor Authentication',
    description: 'Add an extra layer of protection to your account',
    route: '/account/security/2fa-setup',
  },
  {
    icon: 'devices',
    label: 'Active Sessions',
    description: 'Review and revoke devices signed in to your account',
    route: '/account/security/sessions',
  },
];

export default function SecuritySettingsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Header title="Security" />
      <ScrollView style={styles.content}>
        {SECURITY_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.item}
            onPress={() => router.push(item.route as any)}
          >
            <View style={styles.iconContainer}>
              <Icon name={item.icon} size={24} color={Colors.text} />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>
            <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  iconContainer: {
    width: 40,
    alignItems: 'center',
    marginRight: 12,
  },
  itemBody: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  itemDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
