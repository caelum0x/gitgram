'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchFiltersPage() {
  const router = useRouter()
  const [filters, setFilters] = useState({
    type: 'all',
    dateRange: 'all',
    sortBy: 'relevance',
  })

  const handleApply = () => {
    const params = new URLSearchParams()
    if (filters.type !== 'all') params.set('type', filters.type)
    if (filters.dateRange !== 'all') params.set('dateRange', filters.dateRange)
    if (filters.sortBy !== 'relevance') params.set('sortBy', filters.sortBy)
    
    router.push(`/search/posts?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Filters</h1>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Content Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="all">All</option>
              <option value="posts">Posts</option>
              <option value="reels">Reels</option>
              <option value="users">Users</option>
              <option value="projects">Projects</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Date Range
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Sort By
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleApply}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
            >
              Apply Filters
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

