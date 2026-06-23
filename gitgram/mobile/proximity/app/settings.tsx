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
import Constants from 'expo-constants';
import { clearAuthToken } from '../services/gitgramApi';

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
  dangerMuted: '#7F1D1D',
  accent: '#7C3AED',
  accentGreen: '#10B981',
  switchTrackFalse: '#2D2D50',
  switchTrackTrue: '#7C3AED',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.75)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AllowDmsOption = 'Everyone' | 'Followers' | 'Nobody';
type LanguageOption = 'English' | 'Spanish' | 'French' | 'German' | 'Japanese' | 'Korean';
type FeedDensityOption = 'Comfortable' | 'Compact';

interface SettingsState {
  // Privacy
  privateAccount: boolean;
  showActivityStatus: boolean;
  allowDmsFrom: AllowDmsOption;
  // Notifications
  pushNotifications: boolean;
  newFollowers: boolean;
  postLikes: boolean;
  comments: boolean;
  directMessages: boolean;
  // Content
  language: LanguageOption;
  feedDensity: FeedDensityOption;
  // Account
  githubConnected: boolean;
}

// ---------------------------------------------------------------------------
// Picker modal
// ---------------------------------------------------------------------------

interface PickerOption<T extends string> {
  label: string;
  value: T;
}

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

interface ChevronRowProps {
  label: string;
  sublabel?: string;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'muted';
  onPress?: () => void;
  first?: boolean;
  last?: boolean;
}

