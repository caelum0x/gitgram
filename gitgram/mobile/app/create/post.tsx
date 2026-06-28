import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Consolidated: the post composer lives in a single place at
 * /(modals)/create-post. This route is kept as a stable alias and forwards any
 * `mode` query param (e.g. mode=repo) so older links keep working.
 */
export default function CreatePostRedirect() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const href = mode ? `/(modals)/create-post?mode=${mode}` : '/(modals)/create-post';
  return <Redirect href={href as any} />;
}
