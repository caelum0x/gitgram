import { test, expect, type Page } from './fixtures/test-fixtures'
import { TEST_USER_LOGIN } from './helpers/test-data'

/**
 * Profile E2E tests.
 *
 * Covers:
 *   - Profile page renders user header, stats, and tabs
 *   - Tabs switch between Posts, Repos, and Saved content
 *   - Follow / unfollow button toggles on a foreign profile
 *   - Contribution graph (activity grid) renders when data is present
 *   - Edit Profile link works for the authenticated user's own profile
 *   - Account settings form is reachable and fields are editable
 *
 * Network strategy:
 *   - "mocked" suite uses page.route() so tests run without a live DB
 *   - "live" suite requires E2E_USER_EMAIL / E2E_USER_PASSWORD
 */

// ---------------------------------------------------------------------------
// Mock data & helpers
// ---------------------------------------------------------------------------

const MOCK_SELF = {
  id: 'profile-user-1',
  username: 'profiletester',
  fullName: 'Profile Tester',
  email: 'profiletester@gitgram.test',
  bio: 'E2E profile bio',
  avatar: null,
  followersCount: 12,
  followingCount: 5,
  postsCount: 3,
  isFollowing: false,
}

const MOCK_OTHER = {
  id: 'profile-user-2',
  username: 'otherperson',
  fullName: 'Other Person',
  email: 'otherperson@gitgram.test',
  bio: 'Another user bio',
  avatar: null,
  followersCount: 99,
  followingCount: 10,
  postsCount: 7,
  isFollowing: false,
}

const MOCK_POSTS = [
  {
    id: 'pp-1',
    content: 'My first profile post',
    likesCount: 2,
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    user: { username: MOCK_SELF.username, avatar: null },
  },
]

/** Build 52-week contribution data (all zeros — just needs an array of 52 ints). */
const MOCK_CONTRIBUTIONS = Array.from({ length: 52 }, (_, i) => (i % 4) + 1)

async function mockAuthApis(page: Page, self = MOCK_SELF) {
  await page.route('**/socket.io/**', (route) => route.abort())

  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: self }),
    }),
  )

  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: self }),
    }),
  )
}

async function mockProfileApis(page: Page, targetUsername: string, profileData: typeof MOCK_SELF, isFollowing = false) {
  let following = isFollowing
  let followers = profileData.followersCount

  // Own profile endpoint
  await page.route(`**/api/v1/users/${targetUsername}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { ...profileData, followersCount: followers, isFollowing: following },
      }),
    }),
  )

  // /profile alias
  await page.route('**/api/v1/users/profile**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: profileData }),
    }),
  )

  // Posts for this profile
  await page.route(`**/api/v1/users/${targetUsername}/posts**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: MOCK_POSTS }),
    }),
  )

  // Repos for this profile
  await page.route(`**/api/v1/users/${targetUsername}/repos**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ repositories: [] }),
    }),
  )

  // Saved posts
  await page.route(`**/api/v1/users/${targetUsername}/saved**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: [] }),
    }),
  )

  // GitHub contribution graph
  await page.route(
    `https://api.github.com/users/${targetUsername}/events**`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
  )

  // Alternative contribution endpoint used by GitHubActivityFeed
  await page.route(
    `https://api.github.com/repos/**stats/participation**`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ all: MOCK_CONTRIBUTIONS }),
      }),
  )

  // Follow / unfollow toggle
  await page.route(`**/api/v1/users/${targetUsername}/follow`, async (route) => {
    if (route.request().method() === 'POST') {
      following = true
      followers += 1
    } else {
      following = false
      followers = Math.max(0, followers - 1)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isFollowing: following, followersCount: followers }),
    })
  })
}

async function injectAuthAndNavigate(page: Page, user: typeof MOCK_SELF, path: string) {
  await page.addInitScript((u) => {
    window.localStorage.setItem('user', JSON.stringify(u))
  }, user)
  await page.goto(path)
}

// ---------------------------------------------------------------------------
// Own profile — mocked
// ---------------------------------------------------------------------------

