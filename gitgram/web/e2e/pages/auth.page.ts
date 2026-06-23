import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the /auth page.
 *
 * The auth page has a toggle between Login and Register tabs,
 * shared email/password fields, and a username field visible only
 * in Register mode.
 */
export class AuthPage {
  readonly page: Page

  // Tab buttons
  readonly loginTab: Locator
  readonly registerTab: Locator

  // Form fields
  readonly usernameInput: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator

  // Submit
  readonly submitButton: Locator

  // Title
  readonly heading: Locator

  constructor(page: Page) {
    this.page = page

    // The tab buttons contain the text "Login" and "Register"
    this.loginTab = page.getByRole('button', { name: 'Login' }).first()
    this.registerTab = page.getByRole('button', { name: 'Register' })

    // Labels are "Username", "Email", "Password"
    this.usernameInput = page.getByLabel('Username')
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')

    // Submit button text changes based on tab
    this.submitButton = page.locator('form').getByRole('button', {
      name: /Login|Create Account/,
    })

    this.heading = page.getByRole('heading', { name: 'Gitgram' })
  }

  async goto() {
    await this.page.goto('/auth')
  }

  /** Switch to the Register tab */
  async switchToRegister() {
    await this.registerTab.click()
    await expect(this.usernameInput).toBeVisible()
  }

  /** Switch to the Login tab */
  async switchToLogin() {
    await this.loginTab.click()
    await expect(this.usernameInput).not.toBeVisible()
  }

  /** Fill and submit the login form */
  async login(email: string, password: string) {
    await this.switchToLogin()
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  /** Fill and submit the registration form */
  async register(username: string, email: string, password: string) {
    await this.switchToRegister()
    await this.usernameInput.fill(username)
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
