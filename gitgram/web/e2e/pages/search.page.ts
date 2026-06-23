import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the search page (/search).
 *
 * Features a search input, tabs (repos, people, posts, hashtags),
 * advanced filters, and result lists.
 */
export class SearchPage {
  readonly page: Page

  // Search input (the main search field on /search)
  readonly searchInput: Locator

  // Tabs
  readonly reposTab: Locator
  readonly peopleTab: Locator
  readonly postsTab: Locator
  readonly hashtagsTab: Locator

  // Filter toggle
  readonly filterToggle: Locator

  // Results container
  readonly resultsArea: Locator

  constructor(page: Page) {
    this.page = page

    // The search page has its own input distinct from the navbar search
    this.searchInput = page
      .getByRole('textbox')
      .filter({ hasText: '' })
      .first()

    // Tab text
    this.reposTab = page.getByRole('button', { name: /repos/i }).first()
    this.peopleTab = page.getByRole('button', { name: /people/i }).first()
    this.postsTab = page.getByRole('button', { name: /posts/i }).first()
    this.hashtagsTab = page
      .getByRole('button', { name: /hashtags/i })
      .first()

    this.filterToggle = page.getByRole('button', { name: /filter/i }).first()

    this.resultsArea = page.locator('main, [class*="max-w"]').first()
  }

  async goto() {
    await this.page.goto('/search')
  }

  async search(query: string) {
    await this.searchInput.fill(query)
    await this.searchInput.press('Enter')
  }

  async switchTab(tab: 'repos' | 'people' | 'posts' | 'hashtags') {
    switch (tab) {
      case 'repos':
        await this.reposTab.click()
        break
      case 'people':
        await this.peopleTab.click()
        break
      case 'posts':
        await this.postsTab.click()
        break
      case 'hashtags':
        await this.hashtagsTab.click()
        break
    }
  }
}
