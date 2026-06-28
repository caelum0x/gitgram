import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * /user/[userId] is an alias for the canonical public profile screen at
 * /profile/[userId]. Keeping the alias means deep links and follow-request
 * navigation that use the /user/* namespace resolve to a real screen instead of
 * dead-ending, while the profile UI lives in one place.
 */
export default function UserProfileAlias() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <Redirect href={`/profile/${userId}` as any} />;
}
