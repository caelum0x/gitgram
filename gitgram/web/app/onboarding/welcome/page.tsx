'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TOTAL_STEPS = 3
const CURRENT_STEP = 1

export default function WelcomePage() {
  const router = useRouter()
  const [githubConnected, setGithubConnected] = useState(false)

  // After GitHub OAuth the callback redirects back here with ?github=connected
  // Check this on mount via URLSearchParams inside an effect-free approach
  // (Next.js passes searchParams as a prop but we keep this client-only via window)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('github') === 'connected' && !githubConnected) {
      setGithubConnected(true)
    }
  }

  const progressPercent = Math.round((CURRENT_STEP / TOTAL_STEPS) * 100)

  const handleContinue = () => {
    router.push('/onboarding/interests')
  }

  const handleGitHubConnect = () => {
    // Redirect to backend GitHub OAuth; backend will redirect back after auth
    const returnUrl = encodeURIComponent('/onboarding/welcome?github=connected')
    window.location.href = `/api/v1/auth/github?return_to=${returnUrl}`
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Step {CURRENT_STEP} of {TOTAL_STEPS}
            </span>
            <span
              className="text-sm"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              {progressPercent}%
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: 'var(--primary)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* Gitgram icon — stylised G mark */}
            <svg
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              aria-hidden="true"
            >
              <rect width="44" height="44" rx="10" fill="var(--primary)" fillOpacity="0.15" />
              <path
                d="M22 8C14.268 8 8 14.268 8 22C8 28.322 12.024 33.696 17.688 35.568C18.408 35.704 18.664 35.264 18.664 34.888C18.664 34.544 18.648 33.48 18.648 32.352C15.2 33.008 14.272 31.472 13.992 30.672C13.832 30.264 13.136 28.992 12.528 28.648C12.032 28.384 11.312 27.728 12.512 27.712C13.648 27.696 14.448 28.736 14.712 29.16C16.0 31.352 18.088 30.76 18.72 30.392C18.856 29.464 19.24 28.856 19.664 28.504C16.64 28.152 13.472 26.976 13.472 21.712C13.472 20.208 14.024 18.96 14.752 18.0C14.608 17.648 14.112 16.224 14.896 14.32C14.896 14.32 16.096 13.952 18.664 15.744C19.648 15.464 20.704 15.328 21.76 15.328C22.816 15.328 23.872 15.464 24.856 15.744C27.424 13.936 28.624 14.32 28.624 14.32C29.408 16.224 28.912 17.648 28.768 18.0C29.496 18.96 30.048 20.192 30.048 21.712C30.048 26.992 26.864 28.152 23.84 28.504C24.368 28.944 24.824 29.792 24.824 31.12C24.824 33.008 24.808 34.528 24.808 34.888C24.808 35.264 25.064 35.72 25.784 35.568C31.424 33.696 35.44 28.306 35.44 22.0C35.44 14.268 29.732 8 22 8Z"
                fill="var(--primary)"
              />
            </svg>
          </div>

          <h1
            className="text-4xl font-bold mb-3 tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            Gitgram
          </h1>
          <p
            className="text-lg leading-relaxed"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            The social network for developers.
            <br />
            Share your work. Build in public. Grow together.
          </p>
        </div>

        {/* GitHub OAuth card */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p
            className="text-sm font-medium mb-4 text-center"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            Connect your GitHub account to get started
          </p>

          {githubConnected ? (
            <div
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl font-semibold text-base"
              style={{
                backgroundColor: 'rgba(35, 134, 54, 0.15)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="10" fill="var(--accent)" fillOpacity="0.2" />
                <path
                  d="M6 10l2.5 2.5 5.5-5.5"
                  stroke="var(--accent)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              GitHub Connected
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGitHubConnect}
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2"
              style={{
                backgroundColor: 'var(--foreground)',
                color: 'var(--background)',
              }}
            >
              {/* GitHub Octocat mark */}
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          )}
        </div>

        {/* Continue button */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!githubConnected}
          className="w-full py-3.5 rounded-xl font-semibold text-base mb-4 focus:outline-none focus-visible:ring-2"
          style={{
            backgroundColor: githubConnected ? 'var(--primary)' : 'var(--surface)',
            color: githubConnected ? '#fff' : 'var(--foreground-secondary)',
            border: githubConnected ? 'none' : '1px solid var(--border)',
            cursor: githubConnected ? 'pointer' : 'not-allowed',
            opacity: githubConnected ? 1 : 0.6,
            transition: 'background-color 0.15s ease, opacity 0.15s ease',
          }}
        >
          Continue
        </button>

        {/* Skip */}
        <div className="text-center">
          <Link
            href="/feed"
            className="text-sm hover:underline"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  )
}
