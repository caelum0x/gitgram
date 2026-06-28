/**
 * selfLabels.ts
 *
 * Author self-labeling / content warnings.
 *
 * Ported from Bluesky's moderation model (src/lib/moderation.ts: SELF_LABELS,
 * ADULT_CONTENT_LABELS, OTHER_SELF_LABELS and the hide-vs-warn behavior). An
 * AUTHOR voluntarily marks their own post as sensitive; each label maps to a
 * `hide` or `warn` behavior the feed pipeline applies before rendering.
 *
 * This complements (does not replace) the platform-driven auto-moderation
 * (nsfwDetectionService etc.) — it is a low-friction, trust-building signal the
 * author opts into.
 *
 * All exports are pure data + pure functions; no I/O, no mutation.
 */

/** Adult-content self labels. These HIDE the post by default. */
export const ADULT_CONTENT_LABELS = ['sexual', 'nudity', 'porn'] as const;

/** Non-adult self labels. These WARN (blur) by default. */
export const OTHER_SELF_LABELS = ['graphic-media', 'spoiler'] as const;

/** Every recognised self label. */
export const SELF_LABELS = [...ADULT_CONTENT_LABELS, ...OTHER_SELF_LABELS] as const;

export type AdultSelfLabel = (typeof ADULT_CONTENT_LABELS)[number];
export type OtherSelfLabel = (typeof OTHER_SELF_LABELS)[number];
export type SelfLabel = (typeof SELF_LABELS)[number];

/** Behavior the feed pipeline applies for a labeled post. */
export type LabelBehavior = 'hide' | 'warn';

const ADULT_SET: ReadonlySet<string> = new Set(ADULT_CONTENT_LABELS);
const SELF_LABEL_SET: ReadonlySet<string> = new Set(SELF_LABELS);

/** Type guard: is this string a recognised self label? */
export function isSelfLabel(value: string): value is SelfLabel {
  return SELF_LABEL_SET.has(value);
}

/**
 * Validate and normalise an arbitrary input into a deduped list of recognised
 * self labels. Unknown entries are dropped silently. Returns a new array.
 */
export function normalizeSelfLabels(input: unknown): SelfLabel[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];

  const seen = new Set<SelfLabel>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const candidate = entry.trim().toLowerCase();
    if (isSelfLabel(candidate)) seen.add(candidate);
  }
  return [...seen];
}

/**
 * The strongest behavior implied by a set of labels.
 *  - any adult label -> 'hide'
 *  - any other self label -> 'warn'
 *  - no labels -> null (no behavior)
 */
export function behaviorForLabels(labels: ReadonlyArray<string>): LabelBehavior | null {
  let hasWarn = false;
  for (const label of labels) {
    if (ADULT_SET.has(label)) return 'hide';
    if (SELF_LABEL_SET.has(label)) hasWarn = true;
  }
  return hasWarn ? 'warn' : null;
}

/** A post viewed through the self-label lens. */
export interface SelfLabeledPost {
  selfLabels?: string[] | null;
  contentWarning?: string | null;
}

/** Moderation decision attached to a feed item for the client to honour. */
export interface SelfLabelDecision {
  /** Behavior to apply; null when the post carries no self labels. */
  behavior: LabelBehavior | null;
  /** Recognised labels present on the post. */
  labels: SelfLabel[];
  /** Optional author-supplied warning text. */
  contentWarning: string | null;
}

/**
 * Compute the moderation decision for a post from its self labels.
 *
 * Hide vs warn semantics mirror Bluesky: `hide` means the post is collapsed out
 * of the feed unless the viewer has explicitly opted into adult content; `warn`
 * means the post stays in the feed but the client should blur it behind the
 * warning until tapped.
 */
export function decideSelfLabel(post: SelfLabeledPost): SelfLabelDecision {
  const labels = normalizeSelfLabels(post.selfLabels);
  return {
    behavior: behaviorForLabels(labels),
    labels,
    contentWarning:
      typeof post.contentWarning === 'string' && post.contentWarning.trim().length > 0
        ? post.contentWarning.trim()
        : null,
  };
}
