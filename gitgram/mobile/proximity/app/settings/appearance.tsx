import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const Colors = {
  background: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2D2D50',
  sectionHeader: '#94A3B8',
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  textSubtle: '#64748B',
  danger: '#EF4444',
  accent: '#7C3AED',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.75)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = 'Dark' | 'Light' | 'System';
type CodeTheme = 'Dracula' | 'One Dark' | 'GitHub Dark' | 'Solarized Dark';
type FontSize = 'Small' | 'Medium' | 'Large' | 'Extra Large';
type Animation = 'Full' | 'Reduced' | 'None';
type CodeFont = 'Fira Code' | 'JetBrains Mono' | 'Courier';

interface AppearanceState {
  theme: Theme;
  codeTheme: CodeTheme;
  fontSize: FontSize;
  animation: Animation;
  codeFont: CodeFont;
}

interface PickerOption<T extends string> {
  label: string;
  value: T;
  description?: string;
}

// ---------------------------------------------------------------------------
// Picker modal
// ---------------------------------------------------------------------------

interface PickerModalProps<T extends string> {
  visible: boolean;
  title: string;
  options: ReadonlyArray<PickerOption<T>>;
  selected: T;
  onSelect: (value: T) => void;
  onDismiss: () => void;
}

function PickerModal<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onDismiss,
}: PickerModalProps<T>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={pickerStyles.backdrop} onPress={onDismiss}>
        <Pressable style={pickerStyles.sheet} onPress={() => undefined}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>{title}</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={pickerStyles.option}
              onPress={() => {
                onSelect(opt.value);
                onDismiss();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: opt.value === selected }}
            >
              <View style={pickerStyles.optionContent}>
                <Text
                  style={[
                    pickerStyles.optionLabel,
                    opt.value === selected && pickerStyles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                {opt.description !== undefined && (
                  <Text style={pickerStyles.optionDescription}>{opt.description}</Text>
                )}
              </View>
              {opt.value === selected && (
                <Text style={pickerStyles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onDismiss}>
            <Text style={pickerStyles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  optionContent: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: Colors.text,
    fontSize: 16,
  },
  optionLabelSelected: {
    color: Colors.accent,
    fontWeight: '600',
  },
  optionDescription: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
  checkmark: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelLabel: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sectionHeaderStyles.wrapper}>
      <Text style={sectionHeaderStyles.text}>{title}</Text>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 6,
  },
  text: {
    color: Colors.sectionHeader,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
});

// ---------------------------------------------------------------------------
// Row primitives
// ---------------------------------------------------------------------------

interface ValueRowProps {
  label: string;
  sublabel?: string;
  value: string;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}

function ValueRow({ label, sublabel, value, onPress, first = false, last = false }: ValueRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
        pressed && rowStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={rowStyles.labelColumn}>
        <Text style={rowStyles.label}>{label}</Text>
        {sublabel !== undefined && (
          <Text style={rowStyles.sublabel}>{sublabel}</Text>
        )}
      </View>
      <View style={rowStyles.trailingGroup}>
        <Text style={rowStyles.valueText}>{value}</Text>
        <Text style={rowStyles.chevron}>{'›'}</Text>
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  rowFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  rowLast: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pressed: {
    opacity: 0.55,
  },
  labelColumn: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '400',
  },
  sublabel: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 22,
    lineHeight: 22,
    marginLeft: 8,
  },
  valueText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  trailingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={sectionCardStyles.card}>{children}</View>;
}

const sectionCardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

// ---------------------------------------------------------------------------
// Picker option lists
// ---------------------------------------------------------------------------

const THEME_OPTIONS: ReadonlyArray<PickerOption<Theme>> = [
  { label: 'Dark', value: 'Dark', description: 'Always use dark mode' },
  { label: 'Light', value: 'Light', description: 'Always use light mode' },
  { label: 'System default', value: 'System', description: 'Follow system appearance setting' },
];

