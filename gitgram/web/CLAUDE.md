# Gitgram Web — CLAUDE.md

## AITM Protocol (Required)
Before any file change: `before_action({ action: "description" })`
After changes: `after_action({ action: "what was done", success: true })`

---

## Tech Stack
- **Framework**: Next.js 14 App Router (`app/` directory)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + CSS custom properties (dark theme)
- **Font**: Space Grotesk (`next/font/google`)
- **State**: Zustand (`store/authStore.ts`) + TanStack React Query (`@tanstack/react-query`)
- **HTTP**: Axios (`services/api.ts`) — `withCredentials: true`, auto-refreshes httpOnly cookies
- **Testing**: Vitest + @testing-library/react + axios-mock-adapter (72/72 pass)
- **E2E**: Playwright (`playwright.config.ts`)
- **Error tracking**: Sentry (`sentry.*.config.ts`)

---

## Dark Theme Colors (CSS Custom Properties in `app/globals.css`)

| Variable | Hex | Usage |
|---|---|---|
| `--background` | `#0A0C10` | Page background |
| `--background-light` | `#161b22` | Section backgrounds |
| `--surface` | `#161b22` | Card backgrounds |
| `--surface-secondary` | `#21262d` | Hover states |
| `--border` | `#30363d` | Borders |
| `--foreground` | `#c9d1d9` | Primary text |
| `--foreground-secondary` | `#8b949e` | Secondary text |
| `--primary` | `#58a6ff` | GitHub blue, links |
| `--accent` | `#238636` | GitHub green, CTAs |
| `--error` | `#da3633` | Error states |
| `--warning` | `#d29922` | Warning states |

Always use CSS variables (`bg-[var(--surface)]`) not raw hex values.

---

## App Router Structure (`app/`)

| Route | Purpose |
|---|---|
| `page.tsx` | Landing / home feed |
| `(auth)/` | Auth group — login/register/forgot-password |
| `[username]/` | User profile page |
| `[owner]/[repo]/` | Repository detail page |
| `feed/` | Authenticated social feed |
| `explore/` | Discover repos and developers |
| `messages/` | Direct messages |
| `notifications/` | Notification center |
| `settings/` | User account settings |
| `search/` | Search results |
| `post/[id]/` | Single post detail |
| `trending/` | Trending repos and hashtags |
| `discover/` | Curated discovery |
| `create/` | Create a new post |
| `analytics/` | Profile/repo analytics |
| `store/` | Creator store |
| `pricing/` | Subscription pricing |
| `admin/` | Admin panel |
| `api/` | Next.js API routes (proxies / callbacks) |

`ConditionalLayout.tsx` wraps `app/` — hides sidebar on auth/landing pages.

---

## Components (`components/`)

| Component | Description |
|---|---|
| `Navbar.tsx` | Top navigation bar with user menu |
| `Navigation.tsx` | Left sidebar navigation links |
| `Feed.tsx` | Paginated post feed with infinite scroll |
| `PostCard.tsx` | Single post card with like/comment/share |
| `CreatePost.tsx` | Post composer (text, image, code) |
| `CreatePostWithRepo.tsx` | Post composer pre-linked to a repository |
| `RepoCard.tsx` | Repository summary card |
| `RepositorySocialCard.tsx` | Repo card with social stats |
| `UserProfile.tsx` | Full user profile header |
| `UserList.tsx` | List of user avatars with follow buttons |
| `GitHubActivityFeed.tsx` | Live GitHub events feed |
| `GitHubProfileCard.tsx` | GitHub stats summary card |
| `StoriesRing.tsx` | Instagram-style stories ring |
| `StoryViewer.tsx` | Fullscreen story viewer |
| `StoryReactions.tsx` | Emoji reaction bar for stories |
| `AitmChangeStoryCard.tsx` | AITM checkpoint as a story card |
| `CommentThread.tsx` | Nested comment thread |
| `RealTimeComments.tsx` | WebSocket-backed live comments |
| `SearchBar.tsx` | Global search input |
| `UserSearch.tsx` | User-specific search dropdown |
| `TrendingHashtags.tsx` | Hashtag trending list |
| `TrendingRepos.tsx` | Repository trending list |
| `NotificationBell.tsx` | Bell icon with unread badge |
| `NotificationBadge.tsx` | Numeric unread count badge |
| `CodeBlock.tsx` | Syntax-highlighted code display |
| `CodeSnippetCard.tsx` | Shareable code snippet card |
| `CodeSnippetEmbed.tsx` | Embeddable snippet widget |
| `ImageCarousel.tsx` | Multi-image swipe carousel |
| `VideoPlayer.tsx` | Video player for reels/stories |
| `VirtualList.tsx` | Virtualised list for performance |
| `PageTemplate.tsx` | Consistent page wrapper with title |
| `EmptyState.tsx` | Zero-state placeholder illustration |
| `LoadingSpinner.tsx` | Centered loading indicator |
| `SkeletonLoader.tsx` | Content skeleton during fetch |
| `ErrorBoundary.tsx` | React error boundary wrapper |
| `OfflineIndicator.tsx` | Banner when network is offline |
| `OnlineIndicator.tsx` | User presence dot |
| `AdCard.tsx` | Sponsored ad card |
| `AdPost.tsx` | Ad rendered in-feed |
| `AnalyticsChart.tsx` | Recharts-based analytics chart |
| `BookmarkButton.tsx` | Save/unsave post button |
| `EmojiPicker.tsx` | Emoji selection popover |
| `GifPicker.tsx` | GIF selection popover |
| `MentionInput.tsx` | Text input with @mention autocomplete |
| `TypingIndicator.tsx` | "User is typing…" indicator |
| `PullToRefresh.tsx` | Mobile pull-to-refresh gesture |
| `RichContent.tsx` | Renders markdown + embeds |
| `ShareCheckpointButton.tsx` | Share AITM checkpoint action |
| `RepoToTextWidget.tsx` | Convert repo to readable text |
| `ThemeSelector.tsx` | Theme switcher UI |
| `VerifiedBadge.tsx` | Blue checkmark for verified users |
| `AccountSwitcher.tsx` | Multi-account switcher |
| `PostGrid.tsx` | Instagram-style photo grid |
| `LandingNavbar.tsx` | Navbar for unauthenticated landing pages |
| `Accessibility.tsx` | Skip-to-content and ARIA helpers |
| `composer/` | Subcomponents for the post composer |
| `repo/` | Subcomponents for repository views |
| `ui/` | Primitive UI components (button, toast, modal, …) |

