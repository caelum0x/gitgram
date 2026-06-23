'use client'

import { useState, useEffect } from 'react'
import api from '@/services/api'

interface SchedulePickerProps {
  initialDate: Date | null
  onSchedule: (date: Date | null) => void
  onClose: () => void
}

interface OptimalTime {
  hour: number
  day: string
  score: number
}

export default function SchedulePicker({
  initialDate,
  onSchedule,
  onClose,
}: SchedulePickerProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate
      ? initialDate.toISOString().slice(0, 10)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  )
  const [selectedTime, setSelectedTime] = useState<string>(
    initialDate
      ? initialDate.toTimeString().slice(0, 5)
      : '09:00'
  )
  const [optimalTimes, setOptimalTimes] = useState<OptimalTime[]>([])
  const [loadingOptimal, setLoadingOptimal] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadOptimalTimes()
  }, [])

  const loadOptimalTimes = async () => {
    setLoadingOptimal(true)
    try {
      const { data } = await api.get('/v1/posts/optimal-times')
      setOptimalTimes(data.optimalTimes || data || [])
    } catch {
      // Non-critical, ignore
    } finally {
      setLoadingOptimal(false)
    }
  }

  const handleConfirm = () => {
    const dateStr = `${selectedDate}T${selectedTime}:00`
    const date = new Date(dateStr)

    if (date <= new Date()) {
      setError('Please select a time in the future')
      return
    }

    onSchedule(date)
  }

  const handleRemoveSchedule = () => {
    onSchedule(null)
  }

  const handleOptimalTimeSelect = (time: OptimalTime) => {
    // Find the next occurrence of that day at that hour
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    }

    const targetDay = dayMap[time.day.toLowerCase()] ?? 0
    const now = new Date()
    const currentDay = now.getDay()
    let daysUntil = targetDay - currentDay
    if (daysUntil <= 0) daysUntil += 7

    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + daysUntil)

    setSelectedDate(targetDate.toISOString().slice(0, 10))
    setSelectedTime(`${time.hour.toString().padStart(2, '0')}:00`)
  }

  // Get minimum date (tomorrow)
  const minDate = new Date()
  minDate.setDate(minDate.getDate())
  const minDateStr = minDate.toISOString().slice(0, 10)

  // Quick schedule presets
  const quickPresets = [
    { label: 'In 1 hour', getDate: () => new Date(Date.now() + 3600000) },
    { label: 'In 3 hours', getDate: () => new Date(Date.now() + 3 * 3600000) },
    { label: 'Tomorrow 9 AM', getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return d
    }},
    { label: 'Tomorrow 12 PM', getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(12, 0, 0, 0)
      return d
    }},
    { label: 'Tomorrow 6 PM', getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(18, 0, 0, 0)
      return d
    }},
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">Schedule Post</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Quick Presets */}
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-2">
              Quick Schedule
            </label>
            <div className="flex flex-wrap gap-2">
              {quickPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    const d = preset.getDate()
                    setSelectedDate(d.toISOString().slice(0, 10))
                    setSelectedTime(d.toTimeString().slice(0, 5))
                  }}
                  className="px-3 py-1.5 text-xs bg-surface-secondary border border-border rounded-lg text-foreground-secondary hover:text-foreground hover:border-primary transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value)
                  setError('')
                }}
                min={minDateStr}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1">
                Time
              </label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => {
                  setSelectedTime(e.target.value)
                  setError('')
                }}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          {/* Optimal Times */}
          {optimalTimes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-2">
                Best Times to Post (based on your audience)
              </label>
              <div className="flex flex-wrap gap-2">
                {optimalTimes.slice(0, 5).map((time, i) => (
                  <button
                    key={i}
                    onClick={() => handleOptimalTimeSelect(time)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/5 border border-primary/20 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    {time.day} {time.hour}:00
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingOptimal && (
            <p className="text-xs text-foreground-secondary">Loading optimal times...</p>
          )}

          {/* Preview */}
          <div className="p-3 bg-surface-secondary rounded-lg">
            <p className="text-sm text-foreground">
              This post will be published on{' '}
              <span className="font-semibold">
                {new Date(`${selectedDate}T${selectedTime}:00`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {' '}at{' '}
              <span className="font-semibold">
                {new Date(`${selectedDate}T${selectedTime}:00`).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-error">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          {initialDate && (
            <button
              onClick={handleRemoveSchedule}
              className="px-4 py-2 text-sm text-error hover:bg-error/10 border border-error/30 rounded-lg transition-colors"
            >
              Remove Schedule
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground border border-border rounded-lg hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
          >
            Set Schedule
          </button>
        </div>
      </div>
    </div>
  )
}
