import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { useRouter } from 'expo-router';
import { Svg, Circle } from 'react-native-svg';

import {
  apiClient,
  getMyProfile,
  searchUsers,
  type UserProfile,
} from '../../services/gitgramApi';

// ---------------------------------------------------------------------------
// Brand colors — purple/indigo gitgram palette
// ---------------------------------------------------------------------------
const C = {
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
  hashtag: '#A78BFA',
  mention: '#34D399',
  codeBg: '#0D1117',
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_CHARS = 500;
const MAX_SNIPPET_CHARS = 4000;
const DEBOUNCE_MS = 300;
const MAX_IMAGES = 4;

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
type ContentTab = 'Text' | 'Code Snippet' | 'Share Repo';
const CONTENT_TABS: ContentTab[] = ['Text', 'Code Snippet', 'Share Repo'];

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------
interface CreatePostBody {
  content: string;
  title?: string;
  mediaUrls?: string[];
  codeSnippet?: {
    language: string;
    title: string;
    code: string;
  };
  repositoryId?: string;
}

interface CreatePostResponse {
  id: string;
  content: string;
  createdAt: string;
}

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  starsCount: number;
  forksCount: number;
  url: string;
}

interface RepositorySearchResponse {
  repositories: Repository[];
}

interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mime: string;
}

