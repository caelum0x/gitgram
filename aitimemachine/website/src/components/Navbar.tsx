'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const productLinks = [
  { name: 'Code Intelligence', href: '/code-intelligence', description: 'Search and understand your codebase' },
  { name: 'Time Travel', href: '/time-travel', description: 'Restore any prior state' },
  { name: 'Memory', href: '/memory', description: 'Persistent context across sessions' },
  { name: 'Agents', href: '/agents', description: 'Autonomous agent workflows' },
  { name: 'AITM vs Git', href: '/vs-git', description: 'How AITM compares to Git' },
];

const navigation = [
  { name: 'Docs', href: '/docs' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'Blog', href: '/blog' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  const productActive = productLinks.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold">
                A
              </div>
              <span className="text-xl font-bold text-white hidden sm:block">
                Gitgram TimeMachine
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {/* Product dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setProductOpen(true)}
              onMouseLeave={() => setProductOpen(false)}
            >
              <button
                type="button"
                onClick={() => setProductOpen((v) => !v)}
                aria-expanded={productOpen}
                aria-haspopup="true"
                className={cn(
                  'flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  productActive
                    ? 'text-white bg-gray-800'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                )}
              >
                Product
                <ChevronDown className="h-4 w-4" />
              </button>
              {productOpen && (
                <div className="absolute left-0 top-full pt-2">
                  <div className="w-72 rounded-xl border border-gray-800 bg-gray-900 p-2 shadow-xl">
                    {productLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setProductOpen(false)}
                        className="block rounded-lg px-3 py-2 transition-colors hover:bg-gray-800/70"
                      >
                        <span className="block text-sm font-medium text-white">{item.name}</span>
                        <span className="block text-xs text-gray-400">{item.description}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'text-white bg-gray-800'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <SignedOut>
              <Link
                href="/sign-in"
                className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
              <Button asChild>
                <Link href="/sign-up">Get Started</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                  },
                }}
              />
            </SignedIn>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-400 hover:text-white p-2"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-800">
            <div className="space-y-1">
              <p className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Product
              </p>
              {productLinks.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'block px-4 py-2 rounded-lg text-sm font-medium',
                      isActive
                        ? 'text-white bg-gray-800'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                More
              </p>
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'block px-4 py-2 rounded-lg text-sm font-medium',
                      isActive
                        ? 'text-white bg-gray-800'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <div className="pt-4 border-t border-gray-800 mt-4 space-y-2">
                <SignedOut>
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-2 text-sm font-medium text-gray-400 hover:text-white"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block mx-4 text-center bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Get Started
                  </Link>
                </SignedOut>
                <SignedIn>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-2 text-sm font-medium text-gray-400 hover:text-white"
                  >
                    Dashboard
                  </Link>
                </SignedIn>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
