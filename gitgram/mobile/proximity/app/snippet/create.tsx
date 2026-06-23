import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';

// ---------------------------------------------------------------------------
// Brand colors — matches snippet/[id].tsx / profile.tsx palette
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  white: '#FFFFFF',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

// ---------------------------------------------------------------------------
// Language catalogue (20 languages, each with a brand color dot)
// ---------------------------------------------------------------------------
interface LanguageOption {
  name: string;
  color: string;
}

const LANGUAGES: readonly LanguageOption[] = [
  { name: 'TypeScript', color: '#3178C6' },
  { name: 'JavaScript', color: '#F7DF1E' },
  { name: 'Python', color: '#3572A5' },
  { name: 'Rust', color: '#DEA584' },
  { name: 'Go', color: '#00ADD8' },
  { name: 'Java', color: '#B07219' },
  { name: 'Swift', color: '#FA7343' },
  { name: 'Kotlin', color: '#A97BFF' },
  { name: 'C++', color: '#F34B7D' },
  { name: 'C', color: '#555555' },
  { name: 'C#', color: '#178600' },
  { name: 'Ruby', color: '#701516' },
  { name: 'PHP', color: '#4F5D95' },
  { name: 'Dart', color: '#00B4AB' },
  { name: 'Scala', color: '#C22D40' },
  { name: 'Haskell', color: '#5E5086' },
  { name: 'Elixir', color: '#6E4A7E' },
  { name: 'Shell', color: '#89E051' },
  { name: 'SQL', color: '#E38C00' },
  { name: 'HTML', color: '#E34C26' },
] as const;

const TAB_INSERT = '  '; // 2-space soft tab

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 10;

// ---------------------------------------------------------------------------
// Auth helpers — mirrors snippet/[id].tsx
// ---------------------------------------------------------------------------
const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

const AUTH_TOKEN_KEY = 'accessToken';

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function authedFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Visibility = 'public' | 'unlisted';

interface RepositorySummary {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
}

interface CreateSnippetPayload {
  title: string;
  description?: string;
  code: string;
  language: string;
  tags: string[];
  visibility: Visibility;
  repositoryId?: string;
}

interface CreatedSnippet {
  id: string;
}

// Expo Router can inject a navigation callback as a prop. Kept optional so the
// screen is testable in isolation.
interface SnippetCreateProps {
  onClose?: () => void;
  onCreated?: (snippetId: string) => void;
}

// ---------------------------------------------------------------------------
// Tag input — hashtag chips
// ---------------------------------------------------------------------------
interface TagInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();
}

function TagInput({ tags, onAdd, onRemove }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = useCallback(() => {
    const tag = normalizeTag(draft);
    setDraft('');
    if (tag) onAdd(tag);
  }, [draft, onAdd]);

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const key = event.nativeEvent.key;
      if (key === ',' || key === ' ') {
        commit();
      }
    },
    [commit],
  );

  return (
    <View style={tagStyles.wrapper}>
      <View style={tagStyles.chipsRow}>
        {tags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => onRemove(tag)}
            style={({ pressed }) => [tagStyles.chip, pressed && tagStyles.chipPressed]}
            accessibilityLabel={`Remove tag ${tag}`}
          >
            <Text style={tagStyles.chipText}>#{tag}</Text>
            <Text style={tagStyles.chipRemove}>×</Text>
          </Pressable>
        ))}
      </View>
      {tags.length < MAX_TAGS ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onKeyPress={handleKeyPress}
          onSubmitEditing={commit}
          onBlur={commit}
          placeholder={tags.length === 0 ? 'Add tags (press space to confirm)' : 'Add another tag'}
          placeholderTextColor={Colors.textMuted}
          style={tagStyles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
        />
      ) : (
        <Text style={tagStyles.maxHint}>Maximum {MAX_TAGS} tags</Text>
      )}
    </View>
  );
}