function ChevronRow({
  label,
  sublabel,
  badge,
  badgeVariant = 'default',
  onPress,
  first = false,
  last = false,
}: ChevronRowProps) {
  const badgeStyle =
    badgeVariant === 'success'
      ? rowStyles.badgeSuccess
      : badgeVariant === 'muted'
        ? rowStyles.badgeMuted
        : rowStyles.badge;

  const badgeTextStyle =
    badgeVariant === 'success'
      ? rowStyles.badgeTextSuccess
      : badgeVariant === 'muted'
        ? rowStyles.badgeTextMuted
        : rowStyles.badgeText;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
        pressed && onPress && rowStyles.pressed,
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
        {badge !== undefined && (
          <View style={badgeStyle}>
            <Text style={badgeTextStyle}>{badge}</Text>
          </View>
        )}
        <Text style={rowStyles.chevron}>{'›'}</Text>
      </View>
    </Pressable>
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

// Segmented control for FeedDensity
interface SegmentedRowProps {
  label: string;
  options: ReadonlyArray<FeedDensityOption>;
  selected: FeedDensityOption;
  onSelect: (value: FeedDensityOption) => void;
  first?: boolean;
  last?: boolean;
}

function SegmentedRow({
  label,
  options,
  selected,
  onSelect,
  first = false,
  last = false,
}: SegmentedRowProps) {
  return (
    <View
      style={[
        rowStyles.row,
        first && rowStyles.rowFirst,
        last && rowStyles.rowLast,
        !last && rowStyles.rowBorder,
        rowStyles.rowWrap,
      ]}
    >
      <Text style={rowStyles.label}>{label}</Text>
      <View style={segmentStyles.track}>
        {options.map((opt, idx) => (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[
              segmentStyles.segment,
              opt === selected && segmentStyles.segmentActive,
              idx === 0 && segmentStyles.segmentFirst,
              idx === options.length - 1 && segmentStyles.segmentLast,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: opt === selected }}
          >
            <Text
              style={[
                segmentStyles.segmentLabel,
                opt === selected && segmentStyles.segmentLabelActive,
              ]}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const segmentStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  segmentActive: {
    backgroundColor: Colors.accent,
  },
  segmentFirst: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  segmentLast: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  segmentLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  segmentLabelActive: {
    color: Colors.white,
    fontWeight: '700',
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  rowWrap: {
    flexWrap: 'wrap',
    gap: 8,
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
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSuccess: {
    backgroundColor: '#065F46',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTextSuccess: {
    color: Colors.accentGreen,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeMuted: {
    backgroundColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTextMuted: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
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
// Danger button
// ---------------------------------------------------------------------------

interface DangerButtonProps {
  label: string;
  onPress: () => void;
  underline?: boolean;
}

function DangerButton({ label, onPress, underline = false }: DangerButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        dangerBtnStyles.btn,
        !underline && dangerBtnStyles.btnBordered,
        pressed && dangerBtnStyles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[dangerBtnStyles.label, underline && dangerBtnStyles.labelUnderline]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const dangerBtnStyles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnBordered: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.danger,
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  labelUnderline: {
    fontWeight: '400',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_VERSION: string =
  (Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0') as string;

const DM_OPTIONS: ReadonlyArray<PickerOption<AllowDmsOption>> = [
  { label: 'Everyone', value: 'Everyone' },
  { label: 'Followers only', value: 'Followers' },
  { label: 'Nobody', value: 'Nobody' },
];

const LANGUAGE_OPTIONS: ReadonlyArray<PickerOption<LanguageOption>> = [
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'French', value: 'French' },
  { label: 'German', value: 'German' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Korean', value: 'Korean' },
];

const FEED_DENSITY_OPTIONS: ReadonlyArray<FeedDensityOption> = ['Comfortable', 'Compact'];

async function openUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    Alert.alert('Cannot open URL', `Unable to open: ${url}`);
  }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type ActivePicker = 'dms' | 'language' | null;

export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsState>({
    privateAccount: false,
    showActivityStatus: true,
    allowDmsFrom: 'Everyone',
    pushNotifications: true,
    newFollowers: true,
    postLikes: true,
    comments: true,
    directMessages: true,
    language: 'English',
    feedDensity: 'Comfortable',
    githubConnected: false,
  });

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  // Immutable update helper
  const update = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // -------------------------------------------------------------------------
  // When push notifications master toggle goes off, disable all sub-toggles
  // -------------------------------------------------------------------------

  function handlePushToggle(next: boolean) {
    if (!next) {
      setSettings((prev) => ({
        ...prev,
        pushNotifications: false,
        newFollowers: false,
        postLikes: false,
        comments: false,
        directMessages: false,
      }));
    } else {
      update('pushNotifications', true);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleLogOut() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await clearAuthToken();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your username, posts, followers and all associated data will be permanently removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    await clearAuthToken();
                    router.replace('/(auth)/login');
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  function handleSendFeedback() {
    openUrl('mailto:feedback@gitgram.app?subject=Gitgram%20Feedback').catch(() => {
      Alert.alert('Feedback', 'Send your feedback to feedback@gitgram.app');
    });
  }

  function handleRateApp() {
    const storeUrl =
      Platform.OS === 'ios'
        ? 'itms-apps://itunes.apple.com/app/id000000000?action=write-review'
        : 'market://details?id=app.gitgram';
    openUrl(storeUrl).catch(() => {
      Alert.alert('Rate App', 'Please rate us in the App Store or Google Play.');
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* ACCOUNT                                                           */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Account" />
        <SectionCard>
          <ChevronRow
            label="Edit Profile"
            first
            onPress={() => router.push('/profile/edit' as never)}
          />
          <ChevronRow
            label="Change Username"
            onPress={() => router.push('/settings/change-username' as never)}
          />
          <ChevronRow
            label="Change Email"
            onPress={() => router.push('/settings/change-email' as never)}
          />
          <ChevronRow
            label="Change Password"
            onPress={() => router.push('/settings/change-password' as never)}
          />
          <ChevronRow
            label="Linked GitHub Account"
            badge={settings.githubConnected ? 'Connected' : 'Not connected'}
            badgeVariant={settings.githubConnected ? 'success' : 'muted'}
            last
            onPress={() => router.push('/settings/github-connect' as never)}
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* PRIVACY                                                           */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Privacy" />
        <SectionCard>
          <SwitchRow
            label="Account Privacy"
            sublabel={settings.privateAccount ? 'Private — followers only' : 'Public — anyone can follow'}
            value={settings.privateAccount}
            onValueChange={(v) => update('privateAccount', v)}
            first
          />
          <SwitchRow
            label="Show Activity Status"
            sublabel="Let others see when you were last active"
            value={settings.showActivityStatus}
            onValueChange={(v) => update('showActivityStatus', v)}
          />
          <ValueRow
            label="Allow DMs from"
            value={settings.allowDmsFrom}
            onPress={() => setActivePicker('dms')}
          />
          <ChevronRow
            label="Blocked Users"
            last
            onPress={() => router.push('/settings/blocked-users' as never)}
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* NOTIFICATIONS                                                     */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Notifications" />
        <SectionCard>
          <SwitchRow
            label="Push Notifications"
            sublabel="Master toggle for all notifications"
            value={settings.pushNotifications}
            onValueChange={handlePushToggle}
            first
          />
          <SwitchRow
            label="New Followers"
            value={settings.newFollowers}
            onValueChange={(v) => update('newFollowers', v)}
          />
          <SwitchRow
            label="Post Likes"
            value={settings.postLikes}
            onValueChange={(v) => update('postLikes', v)}
          />
          <SwitchRow
            label="Comments"
            value={settings.comments}
            onValueChange={(v) => update('comments', v)}
          />
          <SwitchRow
            label="Direct Messages"
            value={settings.directMessages}
            onValueChange={(v) => update('directMessages', v)}
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* CONTENT                                                           */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Content" />
        <SectionCard>
          <ValueRow
            label="Language"
            value={settings.language}
            onPress={() => setActivePicker('language')}
            first
          />
          <SegmentedRow
            label="Feed Density"
            options={FEED_DENSITY_OPTIONS}
            selected={settings.feedDensity}
            onSelect={(v) => update('feedDensity', v)}
            last
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* ABOUT                                                             */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="About" />
        <SectionCard>
          <ValueRow label="App Version" value={APP_VERSION} first />
          <ChevronRow
            label="Terms of Service"
            onPress={() => openUrl('https://gitgram.app/terms')}
          />
          <ChevronRow
            label="Privacy Policy"
            onPress={() => openUrl('https://gitgram.app/privacy')}
          />
          <ChevronRow
            label="Send Feedback"
            onPress={handleSendFeedback}
          />
          <ChevronRow
            label="Rate App"
            last
            onPress={handleRateApp}
          />
        </SectionCard>

        {/* ---------------------------------------------------------------- */}
        {/* DANGER ZONE                                                       */}
        {/* ---------------------------------------------------------------- */}
        <SectionHeader title="Danger Zone" />
        <View style={styles.dangerWrapper}>
          <DangerButton label="Log Out" onPress={handleLogOut} />
        </View>
        <View style={styles.deleteWrapper}>
          <DangerButton label="Delete Account" onPress={handleDeleteAccount} underline />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ------------------------------------------------------------------ */}
      {/* DMs picker                                                          */}
      {/* ------------------------------------------------------------------ */}
      <PickerModal
        visible={activePicker === 'dms'}
        title="Allow DMs from"
        options={DM_OPTIONS}
        selected={settings.allowDmsFrom}
        onSelect={(v) => update('allowDmsFrom', v)}
        onDismiss={() => setActivePicker(null)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Language picker                                                     */}
      {/* ------------------------------------------------------------------ */}
      <PickerModal
        visible={activePicker === 'language'}
        title="Language"
        options={LANGUAGE_OPTIONS}
        selected={settings.language}
        onSelect={(v) => update('language', v)}
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
  dangerWrapper: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  deleteWrapper: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  bottomPad: {
    height: 40,
  },
});
