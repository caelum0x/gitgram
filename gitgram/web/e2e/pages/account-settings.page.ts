import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the account settings page (/settings/account).
 *
 * Allows editing username, bio, and notification preferences.
 */
export class AccountSettingsPage {
  readonly page: Page

  // Form fields
  readonly usernameInput: Locator
  readonly bioTextarea: Locator

  // Save button
  readonly saveButton: Locator

  // GitHub connection
  readonly connectGithubButton: Locator

  constructor(page: Page) {
    this.page = page

    this.usernameInput = page.getByLabel(/username/i).first()
    this.bioTextarea = page.getByLabel(/bio/i).first()

    this.saveButton = page
      .getByRole('button', { name: /save/i })
      .first()

    this.connectGithubButton = page
      .getByRole('button', { name: /connect.*github/i })
      .first()
  }

  async goto() {
    await this.page.goto('/settings/account')
  }

  async updateProfile(fields: { username?: string; bio?: string }) {
    if (fields.username !== undefined) {
      await this.usernameInput.clear()
      await this.usernameInput.fill(fields.username)
    }
    if (fields.bio !== undefined) {
      await this.bioTextarea.clear()
      await this.bioTextarea.fill(fields.bio)
    }
    await this.saveButton.click()
  }
}
