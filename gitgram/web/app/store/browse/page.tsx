'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { storeService } from '@/services/storeService'

function BrowseStoreContent() {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || ''
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItems()
  }, [category])

  const loadItems = async () => {
    try {
      const response = await storeService.getItems(1, 20, category || undefined)
      setItems(response.items || [])
    } catch (error) {
      console.error('Load items error:', error)
    } finally {
      setLoading(false)
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
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Browse Store</h1>
          <Link
            href="/store/filters"
            className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Filters
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/store/item/${item.id}`}
              className="bg-surface rounded-lg overflow-hidden hover:bg-surface/80"
            >
              {item.images && item.images.length > 0 && (
                <div className="relative aspect-video">
                  <Image
                    src={item.images[0]}
                    alt={item.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-lg font-bold text-accent">${item.price}</p>
              </div>
            </Link>
          ))}
        </div>

        {items.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No items found
          </div>
        )}
      </div>
    </div>
  )
}

export default function BrowseStorePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BrowseStoreContent />
    </Suspense>
  )
}
