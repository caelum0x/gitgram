import React, { useCallback } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoryUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** True when the current user has already seen all stories from this user */
  hasSeen?: boolean;
}

interface StoriesRowProps {
  users: StoryUser[];
  /** Called when the current user taps "Your Story" (add-story flow) */
  onAddStory?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RING_SIZE = 68;
const AVATAR_SIZE = 56;
const ITEM_WIDTH = 78;

const Colors = {
  background: '#0F0F1A',
  border: '#2D2D50',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  white: '#FFFFFF',
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  surfaceElevated: '#232340',
  avatarBg: '#5B21B6',
  seenRing: '#2D2D50',
  addBtn: '#7C3AED',
} as const;

// Gradient ring color stops (rainbow-ish for unseen, shown as purple/indigo)
const GRADIENT_START = '#7C3AED';
const GRADIENT_END = '#4F46E5';

// ---------------------------------------------------------------------------
// GradientRing — SVG ring drawn around the avatar
// Unseen: purple-indigo gradient  |  Seen: flat gray
// ---------------------------------------------------------------------------

function GradientRing({
  size,
  seen,
  id,
}: {
  size: number;
  seen: boolean;
  id: string;
}): React.JSX.Element {
  const strokeWidth = 2.5;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const gradientId = `ring-${id}`;

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={GRADIENT_START} />
          <Stop offset="100%" stopColor={GRADIENT_END} />
        </LinearGradient>
      </Defs>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={seen ? Colors.seenRing : `url(#${gradientId})`}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Avatar component
// ---------------------------------------------------------------------------

function UserAvatar({
  uri,
  username,
  size,
}: {
  uri?: string | null;
  username: string;
  size: number;
}): React.JSX.Element {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  const initials = username.slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        avatarStyles.initials,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[avatarStyles.initialsText, { fontSize: size * 0.4 }]}>
        {initials}
      </Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  initials: {
    backgroundColor: Colors.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: Colors.white,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Story ring item
// ---------------------------------------------------------------------------

function StoryItem({ user }: { user: StoryUser }): React.JSX.Element {
  const handlePress = useCallback(() => {
    router.push({ pathname: '/stories', params: { userId: user.id } });
  }, [user.id]);

  return (
    <Pressable style={itemStyles.container} onPress={handlePress} accessibilityLabel={`View ${user.displayName ?? user.username}'s story`}>
      <View style={itemStyles.ringWrapper}>
        <GradientRing
          size={RING_SIZE}
          seen={user.hasSeen === true}
          id={user.id}
        />
        <View style={itemStyles.avatarWrapper}>
          <UserAvatar
            uri={user.avatarUrl}
            username={user.username}
            size={AVATAR_SIZE}
          />
        </View>
      </View>
      <Text style={itemStyles.username} numberOfLines={1}>
        {user.displayName ?? user.username}
      </Text>
    </Pressable>
  );
}

const itemStyles = StyleSheet.create({
  container: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
  username: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
    width: ITEM_WIDTH - 4,
  },
});

// ---------------------------------------------------------------------------
// "Your Story" add button (first item)
// ---------------------------------------------------------------------------

function AddStoryItem({ onPress }: { onPress?: () => void }): React.JSX.Element {
  return (
    <Pressable
      style={addStyles.container}
      onPress={onPress}
      accessibilityLabel="Add your story"
    >
      <View style={addStyles.ringWrapper}>
        {/* Static border for own story slot */}
        <View style={addStyles.ring} />
        <View style={addStyles.avatarWrapper}>
          <View style={addStyles.plusCircle}>
            <Text style={addStyles.plusIcon}>+</Text>
          </View>
        </View>
      </View>
      <Text style={addStyles.label} numberOfLines={1}>
        Your Story
      </Text>
    </Pressable>
  );
}

const addStyles = StyleSheet.create({
  container: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.addBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIcon: {
    color: Colors.white,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: -1,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
    width: ITEM_WIDTH - 4,
  },
});

// ---------------------------------------------------------------------------
// StoriesRow — exported component
// ---------------------------------------------------------------------------

type ListItem = { type: 'add' } | { type: 'user'; user: StoryUser };

export default function StoriesRow({
  users,
  onAddStory,
}: StoriesRowProps): React.JSX.Element | null {
  if (users.length === 0) return null;

  const data: ListItem[] = [
    { type: 'add' },
    ...users.map((u): ListItem => ({ type: 'user', user: u })),
  ];

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'add') {
        return <AddStoryItem onPress={onAddStory} />;
      }
      return <StoryItem user={item.user} />;
    },
    [onAddStory],
  );

  const keyExtractor = useCallback(
    (item: ListItem) => (item.type === 'add' ? '__add__' : item.user.id),
    [],
  );

  return (
    <View style={rowStyles.container}>
      <FlatList<ListItem>
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rowStyles.listContent}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 12,
  },
  listContent: {
    paddingHorizontal: 8,
  },
});
