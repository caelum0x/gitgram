/**
 * Central type definitions for the Gitgram web app.
 * All shared domain models live here; import from '@/types/gitgram'.
 */

// ---------------------------------------------------------------------------
// Primitive enums / union types
// ---------------------------------------------------------------------------

export type PostType = 'post' | 'snippet' | 'reel'

export type StoryPrivacy = 'public' | 'followers'

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'star'
  | 'fork'

// ---------------------------------------------------------------------------
// Core domain models
// ---------------------------------------------------------------------------

export interface User {
  id: string
  username: string
  email: string
  avatar: string | null
  bio: string | null
  githubUsername: string | null
  followersCount: number
  followingCount: number
  isPrivate: boolean
  createdAt: string
}

export interface Repository {
  id: string
  fullName: string
  owner: string
  name: string
  description: string | null
  stars: number
  forks: number
  language: string | null
  htmlUrl: string
  isPrivate: boolean
  isClaimed: boolean
}

export interface Post {
  id: string
  content: string
  userId: string
  author: User
  repositoryId: string | null
  repository: Repository | null
  likes: number
  commentsCount: number
  views: number
  createdAt: string
  hashtags: string[] | null
  type: PostType
}

export interface Snippet {
  id: string
  title: string
  description: string | null
  code: string
  language: string
  userId: string
  author: User
  repositoryId: string | null
  repository: Repository | null
  likes: number
  views: number
  createdAt: string
}

export interface Reel {
  id: string
  title: string
  description: string | null
  code: string
  language: string
  authorId: string
  author: User
  likes: number
  views: number
  createdAt: string
}

export interface Story {
  id: string
  userId: string
  author: User
  imageUrl: string | null
  textContent: string | null
  backgroundColor: string | null
  expiresAt: string
  viewCount: number
  privacy: StoryPrivacy
}

export interface Notification {
  id: string
  type: NotificationType
  userId: string
  fromUser: User
  post: Post | null
  snippet: Snippet | null
  message: string
  isRead: boolean
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  sender: User
  content: string
  createdAt: string
  isRead: boolean
}

export interface Conversation {
  id: string
  participants: User[]
  lastMessage: Message | null
  unreadCount: number
  updatedAt: string
}

export interface Collection {
  id: string
  name: string
  description: string | null
  userId: string
  owner: User
  isPrivate: boolean
  itemCount: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Pagination wrappers
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
  hasMore: boolean
}

export interface CursorPaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

// ---------------------------------------------------------------------------
// API response envelope (matches backend wrapErrorMessage pattern)
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
  meta?: {
    total: number
    page: number
    limit: number
  }
}
