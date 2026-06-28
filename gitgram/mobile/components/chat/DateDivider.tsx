import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isSameDay, subDays } from 'date-fns';

import { Colors } from '../../constants/Colors';

/**
 * Day separator for the conversation timeline, ported from Bluesky's
 * `src/components/dms/DateDivider.tsx`.
 *
 * Bluesky's original leans on `i18n.date` (Lingui) and ALF atoms; this product
 * uses neither, so the date logic is reimplemented with `date-fns` plus
 * `Intl.DateTimeFormat` (already available in the Hermes/RN runtime) and the
 * GitHub `Colors` palette. The opinionated ruleset is preserved verbatim:
 *
 * - Same calendar day  -> "Today"
 * - Previous day       -> "Yesterday"
 * - Within a week      -> weekday only ("Monday")
 * - Older, same year   -> "Mon, January 5"
 * - Older, prior year  -> "Mon, January 5, 2024"
 *
 * The time of the first message of the day is appended ("Today at 2:14 PM") so
 * the divider doubles as the per-day timestamp anchor in the inverted list.
 */
interface DateDividerProps {
  /** ISO 8601 timestamp (or anything `new Date()` accepts) for the day. */
  date: string;
}

function formatTime(timestamp: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function formatDate(timestamp: Date): string {
  const today = new Date();
  const yesterday = subDays(today, 1);
  const oneWeekAgo = subDays(today, 7);

  if (isSameDay(today, timestamp)) {
    return 'Today';
  }
  if (isSameDay(yesterday, timestamp)) {
    return 'Yesterday';
  }

  if (timestamp < oneWeekAgo) {
    const sameYear = timestamp.getFullYear() === today.getFullYear();
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(timestamp);
  }

  return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
    timestamp,
  );
}

function DateDividerComponent({ date }: DateDividerProps) {
  const timestamp = new Date(date);

  // Guard against malformed timestamps so a single bad message can never crash
  // the whole conversation list.
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {formatDate(timestamp)} at {formatTime(timestamp)}
      </Text>
    </View>
  );
}

export const DateDivider = memo(DateDividerComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 12,
    textAlign: 'center',
    color: Colors.textSecondary,
  },
});

export default DateDivider;
