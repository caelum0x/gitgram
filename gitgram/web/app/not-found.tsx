import Link from 'next/link'

const SUGGESTED_LINKS: ReadonlyArray<{ href: string; label: string; description: string }> = [
  { href: '/explore', label: 'Explore', description: 'Discover repos and developers' },
  { href: '/trending', label: 'Trending', description: "See what's hot right now" },
  { href: '/feed', label: 'Your Feed', description: 'Catch up on your timeline' },
]

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 py-16">
      <div className="w-full max-w-lg text-center">
        {/* Illustration */}
        <div className="mx-auto mb-8 flex h-40 w-40 items-center justify-center">
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full"
            role="img"
            aria-label="A disconnected git branch graph"
          >
            <circle cx="100" cy="100" r="92" stroke="var(--border)" strokeWidth="4" />
            <circle cx="60" cy="70" r="10" fill="var(--primary)" />
            <circle cx="60" cy="130" r="10" fill="var(--surface-secondary)" stroke="var(--border)" strokeWidth="3" />
            <circle cx="140" cy="100" r="10" fill="var(--accent)" />
            <path d="M60 80 V120" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
            <path
              d="M60 70 H110"
              stroke="var(--border)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="6 8"
            />
            <path d="M130 100 H75" stroke="var(--error)" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 8" />
            <text x="100" y="170" textAnchor="middle" fill="var(--foreground-secondary)" fontSize="13" fontFamily="monospace">
              HEAD detached
            </text>
          </svg>
        </div>

        <p className="mb-2 font-mono text-sm tracking-widest text-[var(--primary)]">ERROR 404</p>
        <h1 className="mb-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
          Lost in the codebase
        </h1>
        <p className="mx-auto mb-8 max-w-md text-[var(--foreground-secondary)]">
          This branch doesn&apos;t exist or was force-pushed away. Let&apos;s get you back to a known good commit.
        </p>

        {/* Primary actions */}
        <div className="mb-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="w-full rounded-lg bg-[var(--primary)] px-6 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
          >
            Go Home
          </Link>
          <Link
            href="/search"
            className="w-full rounded-lg border border-[var(--border)] px-6 py-2.5 font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-secondary)] sm:w-auto"
          >
            Search
          </Link>
        </div>

        {/* Suggested links */}
        <div className="text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-secondary)]">
            Try one of these
          </p>
          <ul className="grid gap-2">
            {SUGGESTED_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-secondary)]"
                >
                  <span>
                    <span className="block font-medium text-[var(--foreground)]">{link.label}</span>
                    <span className="block text-sm text-[var(--foreground-secondary)]">{link.description}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[var(--foreground-secondary)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--primary)]"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
