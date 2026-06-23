import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Svg, Circle } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';

import { apiClient } from '../../services/gitgramApi';
import QuickActionSheet from '../../components/QuickActionSheet';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette (matches index.tsx)
// ---------------------------------------------------------------------------
const Colors = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',
  accent: '#4F46E5',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  error: '#F87171',
  success: '#34D399',
  white: '#FFFFFF',
  disabled: '#374151',
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CHARS = 500;
const MAX_SNIPPET_CHARS = 4000;
const HASHTAG_SUGGESTION_DEBOUNCE_MS = 300;

const LANGUAGES = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
  'Java',
  'C',
  'C++',
  'C#',
  'Ruby',
  'PHP',
  'Shell',
  'SQL',
  'HTML',
  'CSS',
  'JSON',
  'YAML',
  'Markdown',
] as const;

type Language = (typeof LANGUAGES)[number];

type TabId = 'Post' | 'Snippet' | 'Reel';

const TABS: TabId[] = ['Post', 'Snippet', 'Reel'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mime: string;
}

interface HashtagSuggestion {
  tag: string;
  postsCount: number;
}

interface CreatePostBody {
  content: string;
  title?: string;
  repositoryUrl?: string;
  mediaUrls?: string[];
}

interface CreateSnippetBody {
  title: string;
  code: string;
  language: string;
  repositoryUrl?: string;
}

interface CreateReelBody {
  content: string;
  title?: string;
  mediaUrls: string[];
}