const CODE_THEME_OPTIONS: ReadonlyArray<PickerOption<CodeTheme>> = [
  { label: 'Dracula', value: 'Dracula', description: 'Purple-tinted dark theme' },
  { label: 'One Dark', value: 'One Dark', description: 'Atom-inspired dark theme' },
  { label: 'GitHub Dark', value: 'GitHub Dark', description: "GitHub's official dark theme" },
  { label: 'Solarized Dark', value: 'Solarized Dark', description: 'Low-contrast dark palette' },
];

const FONT_SIZE_OPTIONS: ReadonlyArray<PickerOption<FontSize>> = [
  { label: 'Small', value: 'Small' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Large', value: 'Large' },
  { label: 'Extra Large', value: 'Extra Large' },
];

const ANIMATION_OPTIONS: ReadonlyArray<PickerOption<Animation>> = [
  { label: 'Full', value: 'Full', description: 'All motion and transitions enabled' },
  { label: 'Reduced', value: 'Reduced', description: 'Minimal motion for accessibility' },
  { label: 'None', value: 'None', description: 'No animations' },
];

const CODE_FONT_OPTIONS: ReadonlyArray<PickerOption<CodeFont>> = [
  { label: 'Fira Code', value: 'Fira Code', description: 'Ligatures, open-source' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono', description: 'Optimized for code readability' },
  { label: 'Courier', value: 'Courier', description: 'Classic monospace' },
];

type ActivePicker = 'theme' | 'codeTheme' | 'fontSize' | 'animation' | 'codeFont' | null;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AppearanceSettingsScreen() {
  const [state, setState] = useState<AppearanceState>({
    theme: 'System',
    codeTheme: 'Dracula',
    fontSize: 'Medium',
    animation: 'Full',
    codeFont: 'Fira Code',
  });

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  function update<K extends keyof AppearanceState>(key: K, value: AppearanceState[K]): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const themeLabel = THEME_OPTIONS.find((o) => o.value === state.theme)?.label ?? state.theme;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Display */}
        <SectionHeader title="Display" />
        <SectionCard>
          <ValueRow
            label="Theme"
            value={themeLabel}
            onPress={() => setActivePicker('theme')}
            first
            last
          />
        </SectionCard>

        {/* Code */}
        <SectionHeader title="Code" />
        <SectionCard>
          <ValueRow
            label="Code theme"
            sublabel="Syntax highlighting in code blocks"
            value={state.codeTheme}
            onPress={() => setActivePicker('codeTheme')}
            first
          />
          <ValueRow
            label="Font size"
            sublabel="Affects code and snippet display"
            value={state.fontSize}
            onPress={() => setActivePicker('fontSize')}
          />
          <ValueRow
            label="Code font"
            sublabel="Monospace font for code blocks"
            value={state.codeFont}
            onPress={() => setActivePicker('codeFont')}
            last
          />
        </SectionCard>

        {/* Motion */}
        <SectionHeader title="Motion" />
        <SectionCard>
          <ValueRow
            label="Animations"
            sublabel="Control motion throughout the app"
            value={state.animation}
            onPress={() => setActivePicker('animation')}
            first
            last
          />
        </SectionCard>

        <View style={styles.footer} />
      </ScrollView>

      <PickerModal
        visible={activePicker === 'theme'}
        title="Theme"
        options={THEME_OPTIONS}
        selected={state.theme}
        onSelect={(v) => update('theme', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'codeTheme'}
        title="Code Theme"
        options={CODE_THEME_OPTIONS}
        selected={state.codeTheme}
        onSelect={(v) => update('codeTheme', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'fontSize'}
        title="Font Size"
        options={FONT_SIZE_OPTIONS}
        selected={state.fontSize}
        onSelect={(v) => update('fontSize', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'animation'}
        title="Animations"
        options={ANIMATION_OPTIONS}
        selected={state.animation}
        onSelect={(v) => update('animation', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'codeFont'}
        title="Code Font"
        options={CODE_FONT_OPTIONS}
        selected={state.codeFont}
        onSelect={(v) => update('codeFont', v)}
        onDismiss={() => setActivePicker(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  footer: {
    height: 40,
  },
});
