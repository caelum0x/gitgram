import { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from './test-data'

/**
 * Helper functions that call the Gitgram backend API directly.
 *
 * Useful for seeding data (creating users, posts) before tests run and
 * cleaning up afterwards, so the E2E tests start from a known state
 * without relying on the UI for setup.
 */

interface RegisterPayload {
  username: string
  email: string
  password: string
  fullName?: string
}

interface LoginPayload {
  email: string
  password: string
}

interface CreatePostPayload {
  content: string
  accountId?: string
}

/** Register a new user via the API and return the response body */
export async function apiRegisterUser(
  request: APIRequestContext,
  payload: RegisterPayload,
) {
  const response = await request.post(`${API_BASE_URL}/auth/register`, {
    data: payload,
  })
  return response.json()
}

/** Log in via the API and return the response (includes set-cookie headers) */
export async function apiLoginUser(
  request: APIRequestContext,
  payload: LoginPayload,
) {
  const response = await request.post(`${API_BASE_URL}/auth/login`, {
    data: payload,
  })
  return response
}

/** Create a post via the API (requires an authenticated request context) */
export async function apiCreatePost(
  request: APIRequestContext,
  payload: CreatePostPayload,
) {
  const response = await request.post(`${API_BASE_URL}/posts`, {
    data: payload,
  })
  return response.json()
}

/** Delete a user account via the API (for cleanup) */
export async function apiDeleteUser(
  request: APIRequestContext,
  password: string,
) {
  const response = await request.post(`${API_BASE_URL}/users/delete-account`, {
    data: { password, confirmText: 'DELETE', reason: 'e2e cleanup' },
  })
  return response
}
