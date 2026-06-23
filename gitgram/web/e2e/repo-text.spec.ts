import { type APIRequestContext, type Page } from '@playwright/test'
import { test, expect } from './fixtures/test-fixtures'

const REPO_OWNER = 'facebook'
const REPO_NAME = 'react'
const REPO_LABEL = `${REPO_OWNER}/${REPO_NAME}`
const REPO_PATH = `/${REPO_OWNER}/${REPO_NAME}`
const REPO_TEXT_PATH = `${REPO_PATH}/text`
const LEGACY_REPO_TEXT_PATH = `/github/${REPO_OWNER}/${REPO_NAME}/text?maxFiles=80&maxFileBytes=50000`

const BASE_REPOSITORY = {
  id: 'repo-react',
  owner: REPO_OWNER,
  name: REPO_NAME,
  fullName: REPO_LABEL,
  description: 'The library for web and native user interfaces.',
  stars: 228765,
  forks: 47821,
  watchers: 6782,
  language: 'TypeScript',
  topics: ['frontend', 'ui', 'javascript'],
  htmlUrl: `https://github.com/${REPO_LABEL}`,
  social: {
    comments: 18,
    reactions: 54,
    posts: 6,
    followers: 1923,
  },
  isFollowing: false,
  isSaved: false,
}

const BASE_POSTS = [
  {
    id: 'post-1',
    content: 'React 19 shipped with compiler and server improvements.',
    likesCount: 42,
    commentsCount: 7,
    sharesCount: 3,
    createdAt: '2026-05-13T10:00:00.000Z',
    user: {
      username: 'dan',
    },
  },
]

async function mockRepoTextExport(page: Page) {
  await page.route(
    `**/api/v1/repositories/${REPO_OWNER}/${REPO_NAME}/export/text**`,
    async (route) => {
      const url = new URL(route.request().url())
      const maxFiles = url.searchParams.get('maxFiles') ?? '60'
      const maxFileBytes = url.searchParams.get('maxFileBytes') ?? '20000'

      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: [
          `# Repo Export: ${REPO_LABEL}`,
          `maxFiles=${maxFiles}`,
          `maxFileBytes=${maxFileBytes}`,
          '<content full_path="README.md">',
          'React makes it painless to create interactive UIs.',
          '</content>',
        ].join('\n'),
      })
    },
  )
}

async function mockRepositoryPageApis(page: Page) {
  await page.route(
    `**/api/v1/repositories/${REPO_OWNER}/${REPO_NAME}/posts**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: BASE_POSTS,
        }),
      })
    },
  )

  await page.route(
    `**/api/v1/repositories/${REPO_OWNER}/${REPO_NAME}/activity**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          activities: [],
        }),
      })
    },
  )

  await page.route(
    `**/api/v1/repositories/${REPO_OWNER}/${REPO_NAME}/snippets**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
        }),
      })
    },
  )

  await page.route(
    `**/api/v1/repositories/${REPO_OWNER}/${REPO_NAME}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          repository: BASE_REPOSITORY,
          isFollowing: false,
        }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/stats/participation`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          all: Array.from({ length: 52 }, (_, index) => (index % 6) + 1),
        }),
      })
    },
  )

  await page.route(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contributors?per_page=8`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            login: 'gaearon',
            avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
            html_url: 'https://github.com/gaearon',
          },
        ]),
      })
    },
  )
}

async function warmRoute(
  request: APIRequestContext,
  path: string,
  bodyIncludes?: string,
) {
  const startedAt = Date.now()
  let lastStatus = 0
  let lastBodySnippet = ''

  while (Date.now() - startedAt < 60_000) {
    const response = await request.get(path, { failOnStatusCode: false })
    const body = await response.text()

    lastStatus = response.status()
    lastBodySnippet = body.slice(0, 200)

    if (response.ok() && (!bodyIncludes || body.includes(bodyIncludes))) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(
    `Timed out warming ${path}. Last status: ${lastStatus}. Last body: ${lastBodySnippet}`,
  )
}

test.describe('Repository Text Routes', () => {
  test.describe.configure({ timeout: 120_000 })
  let routesWarmed = false

  test.beforeEach(async ({ page }, testInfo) => {
    await page.context().clearCookies()
    await mockRepoTextExport(page)

    if (!routesWarmed) {
      testInfo.setTimeout(120_000)
      await warmRoute(page.request, REPO_TEXT_PATH, 'Repo Text Export')
      await warmRoute(page.request, REPO_PATH)
      await warmRoute(page.request, LEGACY_REPO_TEXT_PATH, 'Repo Text Export')
      routesWarmed = true
    }
  })

  test('should render the public repo text page and keep export sizing in the URL', async ({
    page,
  }) => {
    await page.goto(REPO_TEXT_PATH)

    await expect(page.getByText('Repo Text Export')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: REPO_LABEL })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('pre code')).toContainText(
      `# Repo Export: ${REPO_LABEL}`,
      { timeout: 20_000 },
    )
    await expect(page.locator('pre code')).toContainText('maxFiles=60', {
      timeout: 20_000,
    })
    await expect(page.locator('pre code')).toContainText(
      'maxFileBytes=20000',
      { timeout: 20_000 },
    )
    await expect(page.getByRole('link', { name: 'Raw' })).toHaveAttribute(
      'href',
      `${REPO_TEXT_PATH}/raw`,
    )

    await page.getByLabel('Max files').fill('12')
    await page.getByLabel('Max bytes per file').fill('4000')
    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page).toHaveURL(
      `${REPO_TEXT_PATH}?maxFiles=12&maxFileBytes=4000`,
      { timeout: 20_000 },
    )
    await expect(page.locator('pre code')).toContainText('maxFiles=12')
    await expect(page.locator('pre code')).toContainText('maxFileBytes=4000')
    await expect(page.getByRole('link', { name: 'Raw' })).toHaveAttribute(
      'href',
      `${REPO_TEXT_PATH}/raw?maxFiles=12&maxFileBytes=4000`,
    )

    await page.getByRole('button', { name: 'Reset' }).click()

    await expect(page).toHaveURL(REPO_TEXT_PATH, { timeout: 20_000 })
    await expect(page.locator('pre code')).toContainText('maxFiles=60')
    await expect(page.locator('pre code')).toContainText('maxFileBytes=20000')
  })

  test('should canonicalize legacy repo text paths and preserve export query params', async ({
    page,
  }) => {
    await page.goto(
      LEGACY_REPO_TEXT_PATH,
    )

    await expect(page).toHaveURL(
      `${REPO_TEXT_PATH}?maxFiles=80&maxFileBytes=50000`,
      { timeout: 20_000 },
    )
    await expect(
      page.getByText('Active limits: 80 files, 50,000 bytes per file'),
    ).toBeVisible()
    await expect(page.locator('pre code')).toContainText('maxFiles=80')
    await expect(page.locator('pre code')).toContainText('maxFileBytes=50000')
  })

  test('should open the text view from the short repo page sidebar', async ({
    page,
  }) => {
    await mockRepositoryPageApis(page)

    await page.goto(REPO_PATH)

    await expect(page.getByRole('heading', { name: REPO_LABEL })).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByRole('link', { name: 'Open Text View' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Open Text View' }).click()

    await expect(page).toHaveURL(REPO_TEXT_PATH, { timeout: 20_000 })
    await expect(page.getByText('Repo Text Export')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.locator('pre code')).toContainText(
      `# Repo Export: ${REPO_LABEL}`,
      { timeout: 20_000 },
    )
  })
})
