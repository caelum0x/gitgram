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

type AppLanguage = 'English' | 'Spanish' | 'French' | 'German' | 'Japanese' | 'Chinese';
type DateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
type TimeFormat = '12h' | '24h';
type FirstDayOfWeek = 'Sunday' | 'Monday';

interface LanguageState {
  appLanguage: AppLanguage;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  firstDayOfWeek: FirstDayOfWeek;
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

const LANGUAGE_OPTIONS: ReadonlyArray<PickerOption<AppLanguage>> = [
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish', description: 'Español' },
  { label: 'French', value: 'French', description: 'Français' },
  { label: 'German', value: 'German', description: 'Deutsch' },
  { label: 'Japanese', value: 'Japanese', description: '日本語' },
  { label: 'Chinese', value: 'Chinese', description: '中文' },
];

const DATE_FORMAT_OPTIONS: ReadonlyArray<PickerOption<DateFormat>> = [
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY', description: 'United States format' },
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY', description: 'European format' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD', description: 'ISO 8601 standard' },
];

const TIME_FORMAT_OPTIONS: ReadonlyArray<PickerOption<TimeFormat>> = [
  { label: '12-hour (1:30 PM)', value: '12h' },
  { label: '24-hour (13:30)', value: '24h' },
];

const FIRST_DAY_OPTIONS: ReadonlyArray<PickerOption<FirstDayOfWeek>> = [
  { label: 'Sunday', value: 'Sunday' },
  { label: 'Monday', value: 'Monday' },
];

type ActivePicker = 'appLanguage' | 'dateFormat' | 'timeFormat' | 'firstDayOfWeek' | null;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LanguageSettingsScreen() {
  const [state, setState] = useState<LanguageState>({
    appLanguage: 'English',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    firstDayOfWeek: 'Sunday',
  });

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  function update<K extends keyof LanguageState>(key: K, value: LanguageState[K]): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  const timeFormatLabel =
    TIME_FORMAT_OPTIONS.find((o) => o.value === state.timeFormat)?.label ?? state.timeFormat;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Language */}
        <SectionHeader title="Language" />
        <SectionCard>
          <ValueRow
            label="App language"
            sublabel="Restart required to apply"
            value={state.appLanguage}
            onPress={() => setActivePicker('appLanguage')}
            first
            last
          />
        </SectionCard>

        {/* Region */}
        <SectionHeader title="Region" />
        <SectionCard>
          <ValueRow
            label="Date format"
            value={state.dateFormat}
            onPress={() => setActivePicker('dateFormat')}
            first
          />
          <ValueRow
            label="Time format"
            value={timeFormatLabel}
            onPress={() => setActivePicker('timeFormat')}
          />
          <ValueRow
            label="First day of week"
            value={state.firstDayOfWeek}
            onPress={() => setActivePicker('firstDayOfWeek')}
            last
          />
        </SectionCard>

        <View style={styles.footer} />
      </ScrollView>

      <PickerModal
        visible={activePicker === 'appLanguage'}
        title="App Language"
        options={LANGUAGE_OPTIONS}
        selected={state.appLanguage}
        onSelect={(v) => update('appLanguage', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'dateFormat'}
        title="Date Format"
        options={DATE_FORMAT_OPTIONS}
        selected={state.dateFormat}
        onSelect={(v) => update('dateFormat', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'timeFormat'}
        title="Time Format"
        options={TIME_FORMAT_OPTIONS}
        selected={state.timeFormat}
        onSelect={(v) => update('timeFormat', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'firstDayOfWeek'}
        title="First Day of Week"
        options={FIRST_DAY_OPTIONS}
        selected={state.firstDayOfWeek}
        onSelect={(v) => update('firstDayOfWeek', v)}
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
