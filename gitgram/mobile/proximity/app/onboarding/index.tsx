import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Rect, LinearGradient } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDIGO = '#4F46E5';
const PURPLE = '#9333EA';
const PINK = '#EC4899';
const BG = '#0F0F1A';
const SURFACE = '#1A1A2E';
const BORDER = '#2D2D50';
const TEXT = '#E2E8F0';
const TEXT_SEC = '#94A3B8';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 48;

// ---------------------------------------------------------------------------
// Feature highlight data
// ---------------------------------------------------------------------------

interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
  accentColor: string;
}

const FEATURES: Feature[] = [
  {
    id: 'social',
    icon: '🌐',
    title: 'Social',
    description: 'Share code, stories, and projects with developers worldwide',
    accentColor: INDIGO,
  },
  {
    id: 'discover',
    icon: '🔭',
    title: 'Discover',
    description: 'Find trending repos, developers, and snippets',
    accentColor: PURPLE,
  },
  {
    id: 'build',
    icon: '🤝',
    title: 'Build Together',
    description: 'Collaborate with developers through PRs and discussions',
    accentColor: PINK,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GradientBackground() {
  return (
    <Svg
      style={StyleSheet.absoluteFillObject}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0F0F1A" stopOpacity="1" />
          <Stop offset="0.6" stopColor="#120A24" stopOpacity="1" />
          <Stop offset="1" stopColor="#1A0A2E" stopOpacity="1" />
        </LinearGradient>
        <RadialGradient
          id="glow1"
          cx="0.5"
          cy="0.35"
          r="0.5"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0" stopColor={PURPLE} stopOpacity="0.18" />
          <Stop offset="1" stopColor={PURPLE} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient
          id="glow2"
          cx="0.5"
          cy="0.7"
          r="0.4"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0" stopColor={INDIGO} stopOpacity="0.12" />
          <Stop offset="1" stopColor={INDIGO} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#bg)" />
      <Rect width="100%" height="100%" fill="url(#glow1)" />
      <Rect width="100%" height="100%" fill="url(#glow2)" />
    </Svg>
  );
}

interface FeatureCardProps {
  item: Feature;
}

function FeatureCard({ item }: FeatureCardProps) {
  return (
    <View style={[styles.card, { width: CARD_W }]}>
      <View style={[styles.cardIconWrap, { backgroundColor: item.accentColor + '22' }]}>
        <Text style={styles.cardIcon}>{item.icon}</Text>
      </View>
      <Text style={[styles.cardTitle, { color: item.accentColor }]}>{item.title}</Text>
      <Text style={styles.cardDesc}>{item.description}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OnboardingWelcomeScreen() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    // Fade + slide in with spring-like easing
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim as unknown as Animated.Value, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 9,
      }),
    ]).start();

    // Gentle pulse on the logo mark
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.07,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [fadeAnim, pulseAnim, slideAnim]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  return (
    <SafeAreaView style={styles.safe}>
      <GradientBackground />

      <View style={styles.container}>
        {/* ------------------------------------------------------------------ */}
        {/* Animated logo                                                        */}
        {/* ------------------------------------------------------------------ */}
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.logoGlow} />
          <View style={styles.logoRow}>
            <Text style={[styles.logoPart, { color: INDIGO }]}>Git</Text>
            <Text style={[styles.logoPart, { color: PURPLE }]}>gram</Text>
          </View>
          <Text style={styles.wordmark}>Where developers show their work</Text>
        </Animated.View>

        {/* ------------------------------------------------------------------ */}
        {/* Feature highlights — horizontal scroll                              */}
        {/* ------------------------------------------------------------------ */}
        <Animated.View
          style={[styles.carouselWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <FlatList
            data={FEATURES}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <FeatureCard item={item} />}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + 16}
            decelerationRate="fast"
            contentContainerStyle={styles.carouselContent}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          />

          {/* Dot indicators */}
          <View style={styles.dots}>
            {FEATURES.map((f, i) => (
              <View
                key={f.id}
                style={[
                  styles.dot,
                  i === activeIndex && styles.dotActive,
                  i === activeIndex && { backgroundColor: FEATURES[i].accentColor },
                ]}
              />
            ))}
          </View>
        </Animated.View>

        {/* ------------------------------------------------------------------ */}
        {/* CTA buttons                                                          */}
        {/* ------------------------------------------------------------------ */}
        <Animated.View
          style={[
            styles.actions,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => router.push('/onboarding/interests')}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={styles.primaryBtnTxt}>Get Started</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in to existing account"
          >
            <Text style={styles.secondaryBtnTxt}>
              Already have an account?{' '}
              <Text style={styles.signInLink}>Sign In</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    gap: 8,
  },
  logoGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: PURPLE,
    opacity: 0.1,
    top: -30,
  },
  logoRow: {
    flexDirection: 'row',
  },
  logoPart: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  wordmark: {
    fontSize: 15,
    color: TEXT_SEC,
    letterSpacing: 0.1,
    textAlign: 'center',
  },

  // Carousel
  carouselWrap: {
    width: '100%',
    gap: 14,
  },
  carouselContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  card: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 12,
    // subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 26,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardDesc: {
    fontSize: 15,
    color: TEXT_SEC,
    lineHeight: 22,
  },

  // Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BORDER,
  },
  dotActive: {
    width: 20,
    borderRadius: 3,
  },

  // Action buttons
  actions: {
    width: '100%',
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnTxt: {
    color: TEXT_SEC,
    fontSize: 14,
  },
  signInLink: {
    color: PURPLE,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
