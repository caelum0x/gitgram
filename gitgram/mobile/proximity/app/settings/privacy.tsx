import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';

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
  switchTrackFalse: '#2D2D50',
  switchTrackTrue: '#7C3AED',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.75)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileVisibility = 'Public' | 'Followers Only' | 'Private';
type AllowDmsFrom = 'Everyone' | 'Following' | 'No one';

interface PrivacyState {
  profileVisibility: ProfileVisibility;
  showOnlineStatus: boolean;
  showActivityStatus: boolean;
  allowDmsFrom: AllowDmsFrom;
  showReadReceipts: boolean;
}

interface PickerOption<T extends string> {
  label: string;
  value: T;
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
              <Text
                style={[
                  pickerStyles.optionLabel,
                  opt.value === selected && pickerStyles.optionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
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
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  optionLabel: {
    color: Colors.text,
    fontSize: 16,
  },
  optionLabelSelected: {
    color: Colors.accent,
    fontWeight: '600',
  },
  checkmark: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: '700',
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

interface SwitchRowProps {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  first?: boolean;
  last?: boolean;
}

function SwitchRow({
  label,
  sublabel,
  value,
  onValueChange,
  first = false,
  last = false,
}: SwitchRowProps) {
  return (
    <View
      style={[
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
      ]}
    >
      <View style={rowStyles.labelColumn}>
        <Text style={rowStyles.label}>{label}</Text>
        {sublabel !== undefined && (
          <Text style={rowStyles.sublabel}>{sublabel}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.switchTrackFalse, true: Colors.switchTrackTrue }}
        thumbColor={Colors.white}
        ios_backgroundColor={Colors.switchTrackFalse}
      />
    </View>
  );
}

interface ValueRowProps {
  label: string;
  value: string;
  onPress?: () => void;
  first?: boolean;
  last?: boolean;
}

function ValueRow({ label, value, onPress, first = false, last = false }: ValueRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
        pressed && onPress && rowStyles.pressed,
      ]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
    >
      <Text style={rowStyles.label}>{label}</Text>
      <View style={rowStyles.trailingGroup}>
        <Text style={rowStyles.valueText}>{value}</Text>
        {onPress !== undefined && (
          <Text style={rowStyles.chevron}>{'›'}</Text>
        )}
      </View>
    </Pressable>
  );
}

interface ChevronRowProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}

function ChevronRow({ label, sublabel, onPress, first = false, last = false }: ChevronRowProps) {
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
      <Text style={rowStyles.chevron}>{'›'}</Text>
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
    flex: 1,
  },
  sublabel: {
    color: Colors.textSubtle,
    fontSize: 12,
    flex: 1,
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
    marginLeft: 8,
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

const PROFILE_VISIBILITY_OPTIONS: ReadonlyArray<PickerOption<ProfileVisibility>> = [
  { label: 'Public', value: 'Public' },
  { label: 'Followers Only', value: 'Followers Only' },
  { label: 'Private', value: 'Private' },
];

const ALLOW_DMS_OPTIONS: ReadonlyArray<PickerOption<AllowDmsFrom>> = [
  { label: 'Everyone', value: 'Everyone' },
  { label: 'People I follow', value: 'Following' },
  { label: 'No one', value: 'No one' },
];

type ActivePicker = 'profileVisibility' | 'allowDmsFrom' | null;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PrivacySettingsScreen() {
  const [state, setState] = useState<PrivacyState>({
    profileVisibility: 'Public',
    showOnlineStatus: true,
    showActivityStatus: true,
    allowDmsFrom: 'Everyone',
    showReadReceipts: true,
  });

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  function update<K extends keyof PrivacyState>(key: K, value: PrivacyState[K]): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account visibility */}
        <SectionHeader title="Account" />
        <SectionCard>
          <ValueRow
            label="Profile visibility"
            value={state.profileVisibility}
            onPress={() => setActivePicker('profileVisibility')}
            first
            last
          />
        </SectionCard>

        {/* Activity */}
        <SectionHeader title="Activity" />
        <SectionCard>
          <SwitchRow
            label="Show online status"
            sublabel="Let others see when you're active"
            value={state.showOnlineStatus}
            onValueChange={(v) => update('showOnlineStatus', v)}
            first
          />
          <SwitchRow
            label="Show activity status"
            sublabel="Show recent posts and interactions"
            value={state.showActivityStatus}
            onValueChange={(v) => update('showActivityStatus', v)}
            last
          />
        </SectionCard>

        {/* Messaging */}
        <SectionHeader title="Messaging" />
        <SectionCard>
          <ValueRow
            label="Allow DMs from"
            value={state.allowDmsFrom}
            onPress={() => setActivePicker('allowDmsFrom')}
            first
          />
          <SwitchRow
            label="Show read receipts"
            sublabel="Let others know when you've read their messages"
            value={state.showReadReceipts}
            onValueChange={(v) => update('showReadReceipts', v)}
            last
          />
        </SectionCard>

        {/* Connections */}
        <SectionHeader title="Connections" />
        <SectionCard>
          <ChevronRow
            label="Blocked accounts"
            sublabel="Manage users you've blocked"
            onPress={() => router.push('/blocked-users' as never)}
            first
          />
          <ChevronRow
            label="Muted accounts"
            sublabel="Manage users you've muted"
            onPress={() => router.push('/muted-accounts' as never)}
            last
          />
        </SectionCard>

        <View style={styles.footer} />
      </ScrollView>

      <PickerModal
        visible={activePicker === 'profileVisibility'}
        title="Profile Visibility"
        options={PROFILE_VISIBILITY_OPTIONS}
        selected={state.profileVisibility}
        onSelect={(v) => update('profileVisibility', v)}
        onDismiss={() => setActivePicker(null)}
      />

      <PickerModal
        visible={activePicker === 'allowDmsFrom'}
        title="Allow DMs From"
        options={ALLOW_DMS_OPTIONS}
        selected={state.allowDmsFrom}
        onSelect={(v) => update('allowDmsFrom', v)}
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
