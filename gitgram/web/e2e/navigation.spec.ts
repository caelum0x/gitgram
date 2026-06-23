import { test, expect, type Page } from './fixtures/test-fixtures'
import { TEST_USER_LOGIN } from './helpers/test-data'

/**
 * Navigation E2E tests.
 *
 * Covers:
 *   - Landing page renders hero, features, pricing, footer for unauth users
 *   - Public pages (/auth, /pricing, /terms, /privacy-policy) load cleanly
 *   - Navbar logo and authenticated links are visible after login
 *   - Every major sidebar / nav link routes to the correct URL
 *   - 404 page renders for unknown routes without a server error
 *   - Back navigation works after visiting a page
 *
 * Network strategy:
 *   - "mocked" suite uses page.route() for the auth session
 *   - "live" suite hits the real dev server
 */

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'nav-user-1',
  username: 'navtester',
  email: 'navtester@gitgram.test',
  avatar: null,
}

async function mockAuthSession(page: Page) {
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
  // Stub feed so the home page doesn't error
  await page.route('**/api/v1/posts/feed**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ posts: [], pagination: { page: 1, total: 0, pages: 0 } }),
    }),
  )
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    }),
  )
}

async function injectAuthAndGo(page: Page, path: string) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('user', JSON.stringify(user))
  }, MOCK_USER)
  await page.goto(path)
}

// ---------------------------------------------------------------------------
// Public / unauthenticated pages
// ---------------------------------------------------------------------------