---

## API Integration (`services/`)

**Base URL**: `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000/api`)
**Versioning**: paths auto-prefixed with `/v1` via `normalizeApiPath()`
**Auth**: httpOnly cookies sent automatically (`withCredentials: true`); token refresh on 401 is handled transparently in the Axios interceptor.

| Service | Responsibility |
|---|---|
| `api.ts` | Axios instance, interceptors, token refresh |
| `authService.ts` | Login, register, logout, 2FA, OAuth |
| `userService.ts` | Profile CRUD, follow/unfollow |
| `postService.ts` | Create/read/delete posts, likes, paginated feed (`getFeed`) |
| `repoService.ts` | Repository data, claim |
| `messageService.ts` | DMs and conversations |
| `notificationService.ts` | Notification list and mark-read |
| `githubService.ts` | GitHub OAuth + activity |
| `storyService.ts` | Stories CRUD |
| `reelService.ts` | Reels CRUD |
| `analyticsService.ts` | Analytics data |
| `trendingService.ts` | Trending repos/hashtags |
| `snippetService.ts` | Code snippets |
| `aitmService.ts` | AITM checkpoint integration |
| `subscriptionService.ts` | Polar.sh subscription management |
| `storeService.ts` | Creator store items |
| `settingsService.ts` | User settings |
| `adService.ts` / `adCampaignService.ts` | Ads |
| `momentService.ts` | Moments feed |
| `draftService.ts` | Draft posts |
| `locationService.ts` | Location tagging |
| `feedbackService.ts` | User feedback submission |
| `verificationPurchaseService.ts` | Verified badge purchase |

---

## State Management

### Zustand — `store/authStore.ts`
```ts
import { useAuthStore } from '@/store/authStore'
// or via alias:
import { useAuth } from '@/hooks/useAuth'

const { user, isAuthenticated, login, logout } = useAuthStore()
```
Fields: `user`, `isAuthenticated`, `isInitialized`, `pending2FA`, `tempToken`.
`initialize()` is called once in `app/providers.tsx` on mount (reads session from httpOnly cookie).

### TanStack React Query
`QueryClient` created in `app/providers.tsx`. Use `useQuery` / `useMutation` for server data.
Pair with service functions: `useQuery({ queryKey: ['posts'], queryFn: postService.getFeed })`.

---

## Auth Guard

Auth is enforced in `middleware.ts`. Routes not in `publicPaths` redirect to `/login` when unauthenticated. Public paths include: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/pricing`, `/terms`, `/privacy-policy`, `/auth/github/callback`, `/auth/google/callback`.

To make a new route public, add it to the `publicPaths` array in `middleware.ts`.

---

## Adding a New Page

1. Create `app/<route>/page.tsx` with `'use client'` if interactive.
2. Wrap content in `<PageTemplate title="...">` for consistent layout.
3. Fetch data with a service function + `useQuery`.
4. Use CSS variables for all colors — no raw hex values.
5. Add route to `middleware.ts` `publicPaths` only if it must be unauthenticated.

## Adding a New Component

1. Create `components/MyComponent.tsx`.
2. Define a named `interface MyComponentProps`.
3. Export as named export (not default).
4. Use Tailwind + CSS variable classes for dark theme styling.