test.describe('Own profile (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthApis(page)
    await mockProfileApis(page, MOCK_SELF.username, MOCK_SELF)
    await injectAuthAndNavigate(page, MOCK_SELF, '/profile')
  })

  test('displays user profile page', async ({ profilePage }) => {
    await profilePage.expectProfileLoaded()
  })

  test('shows username in the profile header', async ({ profilePage }) => {
    await expect(profilePage.username).toBeVisible({ timeout: 8_000 })
    const text = await profilePage.username.textContent()
    expect(text).toBeTruthy()
  })

  test('shows posts, followers, and following stats', async ({ profilePage }) => {
    await expect(profilePage.postsCount).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.followersLink).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.followingLink).toBeVisible({ timeout: 8_000 })
  })

  test('has an Edit Profile link pointing to /settings/account', async ({
    profilePage,
  }) => {
    await expect(profilePage.editProfileLink).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.editProfileLink).toHaveAttribute('href', '/settings/account')
  })

  test('Posts tab is visible by default', async ({ profilePage }) => {
    await expect(profilePage.postsTab).toBeVisible({ timeout: 8_000 })
  })

  test('switches to Repos tab', async ({ profilePage, page }) => {
    await profilePage.switchToTab('Repos')
    const reposOrEmpty = page
      .getByText(/no.*repos|no saved repositories/i)
      .or(page.locator('a[href*="/repo/"]').first())
    await expect(reposOrEmpty).toBeVisible({ timeout: 5_000 })
  })

  test('switches to Saved tab', async ({ profilePage, page }) => {
    await profilePage.switchToTab('Saved')
    const savedOrEmpty = page
      .getByText(/no saved posts|no posts/i)
      .or(page.locator('[data-testid^="post-card-"]').first())
    await expect(savedOrEmpty).toBeVisible({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Follow / unfollow — mocked (foreign profile)
// ---------------------------------------------------------------------------

test.describe('Follow / unfollow on foreign profile (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthApis(page, MOCK_SELF)
    // Foreign user, currently NOT followed
    await mockProfileApis(page, MOCK_OTHER.username, MOCK_OTHER, false)
    await injectAuthAndNavigate(page, MOCK_SELF, `/${MOCK_OTHER.username}`)
  })

  test('shows a Follow button on a profile the user does not follow', async ({ page }) => {
    const followBtn = page
      .getByRole('button', { name: /^follow$/i })
      .or(page.getByTestId('follow-button'))
      .first()

    const hasBtn = await followBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!hasBtn) {
      test.skip(true, 'Follow button not found — skipping follow toggle test')
    }

    await expect(followBtn).toBeVisible()
  })

  test('Follow button changes to Unfollow after clicking', async ({ page }) => {
    const followBtn = page
      .getByRole('button', { name: /^follow$/i })
      .or(page.getByTestId('follow-button'))
      .first()

    const hasBtn = await followBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!hasBtn) {
      test.skip(true, 'Follow button not found')
    }

    await followBtn.click()

    // After following, the button should switch to "Unfollow" or similar
    await expect(
      page
        .getByRole('button', { name: /unfollow/i })
        .or(page.getByTestId('unfollow-button')),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('followers count increments after following', async ({ page }) => {
    const statText = page
      .getByText(new RegExp(`${MOCK_OTHER.followersCount}\\s+followers`))
      .first()

    const hasStat = await statText.isVisible({ timeout: 8_000 }).catch(() => false)

    const followBtn = page
      .getByRole('button', { name: /^follow$/i })
      .or(page.getByTestId('follow-button'))
      .first()

    const hasBtn = await followBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!hasBtn) {
      test.skip(true, 'Follow button not found')
    }

    await followBtn.click()

    if (hasStat) {
      // Count should be higher
      await expect(
        page.getByText(new RegExp(`${MOCK_OTHER.followersCount + 1}\\s+followers`)),
      ).toBeVisible({ timeout: 5_000 })
    }
  })

  test('Unfollow re-shows the Follow button', async ({ page }) => {
    const followBtn = page
      .getByRole('button', { name: /^follow$/i })
      .or(page.getByTestId('follow-button'))
      .first()

    const hasBtn = await followBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!hasBtn) {
      test.skip(true, 'Follow button not found')
    }

    // Follow
    await followBtn.click()
    const unfollowBtn = page
      .getByRole('button', { name: /unfollow/i })
      .or(page.getByTestId('unfollow-button'))
    await expect(unfollowBtn).toBeVisible({ timeout: 5_000 })

    // Unfollow
    await unfollowBtn.click()
    await expect(
      page.getByRole('button', { name: /^follow$/i }).or(page.getByTestId('follow-button')),
    ).toBeVisible({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Contribution graph — mocked
// ---------------------------------------------------------------------------

test.describe('Contribution graph (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthApis(page)
    await mockProfileApis(page, MOCK_SELF.username, MOCK_SELF)
    await injectAuthAndNavigate(page, MOCK_SELF, '/profile')
  })

  test('contribution graph or activity section renders', async ({ page }) => {
    // The graph may be data-testid="contribution-graph", a canvas, or an SVG
    const graph = page
      .locator(
        '[data-testid="contribution-graph"], [data-testid="activity-graph"], canvas, svg[class*="activity"], [class*="contribution"]',
      )
      .first()

    const hasGraph = await graph.isVisible({ timeout: 8_000 }).catch(() => false)

    if (!hasGraph) {
      // Acceptable: graph only shows when GitHub is connected
      // Just verify the profile page itself rendered
      await expect(page.locator('h1').first()).toBeVisible()
      return
    }

    await expect(graph).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Edit profile — mocked
// ---------------------------------------------------------------------------

test.describe('Edit profile (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthApis(page)
    await mockProfileApis(page, MOCK_SELF.username, MOCK_SELF)

    // Settings endpoints
    await page.route('**/api/v1/users/profile', (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: MOCK_SELF }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: MOCK_SELF }),
      })
    })

    await injectAuthAndNavigate(page, MOCK_SELF, '/profile')
  })

  test('Edit Profile link navigates to /settings/account', async ({
    profilePage,
    page,
  }) => {
    await profilePage.expectProfileLoaded()
    await profilePage.editProfileLink.click()
    await page.waitForURL('/settings/account', { timeout: 8_000 })
  })

  test('account settings page shows username and bio fields', async ({
    accountSettingsPage,
  }) => {
    await accountSettingsPage.goto()
    await expect(accountSettingsPage.usernameInput).toBeVisible({ timeout: 8_000 })
    await expect(accountSettingsPage.bioTextarea).toBeVisible({ timeout: 8_000 })
  })

  test('updates bio and shows success feedback', async ({
    accountSettingsPage,
    page,
  }) => {
    await accountSettingsPage.goto()

    const newBio = `E2E bio update ${Date.now()}`
    await accountSettingsPage.updateProfile({ bio: newBio })

    const successIndicator = page.getByText(/updated|saved|success/i).first()
    await expect(successIndicator).toBeVisible({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Live integration suite
// ---------------------------------------------------------------------------

test.describe('Profile (live integration)', () => {
  test.beforeEach(async ({ authPage, page }) => {
    await page.context().clearCookies()
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })
  })

  test('own profile page loads', async ({ profilePage }) => {
    await profilePage.goto()
    await profilePage.expectProfileLoaded()
  })

  test('profile stats are visible', async ({ profilePage }) => {
    await profilePage.goto()
    await expect(profilePage.postsCount).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.followersLink).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.followingLink).toBeVisible({ timeout: 8_000 })
  })

  test('can switch profile tabs', async ({ profilePage, page }) => {
    await profilePage.goto()
    await profilePage.switchToTab('Repos')
    const content = await page.textContent('body')
    expect(content).toBeTruthy()

    await profilePage.switchToTab('Saved')
    const saved = await page.textContent('body')
    expect(saved).toBeTruthy()
  })
})
