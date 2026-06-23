import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import Header from '../../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

export default function HelpCenterScreen() {
  const router = useRouter();

  const helpCategories = [
    {
      title: 'Getting Started',
      items: [
        { label: 'How to create an account', route: '/help/account' },
        { label: 'How to post content', route: '/help/posting' },
        { label: 'How to follow users', route: '/help/following' },
      ],
    },
    {
      title: 'Features',
      items: [
        { label: 'Posts and Reels', route: '/help/posts-reels' },
        { label: 'Stories', route: '/help/stories' },
        { label: 'Messages', route: '/help/messages' },
        { label: 'GitHub Projects', route: '/help/projects' },
      ],
    },
    {
      title: 'Account & Privacy',
      items: [
        { label: 'Privacy settings', route: '/help/privacy' },
        { label: 'Account security', route: '/help/security' },
        { label: 'Report a problem', route: '/profile/settings/report' },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Contact Support', action: 'contact' },
        { label: 'FAQ', route: '/help/faq' },
        { label: 'Community Guidelines', route: '/help/guidelines' },
      ],
    },
  ];

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@gitgram.app?subject=Support Request');
  };

  const renderCategory = (category: any) => (
    <View key={category.title} style={styles.category}>
      <Text style={styles.categoryTitle}>{category.title}</Text>
      {category.items.map((item: any) => (
        <TouchableOpacity
          key={item.label}
          style={styles.helpItem}
          onPress={() => {
            if (item.action === 'contact') {
              handleContactSupport();
            } else if (item.route) {
              router.push(item.route as any);
            }
          }}
        >
          <Text style={styles.helpItemLabel}>{item.label}</Text>
          <Icon name="chevron-right" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title="Help Center" />
      <ScrollView style={styles.content}>
        {helpCategories.map(renderCategory)}
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
  category: {
    marginBottom: 32,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  helpItemLabel: {
    fontSize: 16,
    color: Colors.text,
  },
});

