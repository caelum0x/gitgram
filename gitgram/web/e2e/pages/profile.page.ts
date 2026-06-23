import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the profile page (/profile).
 *
 * Shows user avatar, stats (posts, followers, following),
 * tabs (Posts, Repos, Saved), and an Edit Profile link.
 */
export class ProfilePage {
  readonly page: Page

  // Profile header
  readonly username: Locator
  readonly editProfileLink: Locator
  readonly bio: Locator

  // Stats
  readonly postsCount: Locator
  readonly followersLink: Locator
  readonly followingLink: Locator

  // Tabs
  readonly postsTab: Locator
  readonly reposTab: Locator
  readonly savedTab: Locator

  constructor(page: Page) {
    this.page = page

    // The username is an h1 heading
    this.username = page.getByRole('heading', { level: 1 })

    // "Edit Profile" links to /settings/account
    this.editProfileLink = page.getByRole('link', { name: 'Edit Profile' })

    // Bio text
    this.bio = page.locator('.whitespace-pre-wrap')

    // Stats are shown as "<number> posts/followers/following"
    this.postsCount = page.getByText(/\d+\s+posts/)
    this.followersLink = page.getByText(/\d+\s+followers/)
    this.followingLink = page.getByText(/\d+\s+following/)

    // Tab buttons
    this.postsTab = page.getByRole('button', { name: 'Posts' })
    this.reposTab = page.getByRole('button', { name: 'Repos' })
    this.savedTab = page.getByRole('button', { name: 'Saved' })
  }

  async goto() {
    await this.page.goto('/profile')
  }

  async expectProfileLoaded() {
    await expect(this.username).toBeVisible()
    await expect(this.editProfileLink).toBeVisible()
  }

  async switchToTab(tab: 'Posts' | 'Repos' | 'Saved') {
    switch (tab) {
      case 'Posts':
        await this.postsTab.click()
        break
      case 'Repos':
        await this.reposTab.click()
        break
      case 'Saved':
        await this.savedTab.click()
        break
    }
  }
}
