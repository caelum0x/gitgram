'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { reelService } from '@/services/reelService'

interface MusicTrack {
  id: string
  title: string
  artist: string
  duration: number
  previewUrl?: string | null
  artworkUrl?: string | null
}

interface ReelMusic {
  id: string
  title: string
  artist: string
  previewUrl?: string | null
  artworkUrl?: string | null
  startTime?: number
}

export default function ReelMusicPage() {
  const params = useParams()
  const reelId = params.id as string
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [selectedGenre, setSelectedGenre] = useState('trending')
  const [query, setQuery] = useState('')
  const [currentMusic, setCurrentMusic] = useState<ReelMusic | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadPage()
  }, [reelId])

  const loadPage = async () => {
    setLoading(true)
    setError(null)

    try {
      const [reelResponse, genresResponse, trendingResponse] = await Promise.all([
        reelService.getReel(reelId),
        reelService.getGenres(),
        reelService.getTrendingMusic(20),
      ])

      const reel = reelResponse.reel || reelResponse
      setCurrentMusic(reel.music ?? null)
      setGenres(Array.isArray(genresResponse.genres) ? genresResponse.genres : [])
      setTracks(Array.isArray(trendingResponse.tracks) ? trendingResponse.tracks : [])
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to load music for this reel.')
    } finally {
      setLoading(false)
    }
  }

  const loadTracks = async (nextQuery: string, nextGenre: string) => {
    setSearching(true)
    setError(null)

    try {
      const normalizedQuery = nextQuery.trim()

      if (nextGenre === 'trending' || (!normalizedQuery && nextGenre === 'all')) {
        const response = await reelService.getTrendingMusic(20)
        setTracks(response.tracks || [])
        return
      }

      const searchQuery = nextGenre === 'all'
        ? normalizedQuery
        : [normalizedQuery, nextGenre].filter(Boolean).join(' ')

      const response = await reelService.searchMusic(searchQuery, 20)
      setTracks(response.tracks || [])
    } catch (err: any) {
      setTracks([])
      setError(err?.response?.data?.message || 'Unable to load music tracks right now.')
    } finally {
      setSearching(false)
    }
  }

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    await loadTracks(query, selectedGenre)
  }

  const handleGenreSelect = async (genre: string) => {
    setSelectedGenre(genre)
    await loadTracks(query, genre)
  }

  const handleApply = async (track: MusicTrack) => {
    setSavingTrackId(track.id)
    setError(null)

    try {
      const response = await reelService.applyMusicToReel(reelId, track.id, 0)
      setCurrentMusic(response.reel?.music ?? null)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to save this track to the reel.')
    } finally {
      setSavingTrackId(null)
    }
  }

  const handleRemove = async () => {
    setSavingTrackId('remove')
    setError(null)

    try {
      const response = await reelService.removeMusicFromReel(reelId)
      setCurrentMusic(response.reel?.music ?? null)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to remove music from this reel.')
    } finally {
      setSavingTrackId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reel Music</h1>
          <p className="text-sm text-foreground/70 mt-1">
            Search the live music catalog and attach one track to this reel.
          </p>
        </div>

        {currentMusic ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/60">Current Track</p>
                <h2 className="text-lg font-semibold text-foreground mt-1">{currentMusic.title}</h2>
                <p className="text-sm text-foreground/70">{currentMusic.artist}</p>
              </div>
              <button
                onClick={handleRemove}
                disabled={savingTrackId === 'remove'}
                className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-surface/80 disabled:opacity-50"
              >
                {savingTrackId === 'remove' ? 'Removing...' : 'Remove'}
              </button>
            </div>
            {currentMusic.previewUrl && (
              <audio controls src={currentMusic.previewUrl} className="mt-4 w-full" />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-sm text-foreground/70">
            No music attached to this reel yet.
          </div>
        )}

        <form onSubmit={handleSearch} className="rounded-xl border border-border bg-surface p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracks or artists..."
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleGenreSelect('trending')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                selectedGenre === 'trending'
                  ? 'bg-accent text-white'
                  : 'bg-background text-foreground/70 border border-border'
              }`}
            >
              Trending
            </button>
            <button
              type="button"
              onClick={() => void handleGenreSelect('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                selectedGenre === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-background text-foreground/70 border border-border'
              }`}
            >
              All
            </button>
            {genres.slice(0, 10).map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => void handleGenreSelect(genre)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  selectedGenre === genre
                    ? 'bg-accent text-white'
                    : 'bg-background text-foreground/70 border border-border'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {tracks.map((track) => {
            const isCurrent = currentMusic?.id === track.id
            const isSaving = savingTrackId === track.id

            return (
              <div
                key={track.id}
                className={`rounded-xl border p-4 ${
                  isCurrent ? 'border-accent bg-accent/10' : 'border-border bg-surface'
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">{track.title}</h2>
                    <p className="text-sm text-foreground/70">{track.artist}</p>
                    <p className="text-xs text-foreground/50 mt-1">
                      {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                    </p>
                  </div>

                  <button
                    onClick={() => void handleApply(track)}
                    disabled={isCurrent || isSaving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isCurrent ? 'Attached' : isSaving ? 'Saving...' : 'Attach'}
                  </button>
                </div>

                {track.previewUrl && (
                  <audio controls src={track.previewUrl} className="mt-4 w-full" />
                )}
              </div>
            )
          })}
        </div>

        {!searching && tracks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/70">
            No tracks matched this search.
          </div>
        )}
      </div>
    </div>
  )
}
