'use client'

interface LoadLatestButtonProps {
  /** Number of fresh posts waiting to be loaded. */
  count: number
  /** Invoked when the user taps the pill: scroll to top + refetch first page. */
  onPress: () => void
}

/**
 * Floating "New posts" pill, ported from Bluesky's LoadLatestBtn to the
 * product's stack (Tailwind + CSS variables instead of react-native-reanimated).
 *
 * Surfaces content that arrived after the feed was rendered. The host feed is
 * responsible for detecting new posts (poll / realtime) and supplying `count`;
 * this component is purely presentational so it stays small and testable.
 */
export default function LoadLatestButton({ count, onPress }: LoadLatestButtonProps) {
  if (count <= 0) return null

  const label = count === 1 ? '1 new post' : `${count} new posts`

  return (
    <div className="sticky top-2 z-20 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onPress}
        aria-label={`Load ${label}`}
        className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-semibold shadow-lg hover:brightness-110 active:scale-95 transition focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        <span>{label}</span>
      </button>
    </div>
  )
}