test.describe('Public pages (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('landing page loads with hero heading', async ({ landingPage }) => {
    await landingPage.goto()
    await landingPage.expectLandingVisible()
  })

  test('landing page has the correct document title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Gitgram/i)
  })

  test('landing page renders Features, Pricing, CTA, and Footer sections', async ({
    landingPage,
  }) => {
    await landingPage.goto()
    await expect(landingPage.featuresHeading).toBeVisible({ timeout: 8_000 })
    await expect(landingPage.pricingHeading).toBeVisible({ timeout: 8_000 })
    await expect(landingPage.ctaHeading).toBeVisible({ timeout: 8_000 })
    await expect(landingPage.footer).toBeVisible({ timeout: 8_000 })
  })

  test('Get Started Free button links to /register', async ({ landingPage }) => {
    await landingPage.goto()
    await expect(landingPage.getStartedButton).toHaveAttribute('href', '/register')
  })

  test('Sign In button links to /login', async ({ landingPage }) => {
    await landingPage.goto()
    await expect(landingPage.signInButton).toHaveAttribute('href', '/login')
  })

  test('/auth page loads with Gitgram heading', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.getByRole('heading', { name: /Gitgram/i })).toBeVisible({ timeout: 8_000 })
  })

  test('/login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  test('/register page loads', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('/pricing page loads without application error', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL('/pricing')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('/terms page loads without application error', async ({ page }) => {
    await page.goto('/terms')
    await expect(page).toHaveURL('/terms')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('/privacy-policy page loads without application error', async ({ page }) => {
    await page.goto('/privacy-policy')
    await expect(page).toHaveURL('/privacy-policy')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('/about page loads without application error', async ({ page }) => {
    await page.goto('/about')
    await expect(page).toHaveURL('/about')
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ---------------------------------------------------------------------------
// Authenticated navigation — mocked
// ---------------------------------------------------------------------------

test.describe('Authenticated navigation (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthSession(page)
    await injectAuthAndGo(page, '/')
  })

  test('navbar is visible with Gitgram logo link', async ({ homePage }) => {
    await expect(homePage.navbar).toBeVisible({ timeout: 8_000 })
    await expect(homePage.logo).toBeVisible({ timeout: 8_000 })
  })

  test('logo link points to /', async ({ homePage }) => {
    await expect(homePage.logo).toHaveAttribute('href', '/')
  })

  test('shows Messages link in navigation', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /messages/i }),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('shows Notifications link in navigation', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /notifications/i }),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('shows Profile link in navigation', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /profile/i }),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('clicking Notifications link navigates to /notifications', async ({ page }) => {
    const link = page.getByRole('link', { name: /notifications/i }).first()
    await link.click()
    await page.waitForURL(/\/notifications/, { timeout: 8_000 })
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('clicking Messages link navigates to /messages', async ({ page }) => {
    const link = page.getByRole('link', { name: /messages/i }).first()
    await link.click()
    await page.waitForURL(/\/messages/, { timeout: 8_000 })
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('clicking Profile link navigates to /profile', async ({ page }) => {
    const link = page.getByRole('link', { name: /profile/i }).first()
    await link.click()
    await page.waitForURL(/\/profile/, { timeout: 8_000 })
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('browser back button returns to previous page', async ({ page }) => {
    await page.goto('/explore')
    await page.goto('/settings')
    await page.goBack()
    await expect(page).toHaveURL(/\/explore/, { timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Route coverage — mocked (one test per major authenticated route)
// ---------------------------------------------------------------------------

interface RouteCheck {
  path: string
  matchPattern?: RegExp
}

const AUTHENTICATED_ROUTES: RouteCheck[] = [
  { path: '/feed' },
  { path: '/explore' },
  { path: '/create' },
  { path: '/settings' },
  { path: '/notifications' },
  { path: '/profile' },
  { path: '/reels' },
  { path: '/stories' },
  { path: '/trending' },
  { path: '/discover' },
]

test.describe('Authenticated route coverage (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
    await mockAuthSession(page)
  })

  for (const { path, matchPattern } of AUTHENTICATED_ROUTES) {
    test(`${path} loads without application error`, async ({ page }) => {
      await injectAuthAndGo(page, path)

      const expectedUrl = matchPattern ?? new RegExp(path.replace(/\//g, '\\/'))
      await expect(page).toHaveURL(expectedUrl, { timeout: 10_000 })
      await expect(page.locator('body')).not.toContainText('Application error')
      await expect(page.locator('body')).not.toContainText('Internal Server Error')
    })
  }
})

// ---------------------------------------------------------------------------
// 404 / error handling — no auth needed
// ---------------------------------------------------------------------------

test.describe('404 and error handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('unknown route does not show a raw Internal Server Error', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-ever')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  test('unknown route shows a 404-style page or redirects gracefully', async ({ page }) => {
    await page.goto('/absolutely-not-a-real-page-12345')

    const body = page.locator('body')
    // Either it renders a styled 404 page or redirects to login/home
    const content = await body.textContent({ timeout: 8_000 })
    // Should have *some* content and not a blank page
    expect(content?.trim().length).toBeGreaterThan(0)
  })

  test('deeply nested nonexistent path does not crash the app', async ({ page }) => {
    await page.goto('/a/b/c/d/e/f/g/doesnt/exist')
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})

// ---------------------------------------------------------------------------
// Live integration suite
// ---------------------------------------------------------------------------

test.describe('Navigation (live integration)', () => {
  test.beforeEach(async ({ authPage, page }) => {
    await page.context().clearCookies()
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })
  })

  test('authenticated home shows navbar and logo', async ({ homePage }) => {
    await homePage.goto()
    await expect(homePage.navbar).toBeVisible({ timeout: 8_000 })
    await expect(homePage.logo).toBeVisible({ timeout: 8_000 })
  })

  test('navigation shows protected links', async ({ homePage, page }) => {
    await homePage.goto()
    await expect(page.getByRole('link', { name: /messages/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /notifications/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /profile/i })).toBeVisible()
  })

  test('/explore loads without error', async ({ page }) => {
    await page.goto('/explore')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('/settings loads without error', async ({ settingsPage }) => {
    await settingsPage.goto()
    await settingsPage.expectSettingsVisible()
  })

  test('/profile loads without error', async ({ profilePage }) => {
    await profilePage.goto()
    await profilePage.expectProfileLoaded()
  })

  test('/create loads without error', async ({ page }) => {
    await page.goto('/create')
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})
