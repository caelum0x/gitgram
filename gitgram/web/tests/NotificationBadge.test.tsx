import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotificationBadge, {
  NotificationDot,
  IconWithBadge,
} from '@/components/NotificationBadge'

// Mock the useNotificationBadge hook
const mockCount = vi.fn()
vi.mock('@/hooks/useSocket', () => ({
  useNotificationBadge: () => ({ count: mockCount() }),
}))

describe('NotificationBadge', () => {
  it('should render nothing when count is 0 and showZero is false', () => {
    mockCount.mockReturnValue(0)
    const { container } = render(<NotificationBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('should render 0 when count is 0 and showZero is true', () => {
    mockCount.mockReturnValue(0)
    render(<NotificationBadge showZero />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('should render the count when greater than 0', () => {
    mockCount.mockReturnValue(5)
    render(<NotificationBadge />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should cap display at maxCount', () => {
    mockCount.mockReturnValue(150)
    render(<NotificationBadge maxCount={99} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    mockCount.mockReturnValue(3)
    render(<NotificationBadge className="custom-class" />)
    expect(screen.getByText('3').className).toContain('custom-class')
  })
})

describe('NotificationDot', () => {
  it('should render when visible is true', () => {
    const { container } = render(<NotificationDot visible />)
    expect(container.firstChild).not.toBeNull()
  })

  it('should render nothing when visible is false', () => {
    const { container } = render(<NotificationDot visible={false} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('IconWithBadge', () => {
  it('should render children', () => {
    render(
      <IconWithBadge>
        <span data-testid="icon">icon</span>
      </IconWithBadge>
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('should show count badge when count > 0', () => {
    render(
      <IconWithBadge count={5}>
        <span>icon</span>
      </IconWithBadge>
    )
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should show dot when showDot is true and no count', () => {
    const { container } = render(
      <IconWithBadge showDot>
        <span>icon</span>
      </IconWithBadge>
    )
    // Dot is a span with specific class - it should exist
    const dots = container.querySelectorAll('.bg-error.rounded-full')
    expect(dots.length).toBe(1)
  })

  it('should prefer count badge over dot when both provided', () => {
    const { container } = render(
      <IconWithBadge count={3} showDot>
        <span>icon</span>
      </IconWithBadge>
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    // Dot should NOT be shown since count is shown
    const dots = container.querySelectorAll('.w-2.h-2.bg-error')
    expect(dots.length).toBe(0)
  })

  it('should cap count at maxCount', () => {
    render(
      <IconWithBadge count={200} maxCount={99}>
        <span>icon</span>
      </IconWithBadge>
    )
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