const tagStyles = StyleSheet.create({
  wrapper: { gap: 10 },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}22`,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  chipPressed: { opacity: 0.6 },
  chipText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
  chipRemove: {
    color: Colors.primaryLight,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: 15,
  },
  maxHint: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
});

// ---------------------------------------------------------------------------
// Language picker bottom sheet
// ---------------------------------------------------------------------------
interface LanguagePickerProps {
  visible: boolean;
  selected: string | null;
  onSelect: (language: string) => void;
  onClose: () => void;
}

function LanguagePicker({ visible, selected, onSelect, onClose }: LanguagePickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={() => undefined}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Select language</Text>
          <ScrollView
            style={sheetStyles.list}
            contentContainerStyle={sheetStyles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {LANGUAGES.map((lang) => {
              const isActive = lang.name === selected;
              return (
                <Pressable
                  key={lang.name}
                  onPress={() => {
                    onSelect(lang.name);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    sheetStyles.row,
                    isActive && sheetStyles.rowActive,
                    pressed && sheetStyles.rowPressed,
                  ]}
                  accessibilityLabel={`Select ${lang.name}`}
                >
                  <View style={[sheetStyles.dot, { backgroundColor: lang.color }]} />
                  <Text style={[sheetStyles.rowText, isActive && sheetStyles.rowTextActive]}>
                    {lang.name}
                  </Text>
                  {isActive ? <Text style={sheetStyles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  sheetTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 12,
  },
  rowActive: {
    backgroundColor: Colors.surfaceElevated,
  },
  rowPressed: { opacity: 0.7 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  rowTextActive: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  check: {
    color: Colors.primaryLight,
    fontSize: 16,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Repository attach selector
// ---------------------------------------------------------------------------
interface RepoSelectorProps {
  selected: RepositorySummary | null;
  onChange: (repo: RepositorySummary | null) => void;
}

function RepoSelector({ selected, onChange }: RepoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RepositorySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await authedFetch<{ repositories: RepositorySummary[] }>(
        `/v1/repositories/search?q=${encodeURIComponent(trimmed)}&limit=15`,
      );
      // Ignore out-of-order responses.
      if (seq === searchSeq.current) {
        setResults(data.repositories ?? []);
      }
    } catch (error: unknown) {
      if (seq === searchSeq.current) {
        setSearchError(getErrorMessage(error));
        setResults([]);
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      runSearch(text);
    },
    [runSearch],
  );

  if (selected) {
    return (
      <View style={repoStyles.selectedCard}>
        <View style={repoStyles.selectedInfo}>
          <Text style={repoStyles.selectedName} numberOfLines={1}>
            {selected.fullName}
          </Text>
          <Text style={repoStyles.selectedSub}>Attached repository</Text>
        </View>
        <Pressable
          onPress={() => onChange(null)}
          style={({ pressed }) => [repoStyles.detachBtn, pressed && repoStyles.pressed]}
          accessibilityLabel="Detach repository"
        >
          <Text style={repoStyles.detachText}>Remove</Text>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [repoStyles.attachBtn, pressed && repoStyles.pressed]}
        accessibilityLabel="Attach a repository"
      >
        <Text style={repoStyles.attachIcon}>+</Text>
        <Text style={repoStyles.attachText}>Attach to a repository</Text>
      </Pressable>
    );
  }

  return (
    <View style={repoStyles.searchWrapper}>
      <View style={repoStyles.searchRow}>
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search repositories…"
          placeholderTextColor={Colors.textMuted}
          style={repoStyles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <Pressable
          onPress={() => {
            setOpen(false);
            setQuery('');
            setResults([]);
            setSearchError(null);
          }}
          style={({ pressed }) => [repoStyles.cancelSearch, pressed && repoStyles.pressed]}
          accessibilityLabel="Cancel repository search"
        >
          <Text style={repoStyles.cancelSearchText}>Cancel</Text>
        </Pressable>
      </View>

      {searching ? (
        <View style={repoStyles.searchStatus}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : null}

      {searchError ? (
        <Text style={repoStyles.searchError}>{searchError}</Text>
      ) : null}

      {!searching && !searchError && query.trim() && results.length === 0 ? (
        <Text style={repoStyles.searchEmpty}>No repositories found.</Text>
      ) : null}

      {results.map((repo) => (
        <Pressable
          key={repo.id}
          onPress={() => {
            onChange(repo);
            setOpen(false);
            setQuery('');
            setResults([]);
          }}
          style={({ pressed }) => [repoStyles.resultRow, pressed && repoStyles.pressed]}
          accessibilityLabel={`Attach ${repo.fullName}`}
        >
          <Text style={repoStyles.resultName} numberOfLines={1}>
            {repo.fullName}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const repoStyles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  attachIcon: {
    color: Colors.primaryLight,
    fontSize: 18,
    fontWeight: '700',
  },
  attachText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}14`,
  },
  selectedInfo: { flex: 1, marginRight: 12 },
  selectedName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  selectedSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  detachBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
  detachText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  searchWrapper: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
  },
  cancelSearch: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cancelSearchText: {
    color: Colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  searchStatus: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  searchError: {
    color: Colors.error,
    fontSize: 13,
    paddingVertical: 4,
  },
  searchEmpty: {
    color: Colors.textMuted,
    fontSize: 13,
    paddingVertical: 4,
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
  },
  resultName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Visibility toggle
// ---------------------------------------------------------------------------
interface VisibilityToggleProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
}

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: Visibility;
  label: string;
  hint: string;
}> = [
  { value: 'public', label: 'Public', hint: 'Visible on your profile & feed' },
  { value: 'unlisted', label: 'Unlisted', hint: 'Only people with the link' },
];

