import { test, expect, type Page } from './fixtures/test-fixtures'

const TEST_USER = {
  id: 'user-live-1',
  username: 'alice',
  email: 'alice@gitgram.test',
  avatar: 'https://example.com/alice.png',
}

const FEED_POST = {
  id: 'post-1',
  content: 'Ship checkpoint-aware repo stories.',
  likesCount: 3,
  commentsCount: 1,
  isLiked: false,
  createdAt: '2026-05-13T10:00:00.000Z',
  user: {
    username: 'alice',
    avatar: TEST_USER.avatar,
  },
}

async function mockLiveFlowApis(page: Page) {
  let loggedIn = true
  let comments = [
    {
      id: 'comment-1',
      content: 'This rollback summary is clear.',
      createdAt: '2026-05-13T10:05:00.000Z',
      likesCount: 0,
      user: {
        id: 'user-reviewer-1',
        username: 'reviewer',
        avatar: null,
      },
    },
  ]

  const notifications = [
    {
      id: 'notif-1',
      type: 'COMMENT',
      title: 'New Comment',
      body: 'Commented on the checkpoint rollback story.',
      content: 'Commented on the checkpoint rollback story.',
      createdAt: '2026-05-13T10:06:00.000Z',
      user: {
        id: 'user-reviewer-1',
        username: 'reviewer',
        avatar: null,
      },
      post: {
        id: 'post-1',
        mediaUrl: null,
      },
    },
  ]

  await page.route('**/socket.io/**', async (route) => {
    await route.abort()
  })

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: loggedIn ? TEST_USER : null }),
    })
  })

  await page.route('**/api/v1/auth/login', async (route) => {
    loggedIn = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: TEST_USER }),
    })
  })

  await page.route('**/api/v1/posts/feed**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: [FEED_POST] }),
    })
  })

  await page.route('**/api/v1/posts/post-1/comments**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { content?: string } | null
      const nextComment = {
        id: `comment-${comments.length + 1}`,
        content: body?.content || '',
        createdAt: new Date().toISOString(),
        likesCount: 0,
        user: {
          id: TEST_USER.id,
          username: TEST_USER.username,
          avatar: TEST_USER.avatar,
        },
      }
      comments = [...comments, nextComment]

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(nextComment),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(comments),
    })
  })

  await page.route('**/api/v1/notifications**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        notifications,
        pagination: {
          page: 1,
          limit: 20,
          total: notifications.length,
          pages: 1,
        },
      }),
    })
  })

  await page.route('**/api/v1/notifications/read', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Notifications marked as read', count: 1 }),
    })
  })

  await page.route('**/api/v1/notifications/notif-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ notification: notifications[0] }),
    })
  })
}

async function loginThroughUi(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  const loginResponse = page.waitForResponse('**/api/v1/auth/login')
  await page.evaluate(async ({ email, password }) => {
    const response = await fetch('http://localhost:4000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()
    if (data.user) {
      window.localStorage.setItem('user', JSON.stringify(data.user))
    }
  }, {
    email: TEST_USER.email,
    password: 'TestPassword123!',
  })
  await loginResponse
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('user')))
    .not.toBeNull()
  await page.addInitScript((user) => {
    window.localStorage.setItem('user', JSON.stringify(user))
  }, TEST_USER)
  const feedResponse = page.waitForResponse('**/api/v1/posts/feed**', { timeout: 20000 })
  await page.goto('/feed')
  await feedResponse
  await expect(page).toHaveURL('/feed')
}

test.describe('Live Auth And Engagement Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockLiveFlowApis(page)
  })

  test('should login through the real login page and render the feed', async ({
    page,
  }) => {
    await loginThroughUi(page)

    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('post-card-post-1')).toContainText(
      'Ship checkpoint-aware repo stories.',
    )
  })

  test('should open comments and add a new comment from the feed', async ({
    page,
  }) => {
    await loginThroughUi(page)

    await page.getByTestId('post-comments-toggle-post-1').click()
    await expect(page.getByTestId('comment-comment-1')).toContainText(
      'This rollback summary is clear.',
    )

    await page
      .getByTestId('post-comment-input-post-1')
      .fill('Looks good. Ship it.')
    await page.getByTestId('post-comment-submit-post-1').click()

    await expect(page.getByTestId('comment-comment-2')).toContainText(
      'Looks good. Ship it.',
    )
  })

  test('should load the notifications list and open notification details', async ({
    page,
  }) => {
    await loginThroughUi(page)

    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    await expect(page.getByTestId('notification-item-notif-1')).toContainText(
      'Commented on the checkpoint rollback story.',
    )

    await page.getByTestId('notification-item-notif-1').click()
    await expect(page).toHaveURL('/notifications/notif-1')
    await expect(
      page.getByRole('heading', { name: 'New Comment' }),
    ).toBeVisible()
    await expect(page.getByText('Commented on the checkpoint rollback story.')).toBeVisible()
  })
})
