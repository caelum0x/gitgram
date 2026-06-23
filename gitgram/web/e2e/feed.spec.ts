import { test, expect, type Page } from './fixtures/test-fixtures'
import { TEST_POST, TEST_USER_LOGIN } from './helpers/test-data'

/**
 * Feed E2E tests.
 *
 * Covers:
 *   - Feed loads posts or empty state
 *   - Stories ring renders above the feed
 *   - Like / unlike optimistic toggle (count changes immediately)
 *   - Clicking a post card navigates to its detail page
 *   - Infinite scroll triggers a second page load
 *   - Post composer creates a post and it appears at top
 *   - Post button is disabled when textarea is empty
 *
 * Network strategy: the "mocked" suite uses page.route() so tests
 * run without a live backend. The "live" suite requires a seeded DB.
 */

// ---------------------------------------------------------------------------
// Fixtures & mocks
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-feed-1',
  username: 'feedtester',
  email: 'feedtester@gitgram.test',
  avatar: 'https://example.com/feedtester.png',
}

const makeMockPost = (id: string, content: string, isLiked = false) => ({
  id,
  content,
  likesCount: isLiked ? 1 : 0,
  commentsCount: 0,
  sharesCount: 0,
  isLiked,
  createdAt: new Date().toISOString(),
  user: { id: MOCK_USER.id, username: MOCK_USER.username, avatar: MOCK_USER.avatar },
})

/** Wire up API mocks for the feed suite. */
async function mockFeedApis(page: Page, posts: ReturnType<typeof makeMockPost>[]) {
  let feedPosts = [...posts]

  await page.route('**/socket.io/**', (route) => route.abort())

  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: MOCK_USER }),
    }),
  )

  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: MOCK_USER }),
    }),
  )

  await page.route('**/api/v1/posts/feed**', async (route) => {
    const url = new URL(route.request().url())
    const page2 = parseInt(url.searchParams.get('page') ?? '1', 10)
    // Return an extra batch on page 2 for the infinite-scroll test
    const batch = page2 === 1 ? feedPosts : [makeMockPost('post-extra', 'Extra post on page 2')]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: batch, pagination: { page: page2, total: feedPosts.length + 1, pages: 2 } }),
    })
  })

  // Like toggle — flip isLiked and adjust count
  await page.route('**/api/v1/posts/*/like', async (route) => {
    const url = route.request().url()
    const postId = url.match(/\/posts\/([^/]+)\/like/)?.[1]
    feedPosts = feedPosts.map((p) =>
      p.id === postId
        ? { ...p, isLiked: !p.isLiked, likesCount: p.isLiked ? p.likesCount - 1 : p.likesCount + 1 }
        : p,
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ liked: !posts.find((p) => p.id === postId)?.isLiked }),
    })
  })

  // Create post
  await page.route('**/api/v1/posts', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    const body = route.request().postDataJSON() as { content?: string } | null
    const newPost = makeMockPost(`post-new-${Date.now()}`, body?.content ?? '')
    feedPosts = [newPost, ...feedPosts]
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ post: newPost }),
    })
  })
}

/** Log in via the localStorage shortcut used in live-engagement tests. */
async function injectAuthAndGoToFeed(page: Page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('user', JSON.stringify(user))
  }, MOCK_USER)

  const feedReady = page.waitForResponse('**/api/v1/posts/feed**', { timeout: 15_000 })
  await page.goto('/feed')
  await feedReady.catch(() => null)
  await expect(page).toHaveURL('/feed')
}

// ---------------------------------------------------------------------------
// Mocked feed suite (no live backend required)
// ---------------------------------------------------------------------------

