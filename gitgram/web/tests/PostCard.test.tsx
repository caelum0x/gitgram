import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PostCard from '@/components/PostCard'

// Mock dependencies
vi.mock('@/services/postService', () => ({
  postService: {
    getComments: vi.fn(),
    addComment: vi.fn(),
    likeComment: vi.fn(),
    deleteComment: vi.fn(),
    updateComment: vi.fn(),
  },
}))

const mockShowToast = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('@/components/RichContent', () => ({
  default: ({ content }: { content: string }) => <span data-testid="rich-content">{content}</span>,
}))

vi.mock('@/components/AitmChangeStoryCard', () => ({
  default: () => <div data-testid="change-story-card" />,
}))

vi.mock('@/utils/aitmChangeStory', () => ({
  parseAitmChangeStoryBlock: (content: string) => ({ story: null, cleanContent: content }),
}))

import { postService } from '@/services/postService'

const mockPost = {
  id: 'post-1',
  content: 'Hello world from my new project!',
  createdAt: new Date().toISOString(),
  isLiked: false,
  likes: 5,
  comments: 2,
  reposts: 0,
  author: {
    username: 'testuser',
    displayName: 'testuser',
    avatarUrl: undefined,
  },
}

describe('PostCard', () => {
  const onLike = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render post content', () => {
    render(<PostCard post={mockPost} onLike={onLike} />)
    expect(screen.getAllByText('testuser')).toHaveLength(2) // header + content
    expect(screen.getByTestId('rich-content')).toHaveTextContent('Hello world from my new project!')
  })

  it('should display user avatar initial when no avatar URL', () => {
    render(<PostCard post={mockPost} onLike={onLike} />)
    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('should display likes count', () => {
    render(<PostCard post={mockPost} onLike={onLike} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should display comments count', () => {
    render(<PostCard post={mockPost} onLike={onLike} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should call onLike when like button is clicked on unliked post', () => {
    render(<PostCard post={mockPost} onLike={onLike} />)
    const likeButton = screen.getByText('5').closest('button')!
    fireEvent.click(likeButton)
    expect(onLike).toHaveBeenCalledWith('post-1')
  })

  it('should call onLike when like button is clicked on liked post', () => {
    const likedPost = { ...mockPost, isLiked: true }
    render(<PostCard post={likedPost} onLike={onLike} />)
    const likeButton = screen.getByText('5').closest('button')!
    fireEvent.click(likeButton)
    expect(onLike).toHaveBeenCalledWith('post-1')
  })

  it('should show comments section when comment button is clicked', async () => {
    vi.mocked(postService.getComments).mockResolvedValue({
      comments: [
        {
          id: 'c1',
          content: 'Great post!',
          createdAt: new Date().toISOString(),
          user: { username: 'commenter', avatar: null },
          isLiked: false,
          likesCount: 0,
        },
      ],
    })

    render(<PostCard post={mockPost} onLike={onLike} />)

    const commentButton = screen.getByText('2').closest('button')!
    fireEvent.click(commentButton)

    expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument()

    await waitFor(() => {
      expect(postService.getComments).toHaveBeenCalledWith('post-1')
    })
  })

  it('should add a new comment', async () => {
    vi.mocked(postService.getComments).mockResolvedValue({ comments: [] })
    vi.mocked(postService.addComment).mockResolvedValue({
      id: 'c-new',
      content: 'My comment',
      createdAt: new Date().toISOString(),
      user: { username: 'me', avatar: null },
    })

    render(<PostCard post={mockPost} onLike={onLike} />)

    // Open comments
    const commentButton = screen.getByText('2').closest('button')!
    fireEvent.click(commentButton)

    const input = screen.getByPlaceholderText('Add a comment...')
    fireEvent.change(input, { target: { value: 'My comment' } })

    const submitButton = screen.getByRole('button', { name: 'Post' })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(postService.addComment).toHaveBeenCalledWith('post-1', 'My comment')
      expect(mockShowToast).toHaveBeenCalledWith('Comment added!', 'success')
    })
  })

  it('should render a GIF when post has gifUrl', () => {
    const gifPost = { ...mockPost, gifUrl: 'https://example.com/test.gif' }
    render(<PostCard post={gifPost} onLike={onLike} />)
    const img = screen.getByAltText('GIF')
    expect(img).toHaveAttribute('src', 'https://example.com/test.gif')
  })

  it('should render media image when post has mediaUrl', () => {
    const mediaPost = { ...mockPost, mediaUrl: 'https://example.com/photo.jpg', mediaType: 'image' }
    render(<PostCard post={mediaPost} onLike={onLike} />)
    const img = screen.getByAltText('Post')
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg')
  })

  it('should not submit empty comments', async () => {
    vi.mocked(postService.getComments).mockResolvedValue({ comments: [] })

    render(<PostCard post={mockPost} onLike={onLike} />)

    const commentButton = screen.getByText('2').closest('button')!
    fireEvent.click(commentButton)

    const submitButton = screen.getByRole('button', { name: 'Post' })
    expect(submitButton).toBeDisabled()
  })
})
