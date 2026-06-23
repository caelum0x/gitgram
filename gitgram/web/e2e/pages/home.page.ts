import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the authenticated home page (/).
 *
 * When logged in, the home page shows:
 *   - Navigation bar with Gitgram logo
 *   - CreatePost composer
 *   - Feed with posts
 */
export class HomePage {
  readonly page: Page

  // Navigation
  readonly navbar: Locator
  readonly logo: Locator
  readonly searchInput: Locator

  // CreatePost composer
  readonly postTextarea: Locator
  readonly postButton: Locator

  // Feed
  readonly feedContainer: Locator

  constructor(page: Page) {
    this.page = page

    this.navbar = page.locator('nav')
    this.logo = page.getByRole('link', { name: 'Gitgram' }).first()
    this.searchInput = page.getByPlaceholder('Search or paste GitHub URL...')

    // CreatePost textarea
    this.postTextarea = page.getByPlaceholder(
      'Share your code, progress, or thoughts...',
    )

    // Post submit button in the composer
    this.postButton = page
      .locator('.bg-surface, [class*="bg-surface"]')
      .getByRole('button', { name: 'Post' })

    // The feed is a series of post cards
    this.feedContainer = page.locator('.space-y-6').first()
  }

  async goto() {
    await this.page.goto('/')
  }

  /** Check that the authenticated home page is displayed */
  async expectAuthenticated() {
    await expect(this.navbar).toBeVisible()
    await expect(this.postTextarea).toBeVisible()
  }

  /** Create a new post from the home page composer */
  async createPost(content: string) {
    await this.postTextarea.fill(content)
    await this.postButton.click()
  }

  /** Search using the navigation search bar */
  async search(query: string) {
    await this.searchInput.fill(query)
    await this.searchInput.press('Enter')
  }

  /** Get all visible post cards in the feed */
  getPostCards() {
    return this.page.locator(
      '.bg-white.dark\\:bg-gray-800.rounded-lg, [class*="bg-card"][class*="rounded-lg"]',
    )
  }
}