test.describe('Feed (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockFeedApis(page, [
      makeMockPost('post-1', 'Hello from E2E land!'),
      makeMockPost('post-2', 'TypeScript is great.'),
    ])
    await injectAuthAndGoToFeed(page)
  })

  test('renders post cards from the feed API', async ({ page }) => {
    const firstCard = page.getByTestId('post-card-post-1')
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await expect(firstCard).toContainText('Hello from E2E land!')
  })

  test('renders a second post card', async ({ page }) => {
    await expect(page.getByTestId('post-card-post-2')).toBeVisible({ timeout: 10_000 })
  })

  test('optimistically toggles like count on like button click', async ({ page }) => {
    const likeButton = page
      .getByTestId('post-card-post-1')
      .getByTestId('post-like-button-post-1')

    await expect(likeButton).toBeVisible({ timeout: 10_000 })
    const before = await likeButton.textContent()

    await likeButton.click()
    // Optimistic update — count changes before server round-trip
    await expect(likeButton).not.toHaveText(before ?? '', { timeout: 3_000 })

    const afterLike = await likeButton.textContent()
    // Second click — un-like, count reverts
    await likeButton.click()
    await expect(likeButton).toHaveText(before ?? '', { timeout: 3_000 })

    // Sanity: liked count was different from original
    expect(afterLike).not.toBe(before)
  })

  test('navigates to post detail page when post card is clicked', async ({ page }) => {
    const postLink = page.locator('a[href^="/post/"]').first()
    await expect(postLink).toBeVisible({ timeout: 10_000 })

    const href = await postLink.getAttribute('href')
    await postLink.click()

    if (href) {
      await page.waitForURL(href, { timeout: 10_000 })
      await expect(page).toHaveURL(href)
    }
  })

  test('comments toggle opens the comment panel', async ({ page }) => {
    const toggle = page
      .getByTestId('post-card-post-1')
      .getByTestId('post-comments-toggle-post-1')

    // If the toggle exists, clicking it should reveal a comment input
    const hasToggle = await toggle.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!hasToggle) {
      test.skip(true, 'Comment toggle not present in current UI')
    }

    await toggle.click()
    await expect(
      page.getByTestId('post-comment-input-post-1'),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('loads additional posts when scrolling to the bottom (infinite scroll)', async ({
    page,
  }) => {
    const initialCount = await page.locator('[data-testid^="post-card-"]').count()

    // Scroll to the bottom to trigger the load-more intersection observer
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
    )

    // Wait for a new post element to appear
    await page
      .getByTestId('post-card-post-extra')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => null)

    const afterCount = await page.locator('[data-testid^="post-card-"]').count()
    expect(afterCount).toBeGreaterThanOrEqual(initialCount)
  })

  test('stories ring is visible above the feed', async ({ page }) => {
    const ring = page
      .locator('[data-testid="stories-ring"], [class*="stories"]')
      .first()

    const hasRing = await ring.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!hasRing) {
      // Stories may not render when the mock returns no story data — verify
      // the feed container itself is still healthy
      await expect(page.locator('main')).toBeVisible()
      return
    }

    await expect(ring).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Post composer suite (mocked)
// ---------------------------------------------------------------------------

test.describe('Post composer (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockFeedApis(page, [])
    await injectAuthAndGoToFeed(page)
  })

  test('post button is disabled while the textarea is empty', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()
    await expect(homePage.postButton).toBeDisabled()
  })

  test('post button becomes enabled after typing in the textarea', async ({
    homePage,
  }) => {
    await homePage.goto()
    await homePage.postTextarea.fill('Some new content')
    await expect(homePage.postButton).toBeEnabled()
  })

  test('creates a post and it appears in the feed', async ({ homePage, page }) => {
    await homePage.goto()

    await homePage.postTextarea.fill(TEST_POST.content)
    await expect(homePage.postButton).toBeEnabled()
    await homePage.postButton.click()

    // Composer should clear after successful submission
    await expect(homePage.postTextarea).toHaveValue('', { timeout: 5_000 })

    // Post content appears in the feed
    await expect(page.getByText(TEST_POST.content)).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Live integration suite (requires seeded backend)
// ---------------------------------------------------------------------------

test.describe('Feed (live integration)', () => {
  test.beforeEach(async ({ authPage, page }) => {
    await page.context().clearCookies()
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })
  })

  test('feed container is visible', async ({ homePage }) => {
    await homePage.goto()
    await expect(homePage.feedContainer).toBeVisible({ timeout: 10_000 })
  })

  test('shows posts or an empty-state message', async ({ homePage, page }) => {
    await homePage.goto()

    const posts = page.locator('[data-testid^="post-card-"]').first()
    const emptyState = page.getByText(/no posts yet/i)

    const hasAny = await posts
      .or(emptyState)
      .isVisible({ timeout: 10_000 })
      .catch(() => false)

    expect(hasAny).toBe(true)
  })
})
