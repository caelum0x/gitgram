import { Stack } from 'expo-router';

export default function ModalsLayout() {
  return (
    <Stack screenOptions={{ presentation: 'modal', headerShown: false }}>
      <Stack.Screen name="create-post" />
      <Stack.Screen name="create-reel" />
      <Stack.Screen name="create-story" />
    </Stack>
  );
}

