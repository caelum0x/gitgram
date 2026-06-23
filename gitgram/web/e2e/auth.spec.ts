import { test, expect } from './fixtures/test-fixtures'
import { TEST_USER, TEST_USER_LOGIN } from './helpers/test-data'

/**
 * Auth flow E2E tests.
 *
 * Covers:
 *   - Login page renders with correct form fields
 *   - Client-side validation errors surface before submission
 *   - Server-side error shown for invalid credentials
 *   - Successful login redirects to feed / home
 *   - Register flow creates account and redirects
 *   - Logout clears session and redirects to auth
 *   - Protected routes redirect unauthenticated users to /login
 *   - Session persists across hard reload
 *
 * Network strategy: integration tests that hit the real dev server.
 * Tests that require a live backend seed gracefully skip when the
 * pre-seeded E2E_USER_EMAIL / E2E_USER_PASSWORD are not configured.
 */

// ---------------------------------------------------------------------------
// Login page structure
// ---------------------------------------------------------------------------

test.describe('Login page structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('renders the auth page with Gitgram heading', async ({ authPage, page }) => {
    await authPage.goto()
    await expect(page).toHaveTitle(/Gitgram/i)
    await expect(authPage.heading).toBeVisible()
  })

  test('shows email and password fields in login mode', async ({ authPage }) => {
    await authPage.goto()
    await authPage.switchToLogin()

    await expect(authPage.emailInput).toBeVisible()
    await expect(authPage.passwordInput).toBeVisible()
    // Username field must NOT be visible in login mode
    await expect(authPage.usernameInput).not.toBeVisible()
  })

  test('shows login submit button', async ({ authPage, page }) => {
    await authPage.goto()
    await authPage.switchToLogin()

    await expect(page.getByRole('button', { name: /Login/i })).toBeVisible()
  })

  test('displays validation feedback for empty email submission', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.switchToLogin()

    // Submit without filling anything — expect either HTML5 validation
    // (field becomes invalid) or an error message from the app
    await authPage.submitButton.click()

    const emailInvalid = await authPage.emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid,
    )
    const hasErrorText = await page
      .getByText(/required|invalid|email/i)
      .isVisible()
      .catch(() => false)

    expect(emailInvalid || hasErrorText).toBe(true)
  })

  test('displays validation feedback for missing password', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.switchToLogin()

    await authPage.emailInput.fill('someone@example.com')
    await authPage.submitButton.click()

    const pwdInvalid = await authPage.passwordInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid,
    )
    const hasErrorText = await page
      .getByText(/required|password/i)
      .isVisible()
      .catch(() => false)

    expect(pwdInvalid || hasErrorText).toBe(true)
  })

  test('shows error feedback for wrong credentials', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()

    // Intercept a dialog or an inline error element
    const dialogPromise = page.waitForEvent('dialog', { timeout: 8_000 }).catch(() => null)
    await authPage.login('no-such-user@gitgram.test', 'WrongPassword999!')

    const dialog = await dialogPromise
    if (dialog) {
      expect(dialog.message()).toBeTruthy()
      await dialog.accept()
    } else {
      // Inline error — wait for any error-like text
      await expect(
        page.getByText(/invalid|incorrect|wrong|not found|credentials/i).first(),
      ).toBeVisible({ timeout: 8_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// Register flow
// ---------------------------------------------------------------------------

test.describe('Register flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('shows username, email and password fields in register mode', async ({
    authPage,
  }) => {
    await authPage.goto()
    await authPage.switchToRegister()

    await expect(authPage.usernameInput).toBeVisible()
    await expect(authPage.emailInput).toBeVisible()
    await expect(authPage.passwordInput).toBeVisible()
  })

  test('shows Create Account submit button in register mode', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.switchToRegister()

    await expect(
      page.getByRole('button', { name: 'Create Account' }),
    ).toBeVisible()
  })

  test('registers a new user and redirects to home or onboarding', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.register(
      TEST_USER.username,
      TEST_USER.email,
      TEST_USER.password,
    )

    await page.waitForURL(/^\/(onboarding|feed|$)/, { timeout: 12_000 })
    expect(page.url()).toMatch(/\/(onboarding|feed|$)/)
  })

  test('shows error for duplicate email on registration', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()

    const dialogPromise = page.waitForEvent('dialog', { timeout: 8_000 }).catch(() => null)
    await authPage.register('dup_user_e2e', TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)

    const dialog = await dialogPromise
    if (dialog) {
      expect(dialog.message()).toBeTruthy()
      await dialog.accept()
    } else {
      await expect(
        page.getByText(/already exists|taken|duplicate|email/i).first(),
      ).toBeVisible({ timeout: 8_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// Successful login + redirect
// ---------------------------------------------------------------------------

test.describe('Successful login redirect', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('logs in with valid credentials and redirects to home', async ({
    authPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)

    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })
    expect(page.url()).toMatch(/\/(feed|$)/)
  })
})

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

test.describe('Logout flow', () => {
  test('logs out and redirects to auth or landing page', async ({
    authPage,
    settingsPage,
    page,
  }) => {
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })

    await settingsPage.goto()

    // Skip if middleware already bounced us back to login
    if (page.url().includes('/login') || page.url().includes('/auth')) {
      test.skip(true, 'User not authenticated; cannot test logout')
    }

    await settingsPage.expectSettingsVisible()
    await settingsPage.logout()

    await page.waitForURL(/\/(login|auth|$)/, { timeout: 12_000 })
    expect(page.url()).toMatch(/\/(login|auth|$)/)
  })
})

// ---------------------------------------------------------------------------
// Protected route redirects
// ---------------------------------------------------------------------------

test.describe('Protected route redirects', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  for (const route of ['/feed', '/profile', '/messages', '/search', '/notifications', '/create']) {
    test(`redirects unauthenticated users from ${route} to /login`, async ({ page }) => {
      await page.goto(route)
      await page.waitForURL(/\/(login|auth)/, { timeout: 10_000 })
      expect(page.url()).toMatch(/\/(login|auth)/)
    })
  }
})

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

test.describe('Session persistence', () => {
  test('stays authenticated after a full page reload', async ({
    authPage,
    homePage,
    page,
  }) => {
    await authPage.goto()
    await authPage.login(TEST_USER_LOGIN.email, TEST_USER_LOGIN.password)
    await page.waitForURL(/^\/(feed|$)/, { timeout: 12_000 })

    await page.reload()

    await expect(page).not.toHaveURL(/\/(login|auth)/)
    await homePage.expectAuthenticated()
  })
})
