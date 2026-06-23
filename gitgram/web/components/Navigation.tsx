'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountSwitcher from './AccountSwitcher';
import SearchBar from './SearchBar';
import { useAuthStore } from '@/store/authStore';

export default function Navigation() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Public links accessible to all users
  const publicLinks = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/discover', label: 'Discover', icon: '🔭' },
    { href: '/explore/repos', label: 'Explore', icon: '🔍' },
  ];

  // Protected links only shown when authenticated
  const protectedLinks = [
    { href: '/saved/repos', label: 'Following', icon: '📦' },
    { href: '/messages', label: 'Messages', icon: '💬' },
    { href: '/notifications', label: 'Notifications', icon: '🔔' },
    { href: '/profile', label: 'Profile', icon: '👤' },
    { href: '/settings/account', label: 'Settings', icon: '⚙️' },
    { href: '/claim', label: 'Claim Repo', icon: '✨' },
    { href: '/tools/repo-to-text', label: 'Repo→Text', icon: '🤖' },
    { href: '/tools/analyze', label: 'AI Analyze', icon: '🧠' },
    { href: '/reels', label: 'Reels', icon: '🎬' },
  ];

  // Combine links based on authentication state
  const links = isAuthenticated
    ? [...publicLinks, ...protectedLinks]
    : publicLinks;

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Gitgram
            </Link>
            <div className="hidden md:flex gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg transition ${
                    pathname === link.href
                      ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-2">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <SearchBar placeholder="Search or paste GitHub URL..." />
          </div>

          <AccountSwitcher />
        </div>
      </div>
    </nav>
  );
}
