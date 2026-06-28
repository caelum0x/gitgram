'use client'

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { AxiosError } from 'axios'
import api from '@/services/api'

/** Result of probing a single backend endpoint. */
interface EndpointResult {
  status?: number
  data?: unknown
  error?: unknown
}

type Results = Record<string, EndpointResult>

function getHealthUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
  return `${apiUrl.replace(/\/?api\/?$/, '')}/health`
}

function toErrorResult(error: unknown): EndpointResult {
  if (error instanceof AxiosError) {
    return { status: error.response?.status, error: error.response?.data ?? error.message }
  }
  if (error instanceof Error) {
    return { error: error.message }
  }
  return { error: 'Unknown error' }
}

/**
 * Developer-only diagnostic page that probes core backend endpoints.
 * Not linked from navigation and gated to non-production builds so it is
 * never a publicly routable page in production.
 */
export default function ApiTestPage() {
  const [results, setResults] = useState<Results>({})

  const isEnabled = process.env.NODE_ENV !== 'production'

  useEffect(() => {
    if (!isEnabled) return

    const testEndpoints = async () => {
      const tests: Results = {}

      try {
        const res = await fetch(getHealthUrl())
        tests.health = { status: res.status, data: await res.json() }
      } catch (error: unknown) {
        tests.health = toErrorResult(error)
      }

      try {
        const res = await api.get('/auth/me')
        tests.authMe = { status: res.status, data: res.data }
      } catch (error: unknown) {
        tests.authMe = toErrorResult(error)
      }

      try {
        const res = await api.get('/posts')
        tests.posts = { status: res.status, data: res.data }
      } catch (error: unknown) {
        tests.posts = toErrorResult(error)
      }

      try {
        const res = await api.get('/github/popular')
        tests.githubPopular = { status: res.status, data: res.data }
      } catch (error: unknown) {
        tests.githubPopular = toErrorResult(error)
      }

      setResults(tests)
    }

    void testEndpoints()
  }, [isEnabled])

  if (!isEnabled) {
    notFound()
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
      <p className="text-sm text-[var(--foreground-secondary)] mb-4">
        Developer diagnostic page (disabled in production).
      </p>
      <div className="space-y-4">
        <div>
          <strong>API Base URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'Not set'}
        </div>
        <div>
          <strong>Results:</strong>
          <pre className="bg-gray-100 p-4 rounded mt-2 overflow-auto text-black">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
