'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react'

// ---------------------------------------------------------------------------
// Emoji data
// ---------------------------------------------------------------------------

interface EmojiCategory {
  label: string
  icon: string
  emojis: string[]
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
      '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫',
      '🤔', '🫠', '🤐', '🤨', '😐', '😑', '😶', '🫥',
      '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪',
      '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤧', '🥵',
      '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
    ],
  },
  {
    label: 'People',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐', '✋', '🖖', '🫱', '🫲', '🫳',
      '🫴', '👌', '🤌', '🤏', '✌', '🤞', '🫰', '🤟',
      '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝',
      '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
      '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍', '💅',
      '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻',
      '👃', '🫀', '🫁', '🧠', '🦷', '🦴', '👀', '👅',
      '💋', '🧑', '👦', '👧', '👩', '👨', '🧔', '👱',
    ],
  },
  {
    label: 'Nature',
    icon: '🌿',
    emojis: [
      '🌿', '🌱', '🌲', '🌳', '🌴', '🌵', '🎄', '🎋',
      '🍀', '🍁', '🍂', '🍃', '🪴', '🌾', '🌺', '🌸',
      '🌼', '🌻', '🌹', '🌷', '🪷', '💐', '🍄', '🐚',
      '🪸', '🌊', '🔥', '🌈', '⛅', '🌤', '⛈', '🌩',
      '🌧', '🌨', '🌬', '🌀', '🌫', '🌦', '🌥', '☁',
      '🌑', '🌒', '🌓', '🌔', '🌕', '🌙', '⭐', '🌟',
      '✨', '⚡', '🌍', '🌎', '🌏', '🪐', '🌠', '☄',
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
    ],
  },
  {
    label: 'Food',
    icon: '🍕',
    emojis: [
      '🍕', '🍔', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳',
      '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🍱',
      '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢',
      '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡',
      '🦀', '🦞', '🦐', '🦑', '🍦', '🍧', '🍨', '🍩',
      '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭',
      '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂',
      '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🥄', '🍴',
    ],
  },
  {
    label: 'Travel',
    icon: '✈️',
    emojis: [
      '✈', '🚀', '🛸', '🚁', '🛺', '🚗', '🚕', '🚙',
      '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻',
      '🚚', '🚛', '🚜', '🏍', '🛵', '🛴', '🚲', '🛹',
      '🛼', '🚨', '🚥', '🛤', '⛽', '🚢', '⛴', '🛥',
      '🚤', '⛵', '🚣', '🛶', '🏖', '🏝', '🏜', '🏔',
      '⛰', '🌋', '🗻', '🏕', '🏠', '🏡', '🏢', '🏣',
      '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬',
      '🏭', '🏛', '🏟', '⛪', '🕌', '🕍', '🗼', '🗽',
    ],
  },
  {
    label: 'Objects',
    icon: '💡',
    emojis: [
      '💡', '🔦', '🕯', '🪔', '🔋', '🔌', '💻', '🖥',
      '🖨', '⌨', '🖱', '🖲', '📱', '📲', '☎', '📞',
      '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '🧭',
      '⏱', '⏲', '⏰', '🕰', '📡', '🔭', '🔬', '🧪',
      '🧫', '🧬', '🩺', '🩻', '💊', '🩹', '🩼', '🩸',
      '🔧', '🪛', '🔨', '🪚', '⚒', '🛠', '🗡', '⚔',
      '🛡', '🔑', '🗝', '🔒', '🔓', '🚪', '🪞', '🪟',
      '📦', '📫', '📬', '📭', '📮', '🗳', '✏', '🖊',
    ],
  },
]

const FREQUENT_KEY = 'gitgram:emoji:frequent'
const MAX_FREQUENT = 8

function loadFrequent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(FREQUENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveFrequent(emoji: string, current: string[]): string[] {
  const filtered = current.filter((e) => e !== emoji)
  const updated = [emoji, ...filtered].slice(0, MAX_FREQUENT)
  try {
    localStorage.setItem(FREQUENT_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors
  }
  return updated
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(0)
  const [search, setSearch] = useState('')
  const [frequent, setFrequent] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load frequent emojis on open
  useEffect(() => {
    if (open) {
      setFrequent(loadFrequent())
      // Focus the search input after the popover opens
      requestAnimationFrame(() => searchRef.current?.focus())
    } else {
      setSearch('')
      setActiveCategory(0)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const handleSelect = useCallback(
    (emoji: string) => {
      setFrequent((prev) => saveFrequent(emoji, prev))
      onSelect(emoji)
      setOpen(false)
    },
    [onSelect]
  )

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }

  // Filtered emojis when searching
  const searchResults: string[] = search.trim()
    ? EMOJI_CATEGORIES.flatMap((cat) =>
        cat.emojis.filter((emoji) =>
          cat.label.toLowerCase().includes(search.toLowerCase()) || emoji.includes(search)
        )
      ).slice(0, 40)
    : []

  const activeEmojis = search.trim()
    ? searchResults
    : EMOJI_CATEGORIES[activeCategory]?.emojis ?? []

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-xl p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Open emoji picker"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        😊
      </button>

      {/* Popover */}
      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className="absolute bottom-full mb-2 right-0 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-50 flex flex-col"
        >
          {/* Search */}
          <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search emojis..."
              className="w-full px-3 py-1.5 text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Frequently used */}
          {!search.trim() && frequent.length > 0 && (
            <div className="px-2 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1 px-1">
                Frequently used
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {frequent.map((emoji) => (
                  <button
                    key={`freq-${emoji}`}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="text-xl p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category tabs — hidden when searching */}
          {!search.trim() && (
            <div className="flex gap-0.5 px-2 py-1 border-b border-neutral-100 dark:border-neutral-800 overflow-x-auto scrollbar-none">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setActiveCategory(i)}
                  title={cat.label}
                  className={`flex-shrink-0 text-base p-1.5 rounded-lg transition-colors ${
                    activeCategory === i
                      ? 'bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-400'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                  aria-label={cat.label}
                  aria-pressed={activeCategory === i}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="overflow-y-auto" style={{ maxHeight: '192px' }}>
            {activeEmojis.length === 0 ? (
              <p className="text-center text-sm text-neutral-400 dark:text-neutral-500 py-6">
                No emojis found
              </p>
            ) : (
              <div className="grid grid-cols-8 gap-0.5 p-2">
                {activeEmojis.map((emoji, idx) => (
                  <button
                    key={`${emoji}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="text-xl p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category label footer */}
          {!search.trim() && (
            <div className="px-3 py-1.5 border-t border-neutral-100 dark:border-neutral-800">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {EMOJI_CATEGORIES[activeCategory]?.label}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
