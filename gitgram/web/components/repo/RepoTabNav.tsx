'use client';

export type RepoTab = 'feed' | 'media' | 'snippets' | 'activity' | 'about' | 'settings';

interface RepoTabNavProps {
  activeTab: RepoTab;
  onTabChange: (tab: RepoTab) => void;
  counts?: {
    feed?: number;
    media?: number;
    snippets?: number;
    activity?: number;
  };
}

const TABS: { key: RepoTab; label: string; icon: JSX.Element }[] = [
  {
    key: 'feed',
    label: 'Feed',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    key: 'media',
    label: 'Media',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'snippets',
    label: 'Code Snippets',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    key: 'activity',
    label: 'Activity',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'about',
    label: 'About',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function RepoTabNav({ activeTab, onTabChange, counts }: RepoTabNavProps) {
  const getCount = (key: RepoTab): number | undefined => {
    if (!counts) return undefined;
    switch (key) {
      case 'feed':
        return counts.feed;
      case 'media':
        return counts.media;
      case 'snippets':
        return counts.snippets;
      case 'activity':
        return counts.activity;
      default:
        return undefined;
    }
  };

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Repository tabs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getCount(tab.key);

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground-secondary hover:border-border hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
              {count !== undefined && count > 0 && (
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-hover text-foreground-secondary'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
