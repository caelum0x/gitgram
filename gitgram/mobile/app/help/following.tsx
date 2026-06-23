import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';

export default function FollowingHelpScreen() {
  return (
    <View style={styles.container}>
      <Header title="Following Users" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Building Your Network</Text>
          <Text style={styles.paragraph}>
            Connect with developers and stay updated on their projects and posts.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>How to Follow Someone</Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Find a user through search or explore</Text>
            <Text style={styles.step}>2. Tap on their profile</Text>
            <Text style={styles.step}>3. Tap the "Follow" button</Text>
            <Text style={styles.step}>4. Their posts will appear in your feed</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Following Repositories</Text>
          <Text style={styles.paragraph}>
            On Gitgram, repositories can also act as accounts:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Search for repositories you're interested in</Text>
            <Text style={styles.step}>- Follow them to see updates and releases</Text>
            <Text style={styles.step}>- Get notified about new commits and issues</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Private Accounts</Text>
          <Text style={styles.paragraph}>
            Some users have private accounts:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Tap "Follow" to send a follow request</Text>
            <Text style={styles.step}>- Wait for the user to accept</Text>
            <Text style={styles.step}>- You'll be notified when they respond</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Managing Follow Requests</Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to your profile</Text>
            <Text style={styles.step}>2. Tap "Follow Requests"</Text>
            <Text style={styles.step}>3. Accept or decline requests</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Discovering Developers</Text>
          <Text style={styles.paragraph}>
            Find new people to follow:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Check the Explore page for trending developers</Text>
            <Text style={styles.step}>- Browse by programming language</Text>
            <Text style={styles.step}>- See who your connections follow</Text>
            <Text style={styles.step}>- Follow contributors to your favorite repos</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Unfollowing</Text>
          <Text style={styles.paragraph}>
            To unfollow someone:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Go to their profile</Text>
            <Text style={styles.step}>2. Tap "Following"</Text>
            <Text style={styles.step}>3. Confirm to unfollow</Text>
          </View>
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
  section: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  steps: {
    paddingLeft: 8,
  },
  step: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 28,
  },
});
