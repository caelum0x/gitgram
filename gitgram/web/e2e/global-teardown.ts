import { test as teardown } from '@playwright/test'

/**
 * Global teardown runs once after all test projects complete.
 *
 * Use this to clean up test data created during the run.
 */

teardown('clean up test data', async () => {
  // Add API calls to delete test users/posts created during the run.
  // For now this is a no-op placeholder.
  console.log('E2E teardown complete.')
})
