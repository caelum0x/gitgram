import React from 'react';
import { Redirect } from 'expo-router';

// Canonical reel creation lives at app/create/reel.tsx (full editor with
// trim/effects/music). This legacy path forwards there so any external deep
// link to /reels/create still reaches the real reel composer.
export default function CreateReelRedirect() {
  return <Redirect href="/create/reel" />;
}
