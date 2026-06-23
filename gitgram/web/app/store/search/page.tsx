'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { storeService } from '@/services/storeService'

function StoreSearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category') || ''
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query || category) {
      searchItems()
    }
  }, [query, category])

  const searchItems = async () => {
    setLoading(true)
    try {
      const response = await storeService.getItems(1, 20, category || undefined, query || undefined)
      setItems(response.items || [])
    } catch (error) {
      console.error('Search items error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Store</h1>
        {loading ? (
          <div className="text-center py-12 text-foreground/70">Loading...</div>
        ) : (
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
        )}
        {items.length === 0 && !loading && (query || category) && (
          <div className="text-center py-12 text-foreground/70">
            No items found
          </div>
        )}
      </div>
    </div>
  )
}

export default function StoreSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <StoreSearchContent />
    </Suspense>
  )
}
