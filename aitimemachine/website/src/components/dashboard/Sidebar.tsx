'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Key,
  FolderGit2,
  Activity,
  Webhook,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Clock,
  Monitor,
  FileText,
  Users,
  Menu,
  X,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useDashboard';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  teamOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Main',
    items: [
      {
        title: 'Overview',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
      {
        title: 'Projects',
        href: '/dashboard/projects',
        icon: FolderGit2,
      },
      {
        title: 'Timeline',
        href: '/dashboard/timeline',
        icon: Clock,
      },
      {
        title: 'Semantic Search',
        href: '/dashboard/search',
        icon: BookOpen,
      },
    ],
  },
  {
    title: 'Analytics',
    items: [
      {
        title: 'Usage & Analytics',
        href: '/dashboard/usage',
        icon: Activity,
      },
      {
        title: 'Audit Log',
        href: '/dashboard/audit',
        icon: FileText,
      },
      {
        title: 'Training Exports',
        href: '/dashboard/exports',
        icon: CreditCard,
      },
    ],
  },
  {
    title: 'Developer',
    items: [
      {
        title: 'API Keys',
        href: '/dashboard/keys',
        icon: Key,
      },
      {
        title: 'Webhooks',
        href: '/dashboard/webhooks',
        icon: Webhook,
      },
    ],
  },
  {
    title: 'Account',
    items: [
      {
        title: 'Sessions',
        href: '/dashboard/sessions',
        icon: Monitor,
      },
      {
        title: 'Settings',
        href: '/dashboard/settings',
        icon: Settings,
      },
      {
        title: 'Billing',
        href: '/dashboard/billing',
        icon: CreditCard,
      },
    ],
  },
  {
    title: 'Team',
    items: [
      {
        title: 'Team',
        href: '/dashboard/team',
        icon: Users,
        teamOnly: true,
      },
    ],
  },
];

type DisplayPlan = 'Free' | 'Pro' | 'Team' | 'Enterprise';

// Map the billing API's lowercase plan id to the title-cased label used in the UI.
function toDisplayPlan(plan: string | undefined): DisplayPlan {
  switch (plan) {
    case 'team':
      return 'Team';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return 'Free';
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { subscription } = useSubscription();

  // Derive plan state from the real billing subscription. While the request is
  // in flight `subscription` is undefined, which resolves to the Free defaults
  // (no team nav, Free badge) and updates once the data arrives.
  const userPlan = toDisplayPlan(subscription?.plan);
  const isTeamPlan = userPlan === 'Team' || userPlan === 'Enterprise';

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'Free':
        return 'bg-gray-600 text-gray-200';
      case 'Pro':
        return 'bg-blue-600 text-white';
      case 'Team':
        return 'bg-purple-600 text-white';
      case 'Enterprise':
        return 'bg-amber-600 text-white';
      default:
        return 'bg-gray-600 text-gray-200';
    }
  };

  const renderNavItem = (item: NavItem, isActive: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
        isActive
          ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      )}
    >
      <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-blue-400')} />
      {!collapsed && (
        <>
          <span className="flex-1">{item.title}</span>
          {item.badge && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white">
            A
          </div>
          {!collapsed && (
            <span className="font-semibold text-white">Gitgram TimeMachine</span>
          )}
        </Link>
        {/* Desktop collapse button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hidden lg:flex"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 py-4 overflow-y-auto">
        {navSections.map((section, index) => {
          // Filter out team-only items if user is not on team plan
          const visibleItems = section.items.filter(
            (item) => !item.teamOnly || isTeamPlan
          );

          // Skip section if no visible items
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className={cn(index > 0 && 'mt-6')}>
              {!collapsed && (
                <h3 className="px-5 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {section.title}
                </h3>
              )}
              <nav className="px-2 space-y-1">
                {visibleItems.map((item) => {
                  const isActive =
                    item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname === item.href || pathname.startsWith(item.href + '/');
                  return renderNavItem(item, isActive);
                })}
              </nav>
            </div>
          );
        })}

        {/* Docs Link */}
        <div className="mt-6">
          {!collapsed && (
            <h3 className="px-5 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Resources
            </h3>
          )}
          <nav className="px-2">
            <Link
              href="/docs"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
            >
              <BookOpen className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>Documentation</span>}
            </Link>
          </nav>
        </div>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-gray-800">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-10 h-10',
              },
            }}
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName || user?.username || 'Account'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className={cn('text-xs px-1.5 py-0', getPlanBadgeColor(userPlan))}>
                  {userPlan === 'Team' || userPlan === 'Enterprise' ? (
                    <Crown className="h-3 w-3 mr-1" />
                  ) : null}
                  {userPlan}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-gray-900 border border-gray-800"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden lg:flex flex-col h-full bg-gray-900 border-r border-gray-800 transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
      </div>
    </>
  );
}
