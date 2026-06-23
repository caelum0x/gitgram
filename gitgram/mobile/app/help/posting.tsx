import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import Header from '../../components/navigation/Header';

export default function PostingHelpScreen() {
  return (
    <View style={styles.container}>
      <Header title="How to Post" />
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.heading}>Creating Content on Gitgram</Text>
          <Text style={styles.paragraph}>
            Share your code, projects, and development journey with the community.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Creating a Post</Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Tap the + button at the bottom of the screen</Text>
            <Text style={styles.step}>2. Choose your content type (Post, Reel, or Story)</Text>
            <Text style={styles.step}>3. Add images, videos, or code snippets</Text>
            <Text style={styles.step}>4. Write a caption with hashtags</Text>
            <Text style={styles.step}>5. Tag repositories if relevant</Text>
            <Text style={styles.step}>6. Tap "Share" to publish</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Sharing Code Snippets</Text>
          <Text style={styles.paragraph}>
            Gitgram supports syntax-highlighted code snippets:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Use the code snippet button in the composer</Text>
            <Text style={styles.step}>- Select your programming language</Text>
            <Text style={styles.step}>- Paste or type your code</Text>
            <Text style={styles.step}>- The code will be formatted automatically</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Repository Posts</Text>
          <Text style={styles.paragraph}>
            Share your GitHub repositories as posts:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Tap "Add Repository" when creating a post</Text>
            <Text style={styles.step}>2. Search or select from your repositories</Text>
            <Text style={styles.step}>3. Add context about the project</Text>
            <Text style={styles.step}>4. Share to showcase your work</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Best Practices</Text>
          <View style={styles.steps}>
            <Text style={styles.step}>- Use relevant hashtags (#javascript, #react, etc.)</Text>
            <Text style={styles.step}>- Include a description of what the code does</Text>
            <Text style={styles.step}>- Share interesting bugs and solutions</Text>
            <Text style={styles.step}>- Engage with comments on your posts</Text>
            <Text style={styles.step}>- Credit others when sharing their code</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.subheading}>Scheduling Posts</Text>
          <Text style={styles.paragraph}>
            Plan your content ahead of time:
          </Text>
          <View style={styles.steps}>
            <Text style={styles.step}>1. Create your post as usual</Text>
            <Text style={styles.step}>2. Tap the calendar icon</Text>
            <Text style={styles.step}>3. Select date and time</Text>
            <Text style={styles.step}>4. Tap "Schedule" instead of "Share"</Text>
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
