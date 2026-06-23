import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the settings page (/settings).
 *
 * Shows a list of setting sections (Account, Privacy, Notifications, etc.)
 * and a Log Out button.
 */
export class SettingsPage {
  readonly page: Page

  // Page heading
  readonly heading: Locator

  // Section links
  readonly accountLink: Locator
  readonly privacyLink: Locator
  readonly notificationsLink: Locator
  readonly securityLink: Locator

  // Logout button
  readonly logoutButton: Locator

  constructor(page: Page) {
    this.page = page

    this.heading = page.getByRole('heading', { name: 'Settings' })

    this.accountLink = page.getByRole('link', { name: /Account/ })
    this.privacyLink = page.getByRole('link', { name: /Privacy/ })
    this.notificationsLink = page.getByRole('link', { name: /Notifications/ })
    this.securityLink = page.getByRole('link', { name: /Security/ })

    this.logoutButton = page.getByRole('button', { name: 'Log Out' })
  }

  async goto() {
    await this.page.goto('/settings')
  }

  async expectSettingsVisible() {
    await expect(this.heading).toBeVisible()
    await expect(this.logoutButton).toBeVisible()
  }

  async logout() {
    await this.logoutButton.click()
  }
}
