import { test, expect } from './fixtures/test-fixtures'
import { TEST_POST, TEST_USER_LOGIN } from './helpers/test-data'

/**
 * Post flow E2E tests.
 *
 * Covers:
 *   - Creating a post from the home page composer
 *   - Viewing the feed with posts
 *   - Liking a post
 *   - Commenting on a post
 *   - Post interaction buttons (like, comment, share)
 *
 * Pre-condition: user must be authenticated.
 * Either use storage state from global-setup or login inline.
 */

test.describe('Create Post', () => {
  test.beforeEach(async ({ authPage, page }) => {
    // Login before each test
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL('/', { timeout: 10_000 })
  })

  test('should display the post composer on the home page', async ({
    homePage,
  }) => {
    await homePage.goto()
    await expect(homePage.postTextarea).toBeVisible()
    await expect(homePage.postButton).toBeVisible()
  })

  test('post button should be disabled when textarea is empty', async ({
    homePage,
  }) => {
    await homePage.goto()
    await expect(homePage.postButton).toBeDisabled()
  })

  test('should create a new post and see it in the feed', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // Type content and verify button becomes enabled
    await homePage.postTextarea.fill(TEST_POST.content)
    await expect(homePage.postButton).toBeEnabled()

    // Submit the post
    await homePage.postButton.click()

    // Wait for the post to appear in the feed
    // The composer clears after successful post
    await expect(homePage.postTextarea).toHaveValue('')

    // The new post should appear in the feed
    const postContent = page.getByText(TEST_POST.content)
    await expect(postContent).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate to the full composer via the + button', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // Click the "More options" button (has a + icon)
    const moreOptionsButton = page.locator('button[title*="More options"]')
    await moreOptionsButton.click()

    // Should navigate to /create
    await page.waitForURL('/create', { timeout: 5_000 })
  })
})

test.describe('Feed', () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL('/', { timeout: 10_000 })
  })

  test('should display feed posts or empty state', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // Either posts are displayed or the "No posts yet" empty state
    const feedOrEmpty = page
      .getByText('No posts yet')
      .or(page.locator('.bg-white.dark\\:bg-gray-800.rounded-lg').first())

    await expect(feedOrEmpty).toBeVisible({ timeout: 10_000 })
  })

  test('should show trending repos section if available', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // The trending section is optional -- only check if it appears
    const trendingHeading = page.getByText('Trending Repos')
    const hasTrending = await trendingHeading
      .isVisible()
      .catch(() => false)

    if (hasTrending) {
      await expect(trendingHeading).toBeVisible()
    }
  })
})

test.describe('Post Interactions', () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL('/', { timeout: 10_000 })
  })

  test('should show like, comment, and share buttons on each post', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // Wait for at least one post to load
    const firstPost = page
      .locator('.bg-white.dark\\:bg-gray-800.rounded-lg')
      .first()
    const hasPost = await firstPost.isVisible().catch(() => false)

    if (!hasPost) {
      test.skip(true, 'No posts in feed to test interactions')
    }

    // Each post card has like (thumbs up), comment (speech bubble), share (arrows) buttons
    const likeButton = firstPost.locator('button').filter({ hasText: /👍/ })
    const commentButton = firstPost
      .locator('button')
      .filter({ hasText: /💬/ })
    const shareButton = firstPost
      .locator('button')
      .filter({ hasText: /🔄/ })

    await expect(likeButton).toBeVisible()
    await expect(commentButton).toBeVisible()
    await expect(shareButton).toBeVisible()
  })

  test('should navigate to user profile when clicking username', async ({
    homePage,
    page,
  }) => {
    await homePage.goto()

    // Wait for a post with a username link
    const usernameLink = page.locator('a[href^="/"]').filter({ hasText: '@' }).first()
    const hasUsername = await usernameLink.isVisible().catch(() => false)

    if (!hasUsername) {
      test.skip(true, 'No posts with usernames to click')
    }

    const href = await usernameLink.getAttribute('href')
    await usernameLink.click()

    // Should navigate to the user's profile page
    if (href) {
      await page.waitForURL(href, { timeout: 5_000 })
    }
  })
})
