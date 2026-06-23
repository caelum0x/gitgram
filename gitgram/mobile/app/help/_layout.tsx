import { Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';

export default function HelpLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="account" />
      <Stack.Screen name="posting" />
      <Stack.Screen name="following" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="security" />
      <Stack.Screen name="faq" />
    </Stack>
  );
}
