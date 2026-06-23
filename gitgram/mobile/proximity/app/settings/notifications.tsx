import React, { useState, useCallback } from 'react';
import {
  Alert,
  Linking,
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
// Theme (mirrors settings.tsx)
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
  accentGreen: '#10B981',
  switchTrackFalse: '#2D2D50',
  switchTrackTrue: '#7C3AED',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.75)',
  saveBtn: '#7C3AED',
  saveBtnPressed: '#5B21B6',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SoundOption = 'Default' | 'None' | 'Custom';

interface QuietHours {
  enabled: boolean;
  startHour: number;   // 0–23
  startMinute: number; // 0 or 30
  endHour: number;
  endMinute: number;
}

interface NotificationSettings {
  // Master
  masterEnabled: boolean;
  osPermissionGranted: boolean;

  // Categories
  newFollowers: boolean;
  postLikes: boolean;
  comments: boolean;
  mentions: boolean;
  directMessages: boolean;
  prReviews: boolean;
  issueAssignments: boolean;
  newReleases: boolean;
  trendingRepos: boolean;

  // Quiet Hours
  quietHours: QuietHours;

  // Badge
  showBadge: boolean;

  // Sound
  sound: SoundOption;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${padTwo(minute)} ${period}`;
}

type ActivePicker = 'startTime' | 'endTime' | 'sound' | null;

// Time slot options: every 30 minutes across 24 hours
const TIME_SLOTS: ReadonlyArray<{ label: string; hour: number; minute: number }> =
  Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return { label: formatTime(hour, minute), hour, minute };
  });

const SOUND_OPTIONS: ReadonlyArray<{ label: string; value: SoundOption }> = [
  { label: 'Default', value: 'Default' },
  { label: 'None (Silent)', value: 'None' },
  { label: 'Custom', value: 'Custom' },
];

// ---------------------------------------------------------------------------
// Picker modal (bottom sheet)
// ---------------------------------------------------------------------------

interface TimeSlot { label: string; hour: number; minute: number }

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  selectedHour: number;
  selectedMinute: number;
  onSelect: (hour: number, minute: number) => void;
  onDismiss: () => void;
}

function TimePickerModal({
  visible,
  title,
  selectedHour,
  selectedMinute,
  onSelect,
  onDismiss,
}: TimePickerModalProps) {
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
          <ScrollView style={pickerStyles.scrollArea} showsVerticalScrollIndicator={false}>
            {TIME_SLOTS.map((slot: TimeSlot) => {
              const isSelected = slot.hour === selectedHour && slot.minute === selectedMinute;
              return (
                <TouchableOpacity
                  key={slot.label}
                  style={pickerStyles.option}
                  onPress={() => {
                    onSelect(slot.hour, slot.minute);
                    onDismiss();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text
                    style={[
                      pickerStyles.optionLabel,
                      isSelected && pickerStyles.optionLabelSelected,
                    ]}
                  >
                    {slot.label}
                  </Text>
                  {isSelected && <Text style={pickerStyles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={pickerStyles.cancelBtn} onPress={onDismiss}>
            <Text style={pickerStyles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SoundPickerModalProps {
  visible: boolean;
  selected: SoundOption;
  onSelect: (value: SoundOption) => void;
  onDismiss: () => void;
}

function SoundPickerModal({
  visible,
  selected,
  onSelect,
  onDismiss,
}: SoundPickerModalProps) {
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
          <Text style={pickerStyles.title}>Notification Sound</Text>
          {SOUND_OPTIONS.map((opt) => (
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
              {opt.value === selected && <Text style={pickerStyles.checkmark}>✓</Text>}
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
    maxHeight: '70%',
  },
  scrollArea: {
    maxHeight: 300,
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
  disabled?: boolean;
  first?: boolean;
  last?: boolean;
}

function SwitchRow({
  label,
  sublabel,
  value,
  onValueChange,
  disabled = false,
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
        disabled && rowStyles.rowDisabled,
      ]}
    >
      <View style={rowStyles.labelColumn}>
        <Text style={[rowStyles.label, disabled && rowStyles.labelDisabled]}>{label}</Text>
        {sublabel !== undefined && (
          <Text style={rowStyles.sublabel}>{sublabel}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
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
  disabled?: boolean;
  first?: boolean;
  last?: boolean;
}

function ValueRow({
  label,
  value,
  onPress,
  disabled = false,
  first = false,
  last = false,
}: ValueRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
        disabled && rowStyles.rowDisabled,
        pressed && onPress && !disabled && rowStyles.pressed,
      ]}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
    >
      <Text style={[rowStyles.label, disabled && rowStyles.labelDisabled]}>{label}</Text>
      <View style={rowStyles.trailingGroup}>
        <Text style={[rowStyles.valueText, disabled && rowStyles.labelDisabled]}>{value}</Text>
        {onPress !== undefined && !disabled && (
          <Text style={rowStyles.chevron}>{'›'}</Text>
        )}
      </View>
    </Pressable>
  );
}

interface ActionRowProps {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
  first?: boolean;
  last?: boolean;
}

function ActionRow({
  label,
  onPress,
  variant = 'default',
  first = false,
  last = false,
}: ActionRowProps) {
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
      <Text
        style={[
          rowStyles.label,
          variant === 'danger' && rowStyles.labelDanger,
        ]}
      >
        {label}
      </Text>
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
  rowDisabled: {
    opacity: 0.4,
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
  labelDisabled: {
    color: Colors.textSubtle,
  },
  labelDanger: {
    color: Colors.danger,
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
// OS permission banner
// ---------------------------------------------------------------------------

function OsPermissionBanner() {
  function openAppSettings() {
    Linking.openSettings().catch(() => {
      Alert.alert('Cannot Open Settings', 'Please open your device Settings and enable notifications for Gitgram manually.');
    });
  }

  return (
    <Pressable
      onPress={openAppSettings}
      style={({ pressed }) => [
        bannerStyles.banner,
        pressed && bannerStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open device settings to allow notifications"
    >
      <View style={bannerStyles.content}>
        <Text style={bannerStyles.icon}>🔔</Text>
        <View style={bannerStyles.textBlock}>
          <Text style={bannerStyles.heading}>Notifications are blocked</Text>
          <Text style={bannerStyles.body}>
            Gitgram doesn't have permission to send push notifications. Tap to open Settings.
          </Text>
        </View>
      </View>
      <Text style={bannerStyles.action}>Open Settings ›</Text>
    </Pressable>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#1E1035',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.accent,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  heading: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  action: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});

// ---------------------------------------------------------------------------
// Save button
// ---------------------------------------------------------------------------

interface SaveButtonProps {
  onPress: () => void;
}

function SaveButton({ onPress }: SaveButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        saveStyles.btn,
        pressed && saveStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Save notification settings"
    >
      <Text style={saveStyles.label}>Save Settings</Text>
    </Pressable>
  );
}

const saveStyles = StyleSheet.create({
  btn: {
    marginHorizontal: 16,
    marginTop: 32,
    backgroundColor: Colors.saveBtn,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pressed: {
    backgroundColor: Colors.saveBtnPressed,
  },
  label: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NotificationsSettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings>({
    masterEnabled: true,
    osPermissionGranted: true,

    newFollowers: true,
    postLikes: true,
    comments: true,
    mentions: true,
    directMessages: true,
    prReviews: false,
    issueAssignments: false,
    newReleases: true,
    trendingRepos: false,

    quietHours: {
      enabled: false,
      startHour: 22,
      startMinute: 0,
      endHour: 8,
      endMinute: 0,
    },

    showBadge: true,
    sound: 'Default',
  });

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  // Immutable update helper
  const update = useCallback(
    <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // When master toggle turns off, disable all category toggles
  function handleMasterToggle(next: boolean) {
    if (!next) {
      setSettings((prev) => ({
        ...prev,
        masterEnabled: false,
        newFollowers: false,
        postLikes: false,
        comments: false,
        mentions: false,
        directMessages: false,
        prReviews: false,
        issueAssignments: false,
        newReleases: false,
        trendingRepos: false,
      }));
    } else {
      update('masterEnabled', true);
    }
  }

  function updateQuietHours<K extends keyof QuietHours>(key: K, value: QuietHours[K]) {
    setSettings((prev) => ({
      ...prev,
      quietHours: { ...prev.quietHours, [key]: value },
    }));
  }

  function handleSave() {
    // TODO: persist settings via API / AsyncStorage
    Alert.alert('Saved', 'Your notification preferences have been saved.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  const categoriesDisabled = !settings.masterEnabled;
  const quietHoursTimesDisabled = !settings.quietHours.enabled || categoriesDisabled;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* OS permission warning banner */}
        {!settings.osPermissionGranted && <OsPermissionBanner />}

        {/* ---------------------------------------------------------------- */}
        {/* MASTER TOGGLE                                                     */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Push Notifications" />
        <SectionCard>
          <SwitchRow
            label="Push Notifications"
            sublabel={
              !settings.osPermissionGranted
                ? 'OS permission not granted — tap banner above'
                : settings.masterEnabled
                  ? 'You will receive push notifications'
                  : 'All notifications are disabled'
            }
            value={settings.masterEnabled}
            onValueChange={handleMasterToggle}
            first
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* NOTIFICATION CATEGORIES                                           */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Notification Types" />
        <SectionCard>
          <SwitchRow
            label="New Followers"
            value={settings.newFollowers}
            onValueChange={(v) => update('newFollowers', v)}
            disabled={categoriesDisabled}
            first
          />
          <SwitchRow
            label="Likes on Your Posts"
            value={settings.postLikes}
            onValueChange={(v) => update('postLikes', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="Comments on Your Posts"
            value={settings.comments}
            onValueChange={(v) => update('comments', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="Mentions (@username)"
            sublabel="When someone tags you in a post or comment"
            value={settings.mentions}
            onValueChange={(v) => update('mentions', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="New Messages"
            value={settings.directMessages}
            onValueChange={(v) => update('directMessages', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="Pull Request Reviews"
            sublabel="Reviews, approvals and change requests"
            value={settings.prReviews}
            onValueChange={(v) => update('prReviews', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="Issue Assignments"
            sublabel="When an issue is assigned to you"
            value={settings.issueAssignments}
            onValueChange={(v) => update('issueAssignments', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="New Releases from Starred Repos"
            sublabel="Get notified when a starred repo ships a release"
            value={settings.newReleases}
            onValueChange={(v) => update('newReleases', v)}
            disabled={categoriesDisabled}
          />
          <SwitchRow
            label="Trending Repos in Your Languages"
            sublabel="Daily digest of repos trending in your stack"
            value={settings.trendingRepos}
            onValueChange={(v) => update('trendingRepos', v)}
            disabled={categoriesDisabled}
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* QUIET HOURS                                                       */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Quiet Hours" />
        <SectionCard>
          <SwitchRow
            label="Do Not Disturb"
            sublabel="Silence notifications during set hours"
            value={settings.quietHours.enabled}
            onValueChange={(v) => updateQuietHours('enabled', v)}
            disabled={categoriesDisabled}
            first
          />
          <ValueRow
            label="Start Time"
            value={formatTime(settings.quietHours.startHour, settings.quietHours.startMinute)}
            onPress={() => setActivePicker('startTime')}
            disabled={quietHoursTimesDisabled}
          />
          <ValueRow
            label="End Time"
            value={formatTime(settings.quietHours.endHour, settings.quietHours.endMinute)}
            onPress={() => setActivePicker('endTime')}
            disabled={quietHoursTimesDisabled}
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* BADGE ICON                                                        */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Badge Icon" />
        <SectionCard>
          <SwitchRow
            label="Show Unread Count"
            sublabel="Display the number of unread notifications on the app icon"
            value={settings.showBadge}
            onValueChange={(v) => update('showBadge', v)}
            disabled={categoriesDisabled}
            first
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* SOUND                                                             */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Sound" />
        <SectionCard>
          <ValueRow
            label="Notification Sound"
            value={settings.sound}
            onPress={() => setActivePicker('sound')}
            disabled={categoriesDisabled}
            first
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* SAVE                                                              */}
        {/* ---------------------------------------------------------------- */}
        <SaveButton onPress={handleSave} />

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Start time picker */}
      <TimePickerModal
        visible={activePicker === 'startTime'}
        title="Quiet Hours — Start"
        selectedHour={settings.quietHours.startHour}
        selectedMinute={settings.quietHours.startMinute}
        onSelect={(hour, minute) => {
          updateQuietHours('startHour', hour);
          updateQuietHours('startMinute', minute);
        }}
        onDismiss={() => setActivePicker(null)}
      />

      {/* End time picker */}
      <TimePickerModal
        visible={activePicker === 'endTime'}
        title="Quiet Hours — End"
        selectedHour={settings.quietHours.endHour}
        selectedMinute={settings.quietHours.endMinute}
        onSelect={(hour, minute) => {
          updateQuietHours('endHour', hour);
          updateQuietHours('endMinute', minute);
        }}
        onDismiss={() => setActivePicker(null)}
      />

      {/* Sound picker */}
      <SoundPickerModal
        visible={activePicker === 'sound'}
        selected={settings.sound}
        onSelect={(v) => update('sound', v)}
        onDismiss={() => setActivePicker(null)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  bottomPad: {
    height: 40,
  },
});
