import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * /compose is a stable alias for the post composer used by the scheduled-posts
 * flow. It forwards the `schedule` query param so /compose?schedule=true opens
 * the composer in scheduling mode.
 */
export default function ComposeRedirect() {
  const { schedule } = useLocalSearchParams<{ schedule?: string }>();
  const href = schedule === 'true' ? '/(modals)/create-post?schedule=true' : '/(modals)/create-post';
  return <Redirect href={href as any} />;
}
