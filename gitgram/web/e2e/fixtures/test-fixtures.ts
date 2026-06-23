import { test as base } from '@playwright/test'
import {
  AuthPage,
  LandingPage,
  HomePage,
  ProfilePage,
  SearchPage,
  SettingsPage,
  AccountSettingsPage,
} from '../pages'

/**
 * Extended Playwright test fixture that pre-instantiates Page Objects.
 *
 * Usage in test files:
 *   import { test, expect } from '../fixtures/test-fixtures'
 *
 *   test('example', async ({ authPage, homePage }) => {
 *     await authPage.goto()
 *     // ...
 *   })
 */
interface GitgramFixtures {
  authPage: AuthPage
  landingPage: LandingPage
  homePage: HomePage
  profilePage: ProfilePage
  searchPage: SearchPage
  settingsPage: SettingsPage
  accountSettingsPage: AccountSettingsPage
}

export const test = base.extend<GitgramFixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page))
  },

  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page))
  },

  homePage: async ({ page }, use) => {
    await use(new HomePage(page))
  },

  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page))
  },

  searchPage: async ({ page }, use) => {
    await use(new SearchPage(page))
  },

  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page))
  },

  accountSettingsPage: async ({ page }, use) => {
    await use(new AccountSettingsPage(page))
  },
})

export { expect } from '@playwright/test'