interface MentionSuggestion {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

function extractActiveHashtag(text: string, cursor: number): string | null {
  const slice = text.slice(0, cursor);
  const match = slice.match(/#(\w*)$/);
  return match ? match[1] : null;
}

function extractActiveMention(text: string, cursor: number): string | null {
  const slice = text.slice(0, cursor);
  const match = slice.match(/@(\w*)$/);
  return match ? match[1] : null;
}

/** Render text with #hashtags and @mentions highlighted. */
function renderStyledText(text: string): React.ReactNode[] {
  const parts = text.split(/(#\w+|@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      return (
        <Text key={i} style={{ color: C.hashtag }}>
          {part}
        </Text>
      );
    }
    if (part.startsWith('@')) {
      return (
        <Text key={i} style={{ color: C.mention }}>
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

// ---------------------------------------------------------------------------
// Image picker shim — supports expo-image-picker, fails gracefully
// ---------------------------------------------------------------------------
async function pickImagesFromLibrary(): Promise<PickedImage[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImagePicker = require('expo-image-picker');
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Photo library access is needed to attach images.',
      );
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return [];
    return result.assets.map(
      (a: { uri: string; width: number; height: number; mimeType?: string }) => ({
        uri: a.uri,
        width: a.width ?? 0,
        height: a.height ?? 0,
        mime: a.mimeType ?? 'image/jpeg',
      }),
    );
  } catch {
    Alert.alert('Not available', 'Image picker is not configured on this build.');
    return [];
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
async function submitPost(body: CreatePostBody): Promise<CreatePostResponse> {
  return apiClient<CreatePostResponse>('/v1/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function searchRepositories(q: string): Promise<Repository[]> {
  try {
    const result = await apiClient<RepositorySearchResponse>(
      `/v1/repositories?q=${encodeURIComponent(q)}&limit=10`,
    );
    return result.repositories ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CharProgress — SVG ring
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
  const ringColor = isOver ? C.error : isWarning ? '#FBBF24' : C.primary;

  return (
    <View style={progressSt.wrapper}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={C.border}
          strokeWidth={STROKE}
          fill="none"
        />
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
            progressSt.counter,
            isOver ? progressSt.counterOver : progressSt.counterWarn,
          ]}
        >
          {isOver ? `-${Math.abs(remaining)}` : String(remaining)}
        </Text>
      )}
    </View>
  );
}

const progressSt = StyleSheet.create({
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
  counterWarn: { color: '#FBBF24' },
  counterOver: { color: C.error },
});

// ---------------------------------------------------------------------------
// ContentTabPills
// ---------------------------------------------------------------------------
interface ContentTabPillsProps {
  active: ContentTab;
  onChange: (tab: ContentTab) => void;
}

function ContentTabPills({ active, onChange }: ContentTabPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={pillSt.scroll}
      contentContainerStyle={pillSt.row}
      keyboardShouldPersistTaps="always"
    >
      {CONTENT_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            style={[pillSt.pill, isActive && pillSt.pillActive]}
            onPress={() => onChange(tab)}
            activeOpacity={0.75}
          >
            <Text style={[pillSt.label, isActive && pillSt.labelActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const pillSt = StyleSheet.create({
  scroll: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
    flexGrow: 0,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillActive: {
    backgroundColor: C.primaryDark,
    borderColor: C.primary,
  },
  label: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: C.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// AuthorRow
// ---------------------------------------------------------------------------
interface AuthorRowProps {
  avatarUrl: string | null;
  username: string;
}

function AuthorRow({ avatarUrl, username }: AuthorRowProps) {
  return (
    <View style={authorSt.row}>
      <View style={authorSt.avatarWrap}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={authorSt.avatar}
            resizeMode="cover"
          />
        ) : (
          <View style={authorSt.avatarFallback}>
            <Text style={authorSt.avatarInitial}>
              {username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={authorSt.username}>{username}</Text>
    </View>
  );
}

const authorSt = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700',
  },
  username: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// MentionDropdown
// ---------------------------------------------------------------------------
interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  onSelect: (username: string) => void;
}

function MentionDropdown({ suggestions, onSelect }: MentionDropdownProps) {
  if (suggestions.length === 0) return null;

  return (
    <View style={mentionSt.container}>
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={mentionSt.list}
        keyboardShouldPersistTaps="always"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={mentionSt.chip}
            onPress={() => onSelect(item.username)}
            activeOpacity={0.7}
          >
            {item.avatarUrl ? (
              <Image
                source={{ uri: item.avatarUrl }}
                style={mentionSt.avatar}
              />
            ) : (
              <View style={mentionSt.avatarFallback}>
                <Text style={mentionSt.avatarInitial}>
                  {item.username.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={mentionSt.username}>@{item.username}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const mentionSt = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  avatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.white,
    fontSize: 11,
    fontWeight: '700',
  },
  username: {
    color: C.mention,
    fontSize: 13,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// ImageGrid
// ---------------------------------------------------------------------------
interface ImageGridProps {
  images: PickedImage[];
  onRemove: (index: number) => void;
}

function ImageGrid({ images, onRemove }: ImageGridProps) {
  if (images.length === 0) return null;

  return (
    <View style={imgGridSt.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={imgGridSt.row}
      >
        {images.map((img, index) => (
          <View key={img.uri} style={imgGridSt.thumbWrap}>
            <Image
              source={{ uri: img.uri }}
              style={imgGridSt.thumb}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={imgGridSt.removeBtn}
              onPress={() => onRemove(index)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={imgGridSt.removeX}>x</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const imgGridSt = StyleSheet.create({
  container: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 12,
  },
  row: {
    paddingHorizontal: 16,
    gap: 10,
  },
  thumbWrap: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  thumb: {
    width: 100,
    height: 100,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeX: {
    color: C.white,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
});

// ---------------------------------------------------------------------------
// LanguageBottomSheet (modal picker)
// ---------------------------------------------------------------------------
interface LanguageBottomSheetProps {
  visible: boolean;
  selected: Language;
  onSelect: (lang: Language) => void;
  onClose: () => void;
}

function LanguageBottomSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: LanguageBottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetSt.backdrop} onPress={onClose} />
      <View style={sheetSt.sheet}>
        <View style={sheetSt.handle} />
        <Text style={sheetSt.title}>Select Language</Text>
        <FlatList
          data={LANGUAGES}
          keyExtractor={(item) => item}
          numColumns={2}
          contentContainerStyle={sheetSt.grid}
          keyboardShouldPersistTaps="always"
          renderItem={({ item }) => {
            const isSelected = item === selected;
            return (
              <TouchableOpacity
                style={[sheetSt.langItem, isSelected && sheetSt.langItemSelected]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    sheetSt.langText,
                    isSelected && sheetSt.langTextSelected,
                  ]}
                >
                  {item}
                </Text>
                {isSelected && <Text style={sheetSt.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const sheetSt = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '60%',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  grid: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  langItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  langItemSelected: {
    backgroundColor: C.primaryDark,
    borderColor: C.primary,
  },
  langText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  langTextSelected: {
    color: C.white,
    fontWeight: '700',
  },
  checkmark: {
    color: C.primaryLight,
    fontSize: 14,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// RepoSearchRow — repository card in the Share Repo list
// ---------------------------------------------------------------------------
interface RepoCardProps {
  repo: Repository;
  selected: boolean;
  onPress: () => void;
}

function RepoCard({ repo, selected, onPress }: RepoCardProps) {
  return (
    <TouchableOpacity
      style={[repoCardSt.card, selected && repoCardSt.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={repoCardSt.top}>
        <Text style={repoCardSt.name} numberOfLines={1}>
          {repo.fullName}
        </Text>
        {selected && <Text style={repoCardSt.checkmark}>✓</Text>}
      </View>
      {repo.description ? (
        <Text style={repoCardSt.desc} numberOfLines={2}>
          {repo.description}
        </Text>
      ) : null}
      <View style={repoCardSt.meta}>
        {repo.language ? (
          <View style={repoCardSt.metaChip}>
            <Text style={repoCardSt.metaText}>{repo.language}</Text>
          </View>
        ) : null}
        <Text style={repoCardSt.metaText}>★ {repo.starsCount}</Text>
        <Text style={repoCardSt.metaText}>⑂ {repo.forksCount}</Text>
      </View>
    </TouchableOpacity>
  );
}

const repoCardSt = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardSelected: {
    borderColor: C.primary,
    backgroundColor: `${C.primaryDark}55`,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    color: C.primaryLight,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  checkmark: {
    color: C.primaryLight,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  desc: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  metaText: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// TextModePanel
// ---------------------------------------------------------------------------
interface TextModePanelProps {
  isSubmitting: boolean;
}

function useTextMode(isSubmitting: boolean) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [cursor, setCursor] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<
    MentionSuggestion[]
  >([]);
  const [isFetchingMentions, setIsFetchingMentions] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0 && images.length === 0;
  const canPost = !isEmpty && !isOverLimit && !isSubmitting;

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const mention = extractActiveMention(text, cursor);
    if (mention === null) {
      setMentionSuggestions([]);
      return;
    }
    if (mention.length === 0) {
      setMentionSuggestions([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setIsFetchingMentions(true);
      const result = await searchUsers(mention);
      setMentionSuggestions(
        result.users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
        })),
      );
      setIsFetchingMentions(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [text, cursor]);

  const handleSelectionChange = useCallback(
    (event: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setCursor(event.nativeEvent.selection.end);
    },
    [],
  );

  const handleMentionSelect = useCallback(
    (username: string) => {
      const mentionWord = extractActiveMention(text, cursor);
      if (mentionWord === null) return;
      const atIndex = text.slice(0, cursor).lastIndexOf('@');
      if (atIndex === -1) return;
      const before = text.slice(0, atIndex);
      const after = text.slice(cursor);
      setText(before + `@${username} ` + after);
      setMentionSuggestions([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [text, cursor],
  );

  const handlePickImages = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const picked = await pickImagesFromLibrary();
    if (picked.length > 0) {
      setImages((prev) => {
        const combined = [...prev, ...picked];
        return combined.slice(0, MAX_IMAGES);
      });
    }
  }, [images.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    text,
    setText,
    images,
    cursor,
    mentionSuggestions,
    isFetchingMentions,
    inputRef,
    charCount,
    isOverLimit,
    canPost,
    handleSelectionChange,
    handleMentionSelect,
    handlePickImages,
    handleRemoveImage,
  };
}

interface TextModePanelProps2 extends TextModePanelProps {
  state: ReturnType<typeof useTextMode>;
}

function TextModePanel({ state, isSubmitting }: TextModePanelProps2) {
  const {
    text,
    setText,
    images,
    mentionSuggestions,
    inputRef,
    charCount,
    handleSelectionChange,
    handleMentionSelect,
    handlePickImages,
    handleRemoveImage,
  } = state;

  return (
    <>
      <ScrollView
        style={shared.flex}
        contentContainerStyle={shared.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Styled overlay text (hashtag/mention coloring) */}
        <View style={textPanelSt.inputWrapper}>
          <TextInput
            ref={inputRef}
            style={textPanelSt.input}
            placeholder="What's on your mind? Use #hashtags and @mentions"
            placeholderTextColor={C.textMuted}
            multiline
            autoFocus
            value={text}
            onChangeText={setText}
            onSelectionChange={handleSelectionChange}
            maxLength={MAX_CHARS + 50}
            scrollEnabled={false}
            textAlignVertical="top"
            editable={!isSubmitting}
          />
          {/* Character count badge */}
          <View style={textPanelSt.charRow}>
            <Text style={textPanelSt.charCount}>
              {charCount}/{MAX_CHARS}
            </Text>
            <CharProgress count={charCount} max={MAX_CHARS} />
          </View>
        </View>

        <ImageGrid images={images} onRemove={handleRemoveImage} />
      </ScrollView>

      {/* Mention dropdown */}
      {mentionSuggestions.length > 0 && (
        <MentionDropdown
          suggestions={mentionSuggestions}
          onSelect={handleMentionSelect}
        />
      )}

      {/* Toolbar */}
      <View style={shared.toolbar}>
        <TouchableOpacity
          style={[
            shared.toolbarBtn,
            images.length >= MAX_IMAGES && shared.toolbarBtnDisabled,
          ]}
          onPress={handlePickImages}
          disabled={isSubmitting || images.length >= MAX_IMAGES}
          activeOpacity={0.7}
        >
          <Text style={shared.toolbarBtnIcon}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={shared.toolbarBtn}
          onPress={() => {
            setText((prev) => prev + '#');
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          disabled={isSubmitting}
          activeOpacity={0.7}
        >
          <Text style={shared.toolbarBtnIcon}>#</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={shared.toolbarBtn}
          onPress={() => {
            setText((prev) => prev + '@');
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          disabled={isSubmitting}
          activeOpacity={0.7}
        >
          <Text style={shared.toolbarBtnIcon}>@</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const textPanelSt = StyleSheet.create({
  inputWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  input: {
    color: C.text,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
    minHeight: 160,
    maxHeight: 8 * 24 + 14 * 2, // 8 lines * lineHeight + padding
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  charCount: {
    color: C.textMuted,
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// CodeSnippetPanel
// ---------------------------------------------------------------------------
interface CodeSnippetState {
  language: Language;
  setLanguage: (l: Language) => void;
  snippetTitle: string;
  setSnippetTitle: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  canPost: boolean;
}

function useCodeSnippet(isSubmitting: boolean): CodeSnippetState {
  const [language, setLanguage] = useState<Language>('TypeScript');
  const [snippetTitle, setSnippetTitle] = useState('');
  const [code, setCode] = useState('');
  const charCount = code.length;
  const isOverLimit = charCount > MAX_SNIPPET_CHARS;
  const canPost =
    snippetTitle.trim().length > 0 &&
    code.trim().length > 0 &&
    !isOverLimit &&
    !isSubmitting;
  return { language, setLanguage, snippetTitle, setSnippetTitle, code, setCode, canPost };
}

interface CodeSnippetPanelProps {
  state: CodeSnippetState;
  isSubmitting: boolean;
}

function CodeSnippetPanel({ state, isSubmitting }: CodeSnippetPanelProps) {
  const { language, setLanguage, snippetTitle, setSnippetTitle, code, setCode } =
    state;
  const [sheetVisible, setSheetVisible] = useState(false);
  const charCount = code.length;
  const isOverLimit = charCount > MAX_SNIPPET_CHARS;

  return (
    <>
      <LanguageBottomSheet
        visible={sheetVisible}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setSheetVisible(false)}
      />

      <ScrollView
        style={shared.flex}
        contentContainerStyle={shared.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Language selector button */}
        <TouchableOpacity
          style={codePanelSt.langBtn}
          onPress={() => setSheetVisible(true)}
          activeOpacity={0.8}
        >
          <View style={codePanelSt.langBtnLeft}>
            <Text style={codePanelSt.langBtnLabel}>Language</Text>
            <Text style={codePanelSt.langBtnValue}>{language}</Text>
          </View>
          <Text style={codePanelSt.langBtnChevron}>›</Text>
        </TouchableOpacity>

        {/* Snippet title */}
        <TextInput
          style={codePanelSt.titleInput}
          placeholder="Snippet title *"
          placeholderTextColor={C.textMuted}
          value={snippetTitle}
          onChangeText={setSnippetTitle}
          editable={!isSubmitting}
          maxLength={120}
          returnKeyType="next"
        />

        {/* Code input */}
        <View style={codePanelSt.codeContainer}>
          <View style={codePanelSt.codeHeader}>
            <Text style={codePanelSt.codeHeaderLang}>{language}</Text>
            <Text
              style={[
                codePanelSt.codeCharCount,
                isOverLimit && codePanelSt.codeCharCountOver,
              ]}
            >
              {charCount}/{MAX_SNIPPET_CHARS}
            </Text>
          </View>
          <TextInput
            style={codePanelSt.codeInput}
            placeholder={`// ${language} code here...`}
            placeholderTextColor={C.textMuted}
            multiline
            value={code}
            onChangeText={setCode}
            maxLength={MAX_SNIPPET_CHARS + 200}
            scrollEnabled={false}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            editable={!isSubmitting}
          />
        </View>
      </ScrollView>
    </>
  );
}

const codePanelSt = StyleSheet.create({
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  langBtnLeft: {
    gap: 2,
  },
  langBtnLabel: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  langBtnValue: {
    color: C.primaryLight,
    fontSize: 15,
    fontWeight: '700',
  },
  langBtnChevron: {
    color: C.textMuted,
    fontSize: 22,
    fontWeight: '300',
  },
  titleInput: {
    color: C.text,
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginTop: 14,
  },
  codeContainer: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: C.codeBg,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  codeHeaderLang: {
    color: C.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textTransform: 'lowercase',
  },
  codeCharCount: {
    color: C.textMuted,
    fontSize: 11,
  },
  codeCharCountOver: {
    color: C.error,
    fontWeight: '700',
  },
  codeInput: {
    minHeight: 220,
    color: C.text,
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },
});

// ---------------------------------------------------------------------------
// ShareRepoPanel
// ---------------------------------------------------------------------------
interface ShareRepoState {
  repoQuery: string;
  setRepoQuery: (v: string) => void;
  selectedRepo: Repository | null;
  setSelectedRepo: (r: Repository | null) => void;
  repoResults: Repository[];
  isSearching: boolean;
  canPost: boolean;
}

function useShareRepo(isSubmitting: boolean): ShareRepoState {
  const [repoQuery, setRepoQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [repoResults, setRepoResults] = useState<Repository[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (repoQuery.trim().length < 2) {
      setRepoResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchRepositories(repoQuery.trim());
      setRepoResults(results);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [repoQuery]);

  const canPost = selectedRepo !== null && !isSubmitting;

  return {
    repoQuery,
    setRepoQuery,
    selectedRepo,
    setSelectedRepo,
    repoResults,
    isSearching,
    canPost,
  };
}

interface ShareRepoPanelProps {
  state: ShareRepoState;
  isSubmitting: boolean;
}

function ShareRepoPanel({ state, isSubmitting }: ShareRepoPanelProps) {
  const {
    repoQuery,
    setRepoQuery,
    selectedRepo,
    setSelectedRepo,
    repoResults,
    isSearching,
  } = state;

  return (
    <ScrollView
      style={shared.flex}
      contentContainerStyle={shared.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Search input */}
      <View style={repoPanelSt.searchRow}>
        <Text style={repoPanelSt.searchIcon}>🔍</Text>
        <TextInput
          style={repoPanelSt.searchInput}
          placeholder="Search repositories…"
          placeholderTextColor={C.textMuted}
          value={repoQuery}
          onChangeText={(v) => {
            setRepoQuery(v);
            if (selectedRepo && v !== selectedRepo.fullName) {
              setSelectedRepo(null);
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          editable={!isSubmitting}
        />
        {isSearching && <ActivityIndicator size="small" color={C.primaryLight} />}
      </View>

      {/* Selected repo badge */}
      {selectedRepo ? (
        <View style={repoPanelSt.selectedBadge}>
          <Text style={repoPanelSt.selectedBadgeText} numberOfLines={1}>
            Selected: {selectedRepo.fullName}
          </Text>
          <TouchableOpacity onPress={() => setSelectedRepo(null)}>
            <Text style={repoPanelSt.selectedBadgeClear}>×</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Results */}
      {repoResults.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          selected={selectedRepo?.id === repo.id}
          onPress={() =>
            setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)
          }
        />
      ))}

      {repoResults.length === 0 &&
        repoQuery.trim().length >= 2 &&
        !isSearching && (
          <View style={repoPanelSt.emptyState}>
            <Text style={repoPanelSt.emptyText}>No repositories found</Text>
            <Text style={repoPanelSt.emptySubText}>
              Try a different search term
            </Text>
          </View>
        )}

      {repoQuery.trim().length < 2 && !selectedRepo && (
        <View style={repoPanelSt.hint}>
          <Text style={repoPanelSt.hintText}>
            Type at least 2 characters to search
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const repoPanelSt = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${C.primaryDark}66`,
    borderWidth: 1,
    borderColor: C.primary,
    gap: 8,
  },
  selectedBadgeText: {
    flex: 1,
    color: C.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedBadgeClear: {
    color: C.textMuted,
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubText: {
    color: C.textMuted,
    fontSize: 13,
  },
  hint: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  hintText: {
    color: C.textMuted,
    fontSize: 14,
  },
});

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const shared = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
    gap: 10,
  },
  toolbarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  toolbarBtnDisabled: {
    opacity: 0.4,
  },
  toolbarBtnIcon: {
    fontSize: 17,
    color: C.text,
  },
});

// ---------------------------------------------------------------------------
// CreatePostScreen — main screen
// ---------------------------------------------------------------------------
export default function CreatePostScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ContentTab>('Text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Author profile
  const [author, setAuthor] = useState<Pick<
    UserProfile,
    'username' | 'avatarUrl'
  > | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((profile) =>
        setAuthor({ username: profile.username, avatarUrl: profile.avatarUrl }),
      )
      .catch(() => {
        // Non-critical — author row degrades gracefully
      });
  }, []);

  // Per-tab state hooks
  const textState = useTextMode(isSubmitting);
  const codeState = useCodeSnippet(isSubmitting);
  const repoState = useShareRepo(isSubmitting);

  // Determine if Post button should be enabled
  const canPost =
    activeTab === 'Text'
      ? textState.canPost
      : activeTab === 'Code Snippet'
        ? codeState.canPost
        : repoState.canPost;

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting) return;
    setIsSubmitting(true);

    try {
      let body: CreatePostBody;

      if (activeTab === 'Text') {
        body = {
          content: textState.text.trim(),
          ...(textState.images.length > 0
            ? { mediaUrls: textState.images.map((img) => img.uri) }
            : {}),
        };
      } else if (activeTab === 'Code Snippet') {
        body = {
          content: codeState.snippetTitle.trim(),
          codeSnippet: {
            language: codeState.language,
            title: codeState.snippetTitle.trim(),
            code: codeState.code.trim(),
          },
        };
      } else {
        body = {
          content: repoState.selectedRepo?.fullName ?? '',
          repositoryId: repoState.selectedRepo?.id,
        };
      }

      const response = await submitPost(body);
      router.replace(`/post/${response.id}`);
    } catch (err: unknown) {
      Alert.alert('Failed to post', getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [canPost, isSubmitting, activeTab, textState, codeState, repoState, router]);

  return (
    <SafeAreaView style={screenSt.safeArea}>
      {/* Header */}
      <View style={screenSt.header}>
        <TouchableOpacity
          style={screenSt.headerCancelBtn}
          onPress={handleCancel}
          disabled={isSubmitting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={screenSt.headerCancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={screenSt.headerTitle}>Create Post</Text>

        <Pressable
          style={[
            screenSt.headerPostBtn,
            !canPost && screenSt.headerPostBtnDisabled,
          ]}
          onPress={handlePost}
          disabled={!canPost || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <Text
              style={[
                screenSt.headerPostText,
                !canPost && screenSt.headerPostTextDisabled,
              ]}
            >
              Post
            </Text>
          )}
        </Pressable>
      </View>

      {/* Author row */}
      {author ? (
        <AuthorRow
          avatarUrl={author.avatarUrl}
          username={author.username}
        />
      ) : null}

      {/* Content type tabs */}
      <ContentTabPills active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <KeyboardAvoidingView
        style={shared.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {activeTab === 'Text' && (
          <TextModePanel state={textState} isSubmitting={isSubmitting} />
        )}
        {activeTab === 'Code Snippet' && (
          <CodeSnippetPanel state={codeState} isSubmitting={isSubmitting} />
        )}
        {activeTab === 'Share Repo' && (
          <ShareRepoPanel state={repoState} isSubmitting={isSubmitting} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const screenSt = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  headerCancelBtn: {
    minWidth: 64,
  },
  headerCancelText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerPostBtn: {
    minWidth: 64,
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.primary,
    justifyContent: 'center',
  },
  headerPostBtnDisabled: {
    backgroundColor: C.disabled,
  },
  headerPostText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
  headerPostTextDisabled: {
    color: C.textMuted,
  },
});
