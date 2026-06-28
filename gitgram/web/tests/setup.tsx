/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'

// Mock next/link so it renders a plain anchor through the SAME React instance the
// test renderer uses. The real next/link is externalised and resolves this app's
// own React 18 copy, which differs from the React that the hoisted
// @testing-library/react pulls in this npm-workspace monorepo; mixing the two copies
// makes useContext read a null dispatcher and aborts rendering. The mock only needs
// to emit an <a href> — that is all the tests assert against.
interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children?: ReactNode
}
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })
