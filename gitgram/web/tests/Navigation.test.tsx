import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Navigation from '@/components/Navigation'

// Mock AccountSwitcher since it does API calls on mount
vi.mock('@/components/AccountSwitcher', () => ({
  default: () => <div data-testid="account-switcher">AccountSwitcher</div>,
}))

// Mock the auth store
const mockUseAuthStore = vi.fn()
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: any) => mockUseAuthStore(selector),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the Gitgram logo', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)
    expect(screen.getByText('Gitgram')).toBeInTheDocument()
  })

  it('should show only public links when unauthenticated', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
    expect(screen.queryByText('Messages')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('should show all links when authenticated', () => {
    mockUseAuthStore.mockReturnValue(true)
    render(<Navigation />)

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
    expect(screen.getByText('Claim Repo')).toBeInTheDocument()
  })

  it('should render the search input', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)
    expect(screen.getByPlaceholderText('Search or paste GitHub URL...')).toBeInTheDocument()
  })

  it('should navigate to repo page when GitHub URL is searched', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)

    const input = screen.getByPlaceholderText('Search or paste GitHub URL...')
    fireEvent.change(input, { target: { value: 'https://github.com/facebook/react' } })
    fireEvent.submit(input.closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/facebook/react')
  })

  it('should navigate to repo page when owner/name shorthand is searched', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)

    const input = screen.getByPlaceholderText('Search or paste GitHub URL...')
    fireEvent.change(input, { target: { value: 'vercel/next.js' } })
    fireEvent.submit(input.closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/vercel/next.js')
  })

  it('should navigate to explore page for non-URL searches', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)

    const input = screen.getByPlaceholderText('Search or paste GitHub URL...')
    fireEvent.change(input, { target: { value: 'react hooks' } })
    fireEvent.submit(input.closest('form')!)

    expect(mockPush).toHaveBeenCalledWith('/explore/repos?q=react%20hooks')
  })

  it('should not search when input is empty', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)

    const input = screen.getByPlaceholderText('Search or paste GitHub URL...')
    fireEvent.submit(input.closest('form')!)

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should render the AccountSwitcher', () => {
    mockUseAuthStore.mockReturnValue(false)
    render(<Navigation />)
    expect(screen.getByTestId('account-switcher')).toBeInTheDocument()
  })
})
