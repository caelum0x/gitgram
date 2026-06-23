'use client';

interface SocialLink {
  url: string;
  platform: string;
}

interface ProfileStatsProps {
  posts: number;
  snippets: number;
  repositories: number;
  followers: number;
  following: number;
  stars: number;
  links?: SocialLink[];
  variant?: 'compact' | 'full';
}

interface StatChipProps {
  label: string;
  value: number;
  onClick?: () => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StatChip({ label, value, onClick }: StatChipProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={[
        'flex items-center gap-1 rounded-full px-3 py-1 text-sm',
        'bg-[var(--surface-secondary)] border border-[var(--border)]',
        onClick
          ? 'cursor-pointer transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]'
          : 'cursor-default',
      ].join(' ')}
      style={{ color: 'var(--foreground)' }}
      {...(onClick ? { type: 'button' } : {})}
    >
      <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
        {formatCount(value)}
      </span>
      <span style={{ color: 'var(--foreground-secondary)' }}>{label}</span>
    </Tag>
  );
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  github: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.13 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.56 21.8 24 17.3 24 12 24 5.37 18.63 0 12 0z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

function PlatformIcon({ platform }: { platform: string }) {
  const icon = PLATFORM_ICONS[platform.toLowerCase()];
  if (icon) return <>{icon}</>;
  return <>{PLATFORM_ICONS['website']}</>;
}

function normalizePlatform(url: string, platform: string): string {
  if (platform && platform !== 'website') return platform.toLowerCase();
  if (url.includes('github.com')) return 'github';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('youtube.com')) return 'youtube';
  return 'website';
}

export function ProfileStats({
  posts,
  snippets,
  repositories,
  followers,
  following,
  stars,
  links = [],
  variant = 'full',
}: ProfileStatsProps) {
  const stats: Array<{ label: string; value: number }> = [
    { label: 'Posts', value: posts },
    { label: 'Snippets', value: snippets },
    { label: 'Repos', value: repositories },
    { label: 'Followers', value: followers },
    { label: 'Following', value: following },
    { label: 'Stars', value: stars },
  ];

  const visibleStats = variant === 'compact' ? stats.slice(0, 4) : stats;

  return (
    <div className="flex flex-col gap-2">
      {/* Stat chips */}
      <div className="flex flex-wrap gap-2" role="list" aria-label="Profile statistics">
        {visibleStats.map((s) => (
          <div key={s.label} role="listitem">
            <StatChip label={s.label} value={s.value} />
          </div>
        ))}
      </div>

      {/* Social links */}
      {links.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {links.map((link) => {
            const platform = normalizePlatform(link.url, link.platform);
            return (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--surface-secondary)]"
                style={{ color: 'var(--foreground-secondary)' }}
                aria-label={`${platform} profile`}
                title={link.url}
              >
                <PlatformIcon platform={platform} />
                {variant === 'full' && (
                  <span className="capitalize">{platform}</span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ProfileStats;
