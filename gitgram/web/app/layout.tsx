import type { Metadata, Viewport } from 'next'
import { Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import ConditionalLayout from './ConditionalLayout'
import { RegisterSW } from './register-sw'
import { AppShortcutsProvider } from '@/components/AppShortcutsProvider'
import { RealtimeToast } from '@/components/RealtimeToast'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
})

export const viewport: Viewport = {
  themeColor: '#7C3AED',
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://gitgram.app'),
  title: {
    default: 'Gitgram - Where Code Becomes Community',
    template: '%s | Gitgram',
  },
  description: 'The social platform for developers. Share GitHub projects, discover trending repositories, connect with developers worldwide, and build your coding portfolio.',
  keywords: ['developer social network', 'GitHub', 'code sharing', 'developer community', 'open source', 'coding portfolio'],
  authors: [{ name: 'Gitgram' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Gitgram',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gitgram.app',
    siteName: 'Gitgram',
    title: 'Gitgram - Where Code Becomes Community',
    description: 'The social platform for developers. Share GitHub projects, discover trending repositories, and connect with developers worldwide.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Gitgram - Where Code Becomes Community',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gitgram - Where Code Becomes Community',
    description: 'The social platform for developers. Share GitHub projects, discover trending repositories, and connect with developers worldwide.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <Providers>
          <AppShortcutsProvider>
            <ConditionalLayout>
              {children}
            </ConditionalLayout>
            {/* Global SSE-driven toast stack — renders only when authenticated. */}
            <RealtimeToast />
          </AppShortcutsProvider>
        </Providers>
        <RegisterSW />
      </body>
    </html>
  )
}