function VisibilityToggle({ value, onChange }: VisibilityToggleProps) {
  return (
    <View style={visStyles.row}>
      {VISIBILITY_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              visStyles.option,
              isActive && visStyles.optionActive,
              pressed && visStyles.optionPressed,
            ]}
            accessibilityLabel={`Set visibility to ${option.label}`}
          >
            <Text style={[visStyles.optionLabel, isActive && visStyles.optionLabelActive]}>
              {option.label}
            </Text>
            <Text style={[visStyles.optionHint, isActive && visStyles.optionHintActive]}>
              {option.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const visStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  option: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}14`,
  },
  optionPressed: { opacity: 0.8 },
  optionLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  optionLabelActive: {
    color: Colors.primaryLight,
  },
  optionHint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  optionHintActive: {
    color: Colors.textSecondary,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SnippetCreateScreen({ onClose, onCreated }: SnippetCreateProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [repository, setRepository] = useState<RepositorySummary | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const trimmedTitle = title.trim();
  const trimmedCode = code.trim();

  const lineCount = useMemo(
    () => (code.length === 0 ? 0 : code.split('\n').length),
    [code],
  );

  const selectedLanguage = useMemo(
    () => LANGUAGES.find((l) => l.name === language) ?? null,
    [language],
  );

  // Post is enabled only once the required fields are present.
  const canSubmit = trimmedTitle.length > 0 && trimmedCode.length > 0 && !submitting;

  const addTag = useCallback((tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = event.nativeEvent.selection;
    },
    [],
  );

  // Syntax-aware tab insertion: pressing Tab inserts soft spaces at the caret
  // rather than moving focus.
  const handleCodeKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key !== 'Tab') return;
      const { start, end } = selectionRef.current;
      setCode((prev) => {
        const next = prev.slice(0, start) + TAB_INSERT + prev.slice(end);
        const caret = start + TAB_INSERT.length;
        selectionRef.current = { start: caret, end: caret };
        return next;
      });
    },
    [],
  );

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload: CreateSnippetPayload = {
      title: trimmedTitle,
      code,
      language: language ?? 'Text',
      tags,
      visibility,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(repository ? { repositoryId: repository.id } : {}),
    };

    try {
      const created = await authedFetch<CreatedSnippet>('/v1/snippets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCreated?.(created.id);
    } catch (error: unknown) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    trimmedTitle,
    code,
    language,
    tags,
    visibility,
    description,
    repository,
    onCreated,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleClose}
          disabled={submitting}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        <Text style={styles.headerTitle}>New Snippet</Text>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.postBtn,
            !canSubmit && styles.postBtnDisabled,
            pressed && canSubmit && styles.pressed,
          ]}
          hitSlop={8}
          accessibilityLabel="Post snippet"
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={[styles.postText, !canSubmit && styles.postTextDisabled]}>Post</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {submitError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}

          {/* Title */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Title</Text>
              <Text style={styles.required}>Required</Text>
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="A short, descriptive title"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
              maxLength={MAX_TITLE_LENGTH}
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What does this snippet do?"
              placeholderTextColor={Colors.textMuted}
              style={[styles.input, styles.inputMultiline]}
              multiline
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
          </View>

          {/* Language selector */}
          <View style={styles.field}>
            <Text style={styles.label}>Language</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.langSelect, pressed && styles.pressed]}
              accessibilityLabel="Choose language"
            >
              {selectedLanguage ? (
                <>
                  <View
                    style={[styles.langDot, { backgroundColor: selectedLanguage.color }]}
                  />
                  <Text style={styles.langSelectText}>{selectedLanguage.name}</Text>
                </>
              ) : (
                <Text style={styles.langSelectPlaceholder}>Select a language</Text>
              )}
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>

          {/* Code editor */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Code</Text>
              <Text style={styles.required}>Required</Text>
            </View>
            <View style={styles.codeWrapper}>
              <View style={styles.codeToolbar}>
                <Text style={styles.codeToolbarLabel}>
                  {selectedLanguage ? selectedLanguage.name : 'Plain text'}
                </Text>
                <Text style={styles.lineCount}>
                  {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                </Text>
              </View>
              <TextInput
                value={code}
                onChangeText={setCode}
                onKeyPress={handleCodeKeyPress}
                onSelectionChange={handleSelectionChange}
                placeholder={'// Paste or type your code here'}
                placeholderTextColor={Colors.textMuted}
                style={styles.codeInput}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Tags */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Tags</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <TagInput tags={tags} onAdd={addTag} onRemove={removeTag} />
          </View>

          {/* Visibility */}
          <View style={styles.field}>
            <Text style={styles.label}>Visibility</Text>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </View>

          {/* Attach to repository */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Repository</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <RepoSelector selected={repository} onChange={setRepository} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LanguagePicker
        visible={pickerOpen}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setPickerOpen(false)}
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
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },

  // Header
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerBtn: {
    minWidth: 64,
    paddingVertical: 6,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  postBtn: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.primary,
  },
  postBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  postText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  postTextDisabled: {
    color: Colors.textMuted,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 22,
  },

  // Error banner
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: `${Colors.error}1A`,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: 14,
    lineHeight: 19,
  },

  // Fields
  field: { gap: 10 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  required: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optional: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Language selector
  langSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  langDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  langSelectText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  langSelectPlaceholder: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 15,
  },
  chevron: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: -4,
  },

  // Code editor
  codeWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  codeToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  codeToolbarLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  lineCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  codeInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
    color: Colors.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 200,
  },
});
