'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { storeService } from '@/services/storeService'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'

export default function StoreItemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const itemId = params.id as string
  const { user } = useAuthStore()
  const { showToast } = useToast()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  useEffect(() => {
    loadItem()
  }, [itemId])

  const loadItem = async () => {
    try {
      const response = await storeService.getItem(itemId)
      setItem(response.item || response)
    } catch (error) {
      console.error('Load item error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    if (!confirm(`Purchase "${item.title}" for $${item.price}?`)) {
      return
    }

    setPurchasing(true)
    try {
      await storeService.purchaseItem(itemId)
      router.push('/store/purchase-history')
    } catch (error) {
      console.error('Purchase error:', error)
      showToast('Failed to purchase item', 'error')
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Item not found</div>
      </div>
    )
  }

  const isOwner = user?.id === item.userId

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            {item.images && item.images.length > 0 && (
              <div className="relative aspect-square">
                <Image
                  src={item.images[0]}
                  alt={item.title}
                  fill
                  className="object-cover rounded-lg"
                />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-4">{item.title}</h1>
            <p className="text-3xl font-bold text-accent mb-4">${item.price}</p>
            {item.description && (
              <p className="text-foreground/70 mb-6">{item.description}</p>
            )}
            <div className="mb-6">
              <p className="text-sm text-foreground/70 mb-2">Category: {item.category}</p>
              <p className="text-sm text-foreground/70">Seller: <Link href={`/profile/${item.userId}`} className="text-accent hover:underline">@{item.user?.username}</Link></p>
            </div>
            {!isOwner && (
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {purchasing ? 'Processing...' : `Purchase for $${item.price}`}
              </button>
            )}
            {isOwner && (
              <div className="space-y-2">
                <Link
                  href={`/store/item/${itemId}/edit`}
                  className="block w-full px-6 py-3 bg-surface border border-border text-foreground rounded-lg font-semibold hover:bg-surface/80 text-center"
                >
                  Edit Item
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
