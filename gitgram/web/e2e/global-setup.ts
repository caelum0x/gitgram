import { test as setup } from '@playwright/test'

/**
 * Global setup runs once before all test projects.
 *
 * Use this to:
 *   - Seed test data via the API
 *   - Create a shared authenticated storage state
 *   - Verify the backend is healthy
 *
 * The authenticated state file (.auth/user.json) can be reused by
 * test projects via `storageState` to skip repeated logins.
 */

const AUTH_FILE = 'e2e/.auth/user.json'

setup('seed test database and authenticate', async ({ request }) => {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
  const healthCandidates = [
    `${apiBase}/health`,
    `${apiBase.replace(/\/api\/?$/, '')}/health`,
  ]

  // 1. Health check -- make sure the backend is up
  try {
    let healthy = false

    for (const url of healthCandidates) {
      const health = await request.get(url)
      if (health.ok()) {
        healthy = true
        break
      }
    }

    if (!healthy) {
      console.warn(
        'Backend health check did not return 200 on any known endpoint. ' +
          'Tests may fail if the API is not running.',
      )
    }
  } catch {
    console.warn(
      'Could not reach backend at ' +
        apiBase +
        '. Make sure it is running before running E2E tests.',
    )
  }

  // 2. Authenticate a test user and save the storage state.
  //    Uncomment the block below once you have a seeded test user.

  // const loginResponse = await request.post(`${apiBase}/auth/login`, {
  //   data: {
  //     email: process.env.E2E_USER_EMAIL || 'e2e@gitgram.test',
  //     password: process.env.E2E_USER_PASSWORD || 'TestPassword123!',
  //   },
  // })
  //
  // if (loginResponse.ok()) {
  //   // Save cookies and localStorage to a file for reuse
  //   await request.storageState({ path: AUTH_FILE })
  //   console.log('Authenticated storage state saved to', AUTH_FILE)
  // } else {
  //   console.warn(
  //     'Could not authenticate test user. Status:',
  //     loginResponse.status(),
  //   )
  // }
})
