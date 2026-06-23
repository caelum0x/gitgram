import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PURPLE = '#9333EA';
const PURPLE_DIM = 'rgba(147, 51, 234, 0.15)';
const BG = '#0F0F1A';
const SURFACE = '#1A1A2E';
const BORDER = '#2D2D50';
const TEXT = '#E2E8F0';
const TEXT_SEC = '#94A3B8';
const TEXT_HINT = '#64748B';
const MIN_SELECTION = 3;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const INTERESTS: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'frontend',     label: 'Frontend',     emoji: '🖥' },
  { id: 'backend',      label: 'Backend',      emoji: '⚙' },
  { id: 'mobile',       label: 'Mobile',       emoji: '📱' },
  { id: 'aiml',         label: 'AI/ML',        emoji: '🤖' },
  { id: 'devops',       label: 'DevOps',       emoji: '🚀' },
  { id: 'web3',         label: 'Web3',         emoji: '⛓' },
  { id: 'gamedev',      label: 'Game Dev',     emoji: '🎮' },
  { id: 'datascience',  label: 'Data Science', emoji: '📊' },
  { id: 'security',     label: 'Security',     emoji: '🔒' },
  { id: 'opensource',   label: 'Open Source',  emoji: '🌍' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  emoji: string;
  selected: boolean;
  onPress: () => void;
}

function InterestChip({ label, emoji, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingInterestsScreen() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const remaining = Math.max(0, MIN_SELECTION - selected.size);
  const canContinue = selected.size >= MIN_SELECTION;

  function toggleInterest(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleContinue() {
    if (!canContinue) {
      Alert.alert(
        'Select more interests',
        `Please select at least ${MIN_SELECTION} interests to continue.`,
      );
      return;
    }
    router.push({
      pathname: '/onboarding/follow',
      params: { interests: JSON.stringify([...selected]) },
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          {/* Step indicator */}
          <View style={styles.stepRow}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepDot} />
            <View style={styles.stepDot} />
          </View>

          <Text style={styles.heading}>What do you build?</Text>
          <Text style={styles.subheading}>
            Select your areas of interest — we'll personalise your feed.
          </Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Chips grid                                                        */}
        {/* ---------------------------------------------------------------- */}
        <FlatList
          data={INTERESTS}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <InterestChip
              label={item.label}
              emoji={item.emoji}
              selected={selected.has(item.id)}
              onPress={() => toggleInterest(item.id)}
            />
          )}
        />

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.footer}>
          {remaining > 0 ? (
            <Text style={styles.hint}>
              Select {remaining} more to continue
            </Text>
          ) : (
            <Text style={[styles.hint, { color: PURPLE }]}>
              {selected.size} interests selected
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.continueBtn,
              !canContinue && styles.continueBtnDisabled,
              pressed && canContinue && styles.pressed,
            ]}
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue to follow developers"
            accessibilityState={{ disabled: !canContinue }}
          >
            <Text
              style={[
                styles.continueBtnText,
                !canContinue && styles.continueBtnTextDisabled,
              ]}
            >
              Continue
            </Text>
          </Pressable>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    marginBottom: 28,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BORDER,
  },
  stepDotActive: {
    backgroundColor: PURPLE,
    width: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    color: TEXT_SEC,
    lineHeight: 21,
  },
  grid: {
    gap: 12,
  },
  row: {
    gap: 12,
    justifyContent: 'space-between',
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  chipSelected: {
    backgroundColor: PURPLE_DIM,
    borderColor: PURPLE,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipEmoji: {
    fontSize: 18,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_SEC,
  },
  chipLabelSelected: {
    color: TEXT,
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: TEXT_HINT,
  },
  continueBtn: {
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
  continueBtnDisabled: {
    backgroundColor: SURFACE,
    borderColor: BORDER,
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  continueBtnTextDisabled: {
    color: TEXT_HINT,
  },
  pressed: {
    opacity: 0.8,
  },
});
