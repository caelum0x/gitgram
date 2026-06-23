import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'What is Gitgram?',
    answer: 'Gitgram is a social media platform designed for developers. It combines the familiar social media experience with GitHub integration, allowing you to share code, showcase projects, and connect with other developers.',
  },
  {
    question: 'How is Gitgram different from other social networks?',
    answer: 'Gitgram is built specifically for developers. It features code snippet sharing with syntax highlighting, GitHub repository integration, programming language filters, and a community focused on software development.',
  },
  {
    question: 'Can I use Gitgram without a GitHub account?',
    answer: 'Yes! You can sign up with just an email address. However, linking a GitHub account unlocks additional features like repository sharing and automatic profile enrichment.',
  },
  {
    question: 'What can I post on Gitgram?',
    answer: 'You can post text updates, images, videos, code snippets, and repository showcases. Reels and Stories are also available for short-form content.',
  },
  {
    question: 'How do repository accounts work?',
    answer: 'On Gitgram, repositories can have their own social accounts. If you maintain a repository, you can claim it and post updates, share releases, and engage with users following that project.',
  },
  {
    question: 'Is Gitgram free?',
    answer: 'Yes, Gitgram is free to use. We offer optional premium subscriptions for advanced features like analytics, scheduling, and additional storage.',
  },
  {
    question: 'How do I report inappropriate content?',
    answer: 'Tap the three dots on any post, profile, or message and select "Report". Choose the reason for your report and our moderation team will review it.',
  },
  {
    question: 'Can I make my account private?',
    answer: 'Yes, you can set your account to private in Settings > Privacy. Private accounts require follow requests to be approved before someone can see your posts.',
  },
  {
    question: 'How do I delete a post?',
    answer: 'Go to the post you want to delete, tap the three dots menu, and select "Delete". The post will be permanently removed.',
  },
  {
    question: 'Can I download my data?',
    answer: 'Yes, you can request a download of all your data in Settings > Privacy > Data Export. We\'ll prepare your data and notify you when it\'s ready.',
  },
  {
    question: 'How do I contact support?',
    answer: 'You can contact our support team at support@gitgram.app or use the "Report a Problem" feature in Settings > Help.',
  },
  {
    question: 'What languages does Gitgram support?',
    answer: 'Gitgram currently supports English with more languages coming soon. Code syntax highlighting supports all major programming languages.',
  },
];

export default function FAQHelpScreen() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <View style={styles.container}>
      <Header title="FAQ" />
      <ScrollView style={styles.content}>
        <Text style={styles.heading}>Frequently Asked Questions</Text>

        {faqs.map((faq, index) => (
          <TouchableOpacity
            key={index}
            style={styles.faqItem}
            onPress={() => toggleExpand(index)}
            activeOpacity={0.7}
          >
            <View style={styles.questionRow}>
              <Text style={styles.question}>{faq.question}</Text>
              <Icon
                name={expandedIndex === index ? 'expand-less' : 'expand-more'}
                size={24}
                color={Colors.textSecondary}
              />
            </View>
            {expandedIndex === index && (
              <Text style={styles.answer}>{faq.answer}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Didn't find what you're looking for?
          </Text>
          <Text style={styles.footerLink}>
            Contact support@gitgram.app
          </Text>
        </View>
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
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 20,
  },
  faqItem: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  question: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginRight: 12,
  },
  answer: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footer: {
    marginTop: 24,
    marginBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  footerLink: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
  },
});
