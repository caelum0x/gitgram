import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Page Object for the unauthenticated landing page (/).
 *
 * Shows hero section, features, pricing preview, and CTA.
 */
export class LandingPage {
  readonly page: Page

  // Hero
  readonly heroHeading: Locator
  readonly getStartedButton: Locator
  readonly signInButton: Locator

  // Features section
  readonly featuresHeading: Locator

  // Pricing section
  readonly pricingHeading: Locator

  // CTA section
  readonly ctaHeading: Locator
  readonly createAccountButton: Locator

  // Footer
  readonly footer: Locator

  constructor(page: Page) {
    this.page = page

    this.heroHeading = page.getByText('Where Code')
    this.getStartedButton = page.getByRole('link', {
      name: 'Get Started Free',
    })
    this.signInButton = page.getByRole('link', { name: 'Sign In' }).first()

    this.featuresHeading = page.getByRole('heading', {
      name: 'Everything Developers Need',
    })

    this.pricingHeading = page.getByRole('heading', {
      name: 'Simple, Transparent Pricing',
    })

    this.ctaHeading = page.getByRole('heading', { name: 'Ready to Join?' })
    this.createAccountButton = page.getByRole('link', {
      name: 'Create Free Account',
    })

    this.footer = page.locator('footer')
  }

  async goto() {
    await this.page.goto('/')
  }

  async expectLandingVisible() {
    await expect(this.heroHeading).toBeVisible()
    await expect(this.getStartedButton).toBeVisible()
  }
}
