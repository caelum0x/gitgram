import { differenceInSeconds } from 'date-fns';

/**
 * Relative-time ("time ago") helpers, ported from Bluesky's `useTimeAgo`
 * (src/lib/hooks/useTimeAgo.ts) and adapted to the product's plain-function /
 * no-i18n-framework conventions.
 *
 * The opinionated ruleset is preserved verbatim:
 * - All months are considered exactly 30 days.
 * - `earlier` is assumed to be <= `later`; otherwise the result is 'now'.
 * - Differences under the `NOW` threshold collapse to 'now'.
 * - All values round down (configurable to round up for future timestamps).
 * - Differences of >= 12 months fall back to a localized date string.
 *
 * Consolidating this here removes the per-screen drift from the ~15 inline
 * timestamp formatters scattered across the app (PostCard variants,
 * notifications, reading-list, scheduled posts, messages, story/archive, ...).
 */

export type DateInput = number | string | Date;

export type DateDiffFormat = 'long' | 'short';

export type DateDiffUnit = 'now' | 'second' | 'minute' | 'hour' | 'day' | 'month';

export interface DateDiff {
  value: number;
  unit: DateDiffUnit;
  earlier: Date;
  later: Date;
}

/** Below this many seconds the difference is reported as "now". */
const NOW = 5;
const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH_30 = DAY * 30;

/**
 * Returns the difference between `earlier` and `later`, based on the
 * opinionated rules described in the module header.
 */
export function dateDiff(
  earlier: DateInput,
  later: DateInput,
  rounding: 'up' | 'down' = 'down',
): DateDiff {
  const e = new Date(earlier);
  const l = new Date(later);
  const diffSeconds = differenceInSeconds(l, e);

  const round = (seconds: number, per: number): number =>
    rounding === 'up' ? Math.ceil(seconds / per) : Math.floor(seconds / per);

  let value = 0;
  let unit: DateDiffUnit = 'now';

  if (diffSeconds < NOW) {
    value = 0;
    unit = 'now';
  } else if (diffSeconds < MINUTE) {
    value = diffSeconds;
    unit = 'second';
  } else if (diffSeconds < HOUR) {
    value = round(diffSeconds, MINUTE);
    unit = 'minute';
  } else if (diffSeconds < DAY) {
    value = round(diffSeconds, HOUR);
    unit = 'hour';
  } else if (diffSeconds < MONTH_30) {
    value = round(diffSeconds, DAY);
    unit = 'day';
  } else {
    value = round(diffSeconds, MONTH_30);
    unit = 'month';
  }

  return { value, unit, earlier: e, later: l };
}

const NARROW_SUFFIX: Record<Exclude<DateDiffUnit, 'now' | 'month'>, string> = {
  second: 's',
  minute: 'm',
  hour: 'h',
  day: 'd',
};

const LONG_LABEL: Record<Exclude<DateDiffUnit, 'now' | 'month'>, string> = {
  second: 'second',
  minute: 'minute',
  hour: 'hour',
  day: 'day',
};

function pluralize(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

/**
 * Formats a `DateDiff` as a natural-language string.
 *
 * - `short` (default): narrow form, e.g. `5m`, `3h`, `2d`, `4mo`, `now`.
 * - `long`: spelled out, e.g. `5 minutes`, `1 hour`, `now`.
 * - Differences >= 12 months render as a localized date string.
 */
export function formatDateDiff(
  diff: DateDiff,
  format: DateDiffFormat = 'short',
): string {
  const long = format === 'long';

  switch (diff.unit) {
    case 'now':
      return 'now';
    case 'second':
    case 'minute':
    case 'hour':
    case 'day':
      return long
        ? pluralize(diff.value, LONG_LABEL[diff.unit])
        : `${diff.value}${NARROW_SUFFIX[diff.unit]}`;
    case 'month':
      if (diff.value < 12) {
        return long ? pluralize(diff.value, 'month') : `${diff.value}mo`;
      }
      return diff.earlier.toLocaleDateString();
  }
}

/**
 * Convenience helper: difference between `earlier` and now (or an explicit
 * `later`), formatted in one call. This is the function most screens want.
 *
 * @example timeAgo(post.createdAt)            // "5m"
 * @example timeAgo(post.createdAt, { format: 'long' })  // "5 minutes"
 */
export function timeAgo(
  earlier: DateInput,
  options?: { later?: DateInput; format?: DateDiffFormat },
): string {
  const later = options?.later ?? Date.now();
  return formatDateDiff(dateDiff(earlier, later, 'down'), options?.format);
}

/**
 * Variant for future timestamps (e.g. scheduled posts): rounds up and measures
 * from now to the (later) target.
 *
 * @example timeUntil(scheduledFor)  // "3d"
 */
export function timeUntil(
  later: DateInput,
  options?: { earlier?: DateInput; format?: DateDiffFormat },
): string {
  const earlier = options?.earlier ?? Date.now();
  return formatDateDiff(dateDiff(earlier, later, 'up'), options?.format);
}