interface CreatePostResponse {
  id: string;
  content: string;
  mediaUrls: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

/** Return the word currently being typed if it starts with "#". */
function extractActiveHashtag(text: string, cursor: number): string | null {
  const slice = text.slice(0, cursor);
  const match = slice.match(/#(\w*)$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// CharProgress — SVG ring that fills as the user approaches the limit
// ---------------------------------------------------------------------------
interface CharProgressProps {
  count: number;
  max: number;
}

function CharProgress({ count, max }: CharProgressProps) {
  const SIZE = 28;
  const STROKE = 3;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const ratio = Math.min(count / max, 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - ratio);

  const remaining = max - count;
  const isWarning = remaining <= 50 && remaining > 0;
  const isOver = remaining < 0;

  const ringColor = isOver ? Colors.error : isWarning ? '#FBBF24' : Colors.primary;

  return (
    <View style={progressStyles.wrapper}>
      <Svg width={SIZE} height={SIZE}>
        {/* Track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={Colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={ringColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      {(isWarning || isOver) && (
        <Text
          style={[
            progressStyles.counter,
            isOver ? progressStyles.counterOver : progressStyles.counterWarning,
          ]}
        >
          {isOver ? `-${Math.abs(remaining)}` : String(remaining)}
        </Text>
      )}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrapper: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '700',
  },
  counterWarning: {
    color: '#FBBF24',
  },
  counterOver: {
    color: Colors.error,
  },
});

// ---------------------------------------------------------------------------
// ImageThumbnail
// ---------------------------------------------------------------------------
interface ImageThumbnailProps {
  uri: string;
  onRemove: () => void;
}

function ImageThumbnail({ uri, onRemove }: ImageThumbnailProps) {
  return (
    <View style={thumbStyles.container}>
      <Image source={{ uri }} style={thumbStyles.image} resizeMode="cover" />
      <TouchableOpacity
        style={thumbStyles.removeButton}
        onPress={onRemove}
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={thumbStyles.removeIcon}>{'x'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
});

// ---------------------------------------------------------------------------
// HashtagSuggestionList
// ---------------------------------------------------------------------------
interface HashtagSuggestionListProps {
  suggestions: HashtagSuggestion[];
  onSelect: (tag: string) => void;
}

function HashtagSuggestionList({ suggestions, onSelect }: HashtagSuggestionListProps) {
  if (suggestions.length === 0) return null;

  return (
    <View style={hashtagStyles.container}>
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.tag}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={hashtagStyles.list}
        keyboardShouldPersistTaps="always"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={hashtagStyles.chip}
            onPress={() => onSelect(item.tag)}
            activeOpacity={0.7}
          >
            <Text style={hashtagStyles.chipTag}>#{item.tag}</Text>
            {item.postsCount > 0 && (
              <Text style={hashtagStyles.chipCount}>
                {item.postsCount >= 1000
                  ? `${(item.postsCount / 1000).toFixed(1)}k`
                  : String(item.postsCount)}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const hashtagStyles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipTag: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
  chipCount: {
    color: Colors.textMuted,
    fontSize: 11,
  },
});

// ---------------------------------------------------------------------------
// Tab switcher
// ---------------------------------------------------------------------------
interface TabSwitcherProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

function TabSwitcher({ active, onChange }: TabSwitcherProps) {
  return (
    <View style={tabStyles.container}>
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            style={[tabStyles.tab, isActive && tabStyles.tabActive]}
            onPress={() => onChange(tab)}
            activeOpacity={0.7}
          >
            <Text style={[tabStyles.label, isActive && tabStyles.labelActive]}>
              {tab}
            </Text>
            {isActive && <View style={tabStyles.indicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabActive: {},
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.primaryLight,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
});

// ---------------------------------------------------------------------------
// Language chip row (Snippet tab)
// ---------------------------------------------------------------------------
interface LanguageSelectorProps {
  selected: Language;
  onChange: (lang: Language) => void;
}

function LanguageSelector({ selected, onChange }: LanguageSelectorProps) {
  return (
    <View>
      <Text style={langStyles.label}>Language</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={langStyles.row}
        keyboardShouldPersistTaps="always"
      >
        {LANGUAGES.map((lang) => {
          const isSelected = lang === selected;
          return (
            <TouchableOpacity
              key={lang}
              style={[langStyles.chip, isSelected && langStyles.chipSelected]}
              onPress={() => onChange(lang)}
              activeOpacity={0.7}
            >
              <Text style={[langStyles.chipText, isSelected && langStyles.chipTextSelected]}>
                {lang}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const langStyles = StyleSheet.create({
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 4,
  },
  row: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Shared field: title input
// ---------------------------------------------------------------------------
interface TitleInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
}

function TitleInput({
  value,
  onChange,
  placeholder = 'Title (optional)',
  editable = true,
}: TitleInputProps) {
  return (
    <TextInput
      style={fieldStyles.titleInput}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      value={value}
      onChangeText={onChange}
      editable={editable}
      maxLength={120}
      returnKeyType="next"
    />
  );
}

// ---------------------------------------------------------------------------
// Shared field: repository tag
// ---------------------------------------------------------------------------
interface RepoTagInputProps {
  value: string;
  onChange: (v: string) => void;
  editable?: boolean;
}

function RepoTagInput({ value, onChange, editable = true }: RepoTagInputProps) {
  return (
    <View style={fieldStyles.repoRow}>
      <Text style={fieldStyles.repoPrefix}>@</Text>
      <TextInput
        style={fieldStyles.repoInput}
        placeholder="owner/repo (optional)"
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChange}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={200}
        returnKeyType="next"
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  titleInput: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  repoPrefix: {
    color: Colors.textMuted,
    fontSize: 14,
    marginRight: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  repoInput: {
    flex: 1,
    color: Colors.primaryLight,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

// ---------------------------------------------------------------------------
// Image picker shims — supports both expo-image-picker and
// react-native-image-crop-picker, failing gracefully if neither is linked.
// ---------------------------------------------------------------------------

async function pickImageFromLibrary(): Promise<PickedImage | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImagePicker = require('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      mime: asset.mimeType ?? 'image/jpeg',
    };
  } catch {
    /* fall through */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Picker = require('react-native-image-crop-picker');
    const picked = await Picker.default.openPicker({
      width: 1200,
      height: 900,
      cropping: true,
      mediaType: 'photo',
    });
    return {
      uri: picked.path,
      width: picked.width,
      height: picked.height,
      mime: picked.mime,
    };
  } catch {
    /* fall through */
  }

  Alert.alert('Not available', 'Image picker is not configured on this build.');
  return null;
}

async function pickImageFromCamera(): Promise<PickedImage | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImagePicker = require('expo-image-picker');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take a photo.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      mime: asset.mimeType ?? 'image/jpeg',
    };
  } catch {
    /* fall through */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Picker = require('react-native-image-crop-picker');
    const picked = await Picker.default.openCamera({
      width: 1200,
      height: 900,
      cropping: true,
      mediaType: 'photo',
    });
    return {
      uri: picked.path,
      width: picked.width,
      height: picked.height,
      mime: picked.mime,
    };
  } catch {
    /* fall through */
  }

  Alert.alert('Not available', 'Camera is not configured on this build.');
  return null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchHashtagSuggestions(query: string): Promise<HashtagSuggestion[]> {
  try {
    const result = await apiClient<{ hashtags: HashtagSuggestion[] }>(
      `/v1/hashtags/suggest?q=${encodeURIComponent(query)}&limit=8`,
    );
    return result.hashtags ?? [];
  } catch {
    return [];
  }
}

async function submitPost(body: CreatePostBody): Promise<CreatePostResponse> {
  return apiClient<CreatePostResponse>('/v1/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function submitSnippet(body: CreateSnippetBody): Promise<CreatePostResponse> {
  return apiClient<CreatePostResponse>('/v1/snippets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function submitReel(body: CreateReelBody): Promise<CreatePostResponse> {
  return apiClient<CreatePostResponse>('/v1/reels', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------
interface ToolbarButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function ToolbarButton({ label, onPress, disabled = false }: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      style={[toolbarBtnStyles.button, disabled && toolbarBtnStyles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[toolbarBtnStyles.label, disabled && toolbarBtnStyles.labelDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const toolbarBtnStyles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 18,
    color: Colors.text,
  },
  labelDisabled: {
    color: Colors.textMuted,
  },
});

// ---------------------------------------------------------------------------
// POST TAB
// ---------------------------------------------------------------------------

interface PostTabProps {
  isSubmitting: boolean;
}

function PostTab({ isSubmitting }: PostTabProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [repoTag, setRepoTag] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<HashtagSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0 && image === null;
  const canPost = !isEmpty && !isOverLimit && !isSubmitting && !isPosting;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const activeTag = extractActiveHashtag(text, cursorPosition);
    if (activeTag === null) {
      setHashtagSuggestions([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      const suggestions = await fetchHashtagSuggestions(activeTag);
      setHashtagSuggestions(suggestions);
      setIsFetchingSuggestions(false);
    }, HASHTAG_SUGGESTION_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [text, cursorPosition]);

  const handleSelectionChange = useCallback(
    (event: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setCursorPosition(event.nativeEvent.selection.end);
    },
    [],
  );

  const handlePickImage = useCallback(async () => {
    const picked = await pickImageFromLibrary();
    if (picked) setImage(picked);
  }, []);

  const handleCameraPress = useCallback(async () => {
    const picked = await pickImageFromCamera();
    if (picked) setImage(picked);
  }, []);

  const handleHashtagPress = useCallback(() => {
    setText((prev) => prev + '#');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleEmojiPress = useCallback(() => {
    setText((prev) => prev + '\u{1F604}');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleHashtagSelect = useCallback(
    (tag: string) => {
      const activeTag = extractActiveHashtag(text, cursorPosition);
      if (activeTag === null) return;
      const hashIndex = text.slice(0, cursorPosition).lastIndexOf('#');
      if (hashIndex === -1) return;
      const before = text.slice(0, hashIndex);
      const after = text.slice(cursorPosition);
      setText(before + `#${tag} ` + after);
      setHashtagSuggestions([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [text, cursorPosition],
  );

  const handleSubmit = useCallback(async () => {
    if (!canPost) return;
    setIsPosting(true);
    try {
      const body: CreatePostBody = {
        content: text.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(repoTag.trim() ? { repositoryUrl: repoTag.trim() } : {}),
        ...(image ? { mediaUrls: [image.uri] } : {}),
      };
      await submitPost(body);
      setTitle('');
      setText('');
      setRepoTag('');
      setImage(null);
      setHashtagSuggestions([]);
      Alert.alert('Posted!', 'Your post is now live.');
    } catch (err: unknown) {
      Alert.alert('Failed to post', getErrorMessage(err));
    } finally {
      setIsPosting(false);
    }
  }, [canPost, title, text, repoTag, image]);

  return (
    <KeyboardAvoidingView
      style={screenStyles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 130 : 0}
    >
      <ScrollView
        style={screenStyles.flex}
        contentContainerStyle={screenStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TitleInput value={title} onChange={setTitle} editable={!isPosting} />
        <RepoTagInput value={repoTag} onChange={setRepoTag} editable={!isPosting} />

        <TextInput
          ref={inputRef}
          style={screenStyles.textInput}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textMuted}
          multiline
          autoFocus
          value={text}
          onChangeText={setText}
          onSelectionChange={handleSelectionChange}
          maxLength={MAX_CHARS + 50}
          scrollEnabled={false}
          textAlignVertical="top"
          editable={!isPosting}
        />

        {image ? <ImageThumbnail uri={image.uri} onRemove={() => setImage(null)} /> : null}
      </ScrollView>

      {!isFetchingSuggestions && hashtagSuggestions.length > 0 ? (
        <HashtagSuggestionList
          suggestions={hashtagSuggestions}
          onSelect={handleHashtagSelect}
        />
      ) : null}

      <View style={screenStyles.toolbar}>
        <View style={screenStyles.toolbarLeft}>
          <ToolbarButton label={'🖼'} onPress={handlePickImage} disabled={isPosting} />
          <ToolbarButton label={'📷'} onPress={handleCameraPress} disabled={isPosting} />
          <ToolbarButton label={'#'} onPress={handleHashtagPress} disabled={isPosting} />
          <ToolbarButton label={'😊'} onPress={handleEmojiPress} disabled={isPosting} />
        </View>
        <View style={screenStyles.toolbarRight}>
          <CharProgress count={charCount} max={MAX_CHARS} />
          <Pressable
            style={[screenStyles.submitButton, !canPost && screenStyles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canPost}
          >
            {isPosting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={[screenStyles.submitButtonText, !canPost && screenStyles.submitButtonTextDisabled]}>
                Post
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// SNIPPET TAB
// ---------------------------------------------------------------------------

interface SnippetTabProps {
  isSubmitting: boolean;
}

function SnippetTab({ isSubmitting }: SnippetTabProps) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>('TypeScript');
  const [code, setCode] = useState('');
  const [repoTag, setRepoTag] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const charCount = code.length;
  const isOverLimit = charCount > MAX_SNIPPET_CHARS;
  const canPost = title.trim().length > 0 && code.trim().length > 0 && !isOverLimit && !isSubmitting && !isPosting;

  const handleSubmit = useCallback(async () => {
    if (!canPost) return;
    setIsPosting(true);
    try {
      const body: CreateSnippetBody = {
        title: title.trim(),
        code: code.trim(),
        language,
        ...(repoTag.trim() ? { repositoryUrl: repoTag.trim() } : {}),
      };
      await submitSnippet(body);
      setTitle('');
      setCode('');
      setRepoTag('');
      Alert.alert('Snippet shared!', 'Your code snippet is now live.');
    } catch (err: unknown) {
      Alert.alert('Failed to share snippet', getErrorMessage(err));
    } finally {
      setIsPosting(false);
    }
  }, [canPost, title, code, language, repoTag]);

  return (
    <KeyboardAvoidingView
      style={screenStyles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 130 : 0}
    >
      <ScrollView
        style={screenStyles.flex}
        contentContainerStyle={screenStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TitleInput
          value={title}
          onChange={setTitle}
          placeholder="Snippet title *"
          editable={!isPosting}
        />
        <RepoTagInput value={repoTag} onChange={setRepoTag} editable={!isPosting} />
        <LanguageSelector selected={language} onChange={setLanguage} />

        <View style={snippetStyles.codeContainer}>
          <View style={snippetStyles.codeHeader}>
            <Text style={snippetStyles.codeHeaderLang}>{language}</Text>
            <Text style={[snippetStyles.charCount, isOverLimit && snippetStyles.charCountOver]}>
              {charCount}/{MAX_SNIPPET_CHARS}
            </Text>
          </View>
          <TextInput
            style={snippetStyles.codeInput}
            placeholder={`// Paste or type your ${language} code here...`}
            placeholderTextColor={Colors.textMuted}
            multiline
            value={code}
            onChangeText={setCode}
            maxLength={MAX_SNIPPET_CHARS + 200}
            scrollEnabled={false}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            editable={!isPosting}
          />
        </View>
      </ScrollView>

      <View style={screenStyles.toolbar}>
        <Text style={[snippetStyles.hint, !canPost && { opacity: 0.4 }]}>
          {title.trim().length === 0 ? 'Add a title to post' : code.trim().length === 0 ? 'Paste some code' : ''}
        </Text>
        <View style={screenStyles.toolbarRight}>
          <Pressable
            style={[screenStyles.submitButton, !canPost && screenStyles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canPost}
          >
            {isPosting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={[screenStyles.submitButtonText, !canPost && screenStyles.submitButtonTextDisabled]}>
                Share
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const snippetStyles = StyleSheet.create({
  codeContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  codeHeaderLang: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textTransform: 'lowercase',
  },
  charCount: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  charCountOver: {
    color: Colors.error,
    fontWeight: '700',
  },
  codeInput: {
    minHeight: 220,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
});

// ---------------------------------------------------------------------------
// REEL TAB
// ---------------------------------------------------------------------------

interface ReelTabProps {
  isSubmitting: boolean;
}

function ReelTab({ isSubmitting }: ReelTabProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const charCount = caption.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canPost = image !== null && !isOverLimit && !isSubmitting && !isPosting;

  const handlePickImage = useCallback(async () => {
    const picked = await pickImageFromLibrary();
    if (picked) setImage(picked);
  }, []);

  const handleCameraPress = useCallback(async () => {
    const picked = await pickImageFromCamera();
    if (picked) setImage(picked);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canPost || !image) return;
    setIsPosting(true);
    try {
      const body: CreateReelBody = {
        content: caption.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
        mediaUrls: [image.uri],
      };
      await submitReel(body);
      setTitle('');
      setCaption('');
      setImage(null);
      Alert.alert('Reel posted!', 'Your reel is now live.');
    } catch (err: unknown) {
      Alert.alert('Failed to post reel', getErrorMessage(err));
    } finally {
      setIsPosting(false);
    }
  }, [canPost, title, caption, image]);

  return (
    <KeyboardAvoidingView
      style={screenStyles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 130 : 0}
    >
      <ScrollView
        style={screenStyles.flex}
        contentContainerStyle={screenStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {image ? (
          <ImageThumbnail uri={image.uri} onRemove={() => setImage(null)} />
        ) : (
          <View style={reelStyles.mediaPicker}>
            <TouchableOpacity
              style={reelStyles.mediaPickerBtn}
              onPress={handlePickImage}
              activeOpacity={0.7}
            >
              <Text style={reelStyles.mediaPickerIcon}>🖼</Text>
              <Text style={reelStyles.mediaPickerLabel}>Choose from library</Text>
            </TouchableOpacity>
            <View style={reelStyles.mediaPickerDivider}>
              <View style={reelStyles.dividerLine} />
              <Text style={reelStyles.dividerText}>or</Text>
              <View style={reelStyles.dividerLine} />
            </View>
            <TouchableOpacity
              style={reelStyles.mediaPickerBtn}
              onPress={handleCameraPress}
              activeOpacity={0.7}
            >
              <Text style={reelStyles.mediaPickerIcon}>📷</Text>
              <Text style={reelStyles.mediaPickerLabel}>Take a photo</Text>
            </TouchableOpacity>
          </View>
        )}

        <TitleInput
          value={title}
          onChange={setTitle}
          placeholder="Title (optional)"
          editable={!isPosting}
        />

        <TextInput
          style={[screenStyles.textInput, { minHeight: 100 }]}
          placeholder="Add a caption..."
          placeholderTextColor={Colors.textMuted}
          multiline
          value={caption}
          onChangeText={setCaption}
          maxLength={MAX_CHARS + 50}
          scrollEnabled={false}
          textAlignVertical="top"
          editable={!isPosting}
        />
      </ScrollView>

      <View style={screenStyles.toolbar}>
        <View style={screenStyles.toolbarLeft}>
          <ToolbarButton label={'🖼'} onPress={handlePickImage} disabled={isPosting} />
          <ToolbarButton label={'📷'} onPress={handleCameraPress} disabled={isPosting} />
        </View>
        <View style={screenStyles.toolbarRight}>
          <CharProgress count={charCount} max={MAX_CHARS} />
          <Pressable
            style={[screenStyles.submitButton, !canPost && screenStyles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canPost}
          >
            {isPosting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={[screenStyles.submitButtonText, !canPost && screenStyles.submitButtonTextDisabled]}>
                Post
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const reelStyles = StyleSheet.create({
  mediaPicker: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 24,
  },
  mediaPickerBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  mediaPickerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  mediaPickerLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  mediaPickerDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 32,
    marginVertical: 8,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CreatePostScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('Post');
  const [isSubmitting] = useState(false);

  // The quick-action sheet greets the user every time the Create tab is opened.
  const [sheetVisible, setSheetVisible] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setSheetVisible(true);
      return undefined;
    }, []),
  );

  // Dismissing the sheet returns to the previous screen so the user is not left
  // staring at the bare composer they did not explicitly choose.
  const handleSheetClose = useCallback(() => {
    setSheetVisible(false);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  const handleSheetSelect = useCallback(
    (route: string) => {
      setSheetVisible(false);
      router.push(route);
    },
    [router],
  );

  const tabLabel: Record<TabId, string> = {
    Post: 'New Post',
    Snippet: 'New Snippet',
    Reel: 'New Reel',
  };

  return (
    <SafeAreaView style={screenStyles.safeArea}>
      {/* Header */}
      <View style={screenStyles.header}>
        <Text style={screenStyles.headerTitle}>{tabLabel[activeTab]}</Text>
      </View>

      {/* Tab switcher */}
      <TabSwitcher active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'Post' && <PostTab isSubmitting={isSubmitting} />}
      {activeTab === 'Snippet' && <SnippetTab isSubmitting={isSubmitting} />}
      {activeTab === 'Reel' && <ReelTab isSubmitting={isSubmitting} />}

      {/* Quick-action bottom sheet, shown on focus */}
      <QuickActionSheet
        visible={sheetVisible}
        onClose={handleSheetClose}
        onSelect={handleSheetSelect}
      />
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  textInput: {
    flex: 1,
    minHeight: 160,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: Colors.disabled,
  },
  submitButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  submitButtonTextDisabled: {
    color: Colors.textMuted,
  },
});
