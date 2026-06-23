'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { adService } from '@/services/adService'

interface AdCardProps {
  ad: {
    id: string
    title?: string
    content?: string
    mediaUrl?: string
    mediaType?: 'image' | 'video' | 'carousel'
    callToAction?: string
    destinationUrl?: string
    campaign?: {
      name: string
    }
  }
}

export default function AdCard({ ad }: AdCardProps) {
  const [impressionTracked, setImpressionTracked] = useState(false)

  useEffect(() => {
    // Track impression when ad comes into view
    if (!impressionTracked) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              adService.trackImpression(ad.id).catch(console.error)
              setImpressionTracked(true)
              observer.disconnect()
            }
          })
        },
        { threshold: 0.5 }
      )

      const element = document.getElementById(`ad-${ad.id}`)
      if (element) {
        observer.observe(element)
      }

      return () => observer.disconnect()
    }
  }, [ad.id, impressionTracked])

  const handleClick = async () => {
    try {
      await adService.trackClick(ad.id)
      if (ad.destinationUrl) {
        window.open(ad.destinationUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      console.error('Track click error:', error)
      if (ad.destinationUrl) {
        window.open(ad.destinationUrl, '_blank', 'noopener,noreferrer')
      }
    }
  }

  return (
    <div
      id={`ad-${ad.id}`}
      className="bg-surface rounded-md border border-border p-4 mb-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-foreground-secondary uppercase tracking-wide font-medium">Sponsored</span>
        {ad.campaign?.name && (
          <span className="text-xs text-foreground-secondary">• {ad.campaign.name}</span>
        )}
      </div>

      {ad.mediaUrl && (
        <div className="mb-4 rounded-lg overflow-hidden cursor-pointer" onClick={handleClick}>
          {ad.mediaType === 'video' ? (
            <video
              src={ad.mediaUrl}
              className="w-full h-auto"
              controls
              playsInline
            />
          ) : (
            <Image
              src={ad.mediaUrl}
              alt={ad.title || 'Ad'}
              width={600}
              height={400}
              className="w-full h-auto object-cover"
            />
          )}
        </div>
      )}

      {ad.title && (
        <h3 className="text-base font-semibold text-foreground mb-2">{ad.title}</h3>
      )}

      {ad.content && (
        <p className="text-sm text-foreground-secondary mb-4 leading-relaxed">{ad.content}</p>
      )}

      {ad.callToAction && ad.destinationUrl && (
        <button
          onClick={handleClick}
          className="px-4 py-2 bg-button-primary text-white rounded-md text-sm font-semibold hover:bg-button-primary-hover transition-colors"
        >
          {ad.callToAction}
        </button>
      )}
    </div>
  )
}

