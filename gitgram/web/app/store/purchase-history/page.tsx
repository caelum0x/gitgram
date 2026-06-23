'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { storeService } from '@/services/storeService'

export default function PurchaseHistoryPage() {
  const [purchases, setPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPurchases()
  }, [])

  const loadPurchases = async () => {
    try {
      const response = await storeService.getPurchaseHistory()
      setPurchases(response.purchases || [])
    } catch (error) {
      console.error('Load purchases error:', error)
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Purchase History</h1>

        <div className="space-y-4">
          {purchases.map((purchase) => (
            <Link
              key={purchase.id}
              href={`/store/item/${purchase.itemId}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {purchase.item?.images && purchase.item.images.length > 0 && (
                <div className="relative w-20 h-20">
                  <Image
                    src={purchase.item.images[0]}
                    alt={purchase.item.title}
                    fill
                    className="object-cover rounded-lg"
                  />
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{purchase.item?.title}</h3>
                <p className="text-sm text-foreground/70">
                  Purchased on {new Date(purchase.createdAt).toLocaleDateString()}
                </p>
              </div>
              <p className="text-lg font-bold text-accent">${purchase.amount}</p>
            </Link>
          ))}
        </div>

        {purchases.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No purchases yet
          </div>
        )}
      </div>
    </div>
  )
}
