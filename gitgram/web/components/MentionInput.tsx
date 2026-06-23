'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import api from '@/services/api'

interface User {
  id: string
  username: string
  avatar?: string
}

interface Hashtag {
  name: string
  count?: number
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  maxLength?: number
  rows?: number
  onSubmit?: () => void
}

export default function MentionInput({
  value,
  onChange,
  placeholder = "What's happening?",
  className = '',
  maxLength,
  rows = 3,
  onSubmit,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionType, setSuggestionType] = useState<'mention' | 'hashtag' | null>(null)
  const [suggestions, setSuggestions] = useState<(User | Hashtag)[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [triggerPosition, setTriggerPosition] = useState({ start: 0, end: 0 })
  const [loading, setLoading] = useState(false)

  // Detect @ or # trigger
  const detectTrigger = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)

    // Find the last @ or # before cursor
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)
    const hashtagMatch = textBeforeCursor.match(/#(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1]
      setSearchQuery(query)
      setSuggestionType('mention')
      setTriggerPosition({
        start: cursorPos - query.length - 1,
        end: cursorPos,
      })
      setShowSuggestions(true)
      searchUsers(query)
    } else if (hashtagMatch) {
      const query = hashtagMatch[1]
      setSearchQuery(query)
      setSuggestionType('hashtag')
      setTriggerPosition({
        start: cursorPos - query.length - 1,
        end: cursorPos,
      })
      setShowSuggestions(true)
      searchHashtags(query)
    } else {
      setShowSuggestions(false)
      setSuggestions([])
    }
  }, [value])

  // Debounce timer ref — prevents firing API calls on every keystroke
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const DEBOUNCE_MS = 250

  /**
   * Debounced wrapper: cancels any pending call and schedules a new one.
   * Adapted from munia's search-for-mention pattern with a debounce guard.
   */
  const debouncedSearch = useCallback(
    (fn: (q: string) => Promise<void>, query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        fn(query)
      }, DEBOUNCE_MS)
    },
    []
  )

  // Clean up the timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  // Search users for @mentions
  const searchUsersImpl = async (query: string) => {
    if (query.length < 1) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const { data } = await api.get('/search/users', { params: { q: query, limit: 5 } })
      setSuggestions(data.users || data || [])
      setSelectedIndex(0)
    } catch (error) {
      console.error('Search users error:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const searchUsers = (query: string) => debouncedSearch(searchUsersImpl, query)

  // Search hashtags for #tags
  const searchHashtagsImpl = async (query: string) => {
    if (query.length < 1) {
      // Show popular hashtags
      try {
        const { data } = await api.get('/tags/trending', { params: { limit: 5 } })
        setSuggestions(data.hashtags || data || [])
      } catch {
        setSuggestions([])
      }
      return
    }

    setLoading(true)
    try {
      const { data } = await api.get('/tags/search', { params: { q: query, limit: 5 } })
      setSuggestions(data.hashtags || data || [])
      setSelectedIndex(0)
    } catch (error) {
      console.error('Search hashtags error:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const searchHashtags = (query: string) => debouncedSearch(searchHashtagsImpl, query)

  // Insert selected suggestion
  const insertSuggestion = useCallback((suggestion: User | Hashtag) => {
    const prefix = suggestionType === 'mention' ? '@' : '#'
    const insertText = suggestionType === 'mention'
      ? (suggestion as User).username
      : (suggestion as Hashtag).name

    const newValue =
      value.substring(0, triggerPosition.start) +
      prefix + insertText + ' ' +
      value.substring(triggerPosition.end)

    onChange(newValue)
    setShowSuggestions(false)
    setSuggestions([])

    // Focus and move cursor
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = triggerPosition.start + prefix.length + insertText.length + 1
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [value, onChange, triggerPosition, suggestionType])

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % suggestions.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
          break
        case 'Enter':
          if (showSuggestions) {
            e.preventDefault()
            insertSuggestion(suggestions[selectedIndex])
          }
          break
        case 'Escape':
          setShowSuggestions(false)
          break
        case 'Tab':
          if (showSuggestions) {
            e.preventDefault()
            insertSuggestion(suggestions[selectedIndex])
          }
          break
      }
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  // Detect trigger on input change
  useEffect(() => {
    detectTrigger()
  }, [value, detectTrigger])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className={`w-full px-4 py-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
      />

      {/* Character count */}
      {maxLength && (
        <div className={`absolute bottom-2 right-2 text-xs ${
          value.length > maxLength * 0.9 ? 'text-warning' : 'text-muted'
        } ${value.length >= maxLength ? 'text-error' : ''}`}>
          {value.length}/{maxLength}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {loading ? (
            <div className="p-3 text-center text-muted text-sm">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-3 text-center text-muted text-sm">
              No {suggestionType === 'mention' ? 'users' : 'tags'} found
            </div>
          ) : (
            <ul>
              {suggestions.map((suggestion, index) => (
                <li
                  key={
                    suggestionType === 'mention'
                      ? (suggestion as User).id
                      : (suggestion as Hashtag).name
                  }
                  onClick={() => insertSuggestion(suggestion)}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    index === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  {suggestionType === 'mention' ? (
                    <>
                      {(suggestion as User).avatar ? (
                        <img
                          src={(suggestion as User).avatar}
                          alt={(suggestion as User).username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary text-sm font-semibold">
                            {(suggestion as User).username[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="font-medium">@{(suggestion as User).username}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-muted-foreground text-lg">#</span>
                      </div>
                      <div>
                        <span className="font-medium">#{(suggestion as Hashtag).name}</span>
                        {(suggestion as Hashtag).count !== undefined && (
                          <span className="text-muted text-xs ml-2">
                            {(suggestion as Hashtag).count} posts
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
