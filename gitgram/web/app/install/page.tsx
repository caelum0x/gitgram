'use client'

import { useEffect, useState } from 'react'

type Platform = 'ios' | 'android' | 'desktop'

interface Step {
  icon: string
  title: string
  description: string
}

const STEPS: Record<Platform, Step[]> = {
  ios: [
    {
      icon: '🌐',
      title: 'Open in Safari',
      description: 'Gitgram PWA installation requires Safari on iOS. Make sure you are visiting app.gitgram.dev in Safari.',
    },
    {
      icon: '↑',
      title: 'Tap the Share button',
      description: 'Tap the Share icon (a box with an arrow pointing up) in the bottom toolbar of Safari.',
    },
    {
      icon: '+',
      title: 'Add to Home Screen',
      description: 'Scroll down in the Share sheet and tap "Add to Home Screen". Give it a name and tap "Add".',
    },
    {
      icon: '🚀',
      title: 'Launch Gitgram',
      description: 'Find the Gitgram icon on your home screen. Tap it to open the full-screen app experience.',
    },
  ],
  android: [
    {
      icon: '🌐',
      title: 'Open in Chrome',
      description: 'Visit app.gitgram.dev in Google Chrome on your Android device.',
    },
    {
      icon: '⋮',
      title: 'Open the browser menu',
      description: 'Tap the three-dot menu icon in the top-right corner of Chrome.',
    },
    {
      icon: '+',
      title: 'Add to Home Screen',
      description: 'Tap "Add to Home screen" or "Install app" from the menu. Confirm by tapping "Add".',
    },
    {
      icon: '🚀',
      title: 'Launch Gitgram',
      description: 'Gitgram now lives on your home screen and app drawer just like a native app.',
    },
  ],
  desktop: [
    {
      icon: '🌐',
      title: 'Open in Chrome or Edge',
      description: 'Visit app.gitgram.dev in Google Chrome or Microsoft Edge on your computer.',
    },
    {
      icon: '⊕',
      title: 'Click the install icon',
      description: 'Look for the install icon (⊕) in the address bar on the right side, or open the browser menu.',
    },
    {
      icon: '✓',
      title: 'Confirm installation',
      description: 'Click "Install" in the dialog that appears. Gitgram will open in its own window.',
    },
    {
      icon: '🚀',
      title: 'Ready to go',
      description: 'Gitgram is now installed as a desktop app. Find it in your applications or taskbar.',
    },
  ],
}

const BENEFITS = [
  { icon: '⚡', label: 'Faster load times with offline caching' },
  { icon: '🔔', label: 'Push notifications for activity' },
  { icon: '📱', label: 'Full-screen, native-app feel' },
  { icon: '🔄', label: 'Background sync for posts and likes' },
]

export default function InstallPage() {
  const [activePlatform, setActivePlatform] = useState<Platform>('android')
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Detect likely platform for a sensible default
    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) setActivePlatform('ios')
    else if (/android/.test(ua)) setActivePlatform('android')
    else setActivePlatform('desktop')

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => setInstalled(true)
    window.addEventListener('appinstalled', installedHandler)

    // Check if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  async function handleInstallClick() {
    if (!installPrompt) return
    const promptEvent = installPrompt as BeforeInstallPromptEvent
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
      setInstallPrompt(null)
    }
  }

  const tabs: { id: Platform; label: string; emoji: string }[] = [
    { id: 'ios',     label: 'iOS',     emoji: '' },
    { id: 'android', label: 'Android', emoji: '' },
    { id: 'desktop', label: 'Desktop', emoji: '🖥' },
  ]

  const steps = STEPS[activePlatform]

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-12">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--surface)] border border-[var(--border)] mb-4 text-2xl">
            📲
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Install Gitgram</h1>
          <p className="text-[var(--foreground-secondary)] text-base max-w-sm mx-auto">
            Add Gitgram to your home screen for the fastest, most native experience — no app store required.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {BENEFITS.map((b) => (
            <div
              key={b.label}
              className="flex items-center gap-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 py-3"
            >
              <span className="text-lg flex-shrink-0">{b.icon}</span>
              <span className="text-sm text-[var(--foreground-secondary)] leading-snug">{b.label}</span>
            </div>
          ))}
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePlatform(tab.id)}
              className={[
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                activePlatform === tab.id
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
              ].join(' ')}
              type="button"
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-4 mb-10">
          {steps.map((step, index) => (
            <li
              key={index}
              className="flex gap-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center">
                <span className="text-sm font-semibold text-[var(--primary)]">{index + 1}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm mb-1">{step.title}</p>
                <p className="text-[var(--foreground-secondary)] text-sm leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Screenshot placeholder */}
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden mb-10">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--foreground-secondary)] uppercase tracking-wide">Preview</p>
          </div>
          <div className="flex items-center justify-center h-48 text-[var(--foreground-secondary)]">
            <div className="text-center">
              <div className="text-4xl mb-2">📸</div>
              <p className="text-sm">Screenshot coming soon</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        {installed ? (
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] px-6 py-5 text-center">
            <div className="text-2xl mb-2">🎉</div>
            <p className="font-semibold mb-1">Gitgram is installed!</p>
            <p className="text-sm text-[var(--foreground-secondary)]">
              You're already running the installed version. Enjoy the full experience.
            </p>
          </div>
        ) : installPrompt ? (
          <button
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center gap-2 bg-[var(--primary)] hover:opacity-90 active:scale-[0.98] transition text-white font-semibold py-3 px-6 rounded-xl text-base"
            type="button"
          >
            <span>📲</span>
            <span>Add to Home Screen</span>
          </button>
        ) : (
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] px-6 py-5 text-center">
            <p className="text-sm text-[var(--foreground-secondary)]">
              Follow the steps above for your platform to install Gitgram on your device.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-[var(--foreground-secondary)] mt-6">
          No app store. No download. Instant updates.
        </p>
      </div>
    </main>
  )
}

// Minimal type extension for the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
