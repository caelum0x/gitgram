'use client'
import { useEffect, useState } from 'react'
import api from '@/services/api'

function getHealthUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
  return `${apiUrl.replace(/\/?api\/?$/, '')}/health`
}

export default function ApiTestPage() {
  const [results, setResults] = useState<any>({})

  useEffect(() => {
    const testEndpoints = async () => {
      const tests: any = {}
      
      // Test health
      try {
        const res = await fetch(getHealthUrl())
        tests.health = { status: res.status, data: await res.json() }
      } catch (e: any) {
        tests.health = { error: e.message }
      }
      
      // Test auth/me (should fail without token)
      try {
        await api.get('/auth/me')
      } catch (e: any) {
        tests.authMe = { status: e.response?.status, error: e.response?.data }
      }
      
      // Test posts
      try {
        await api.get('/posts')
      } catch (e: any) {
        tests.posts = { status: e.response?.status, error: e.response?.data }
      }
      
      // Test github routes
      try {
        await api.get('/github/popular')
      } catch (e: any) {
        tests.githubPopular = { status: e.response?.status, error: e.response?.data }
      }
      
      setResults(tests)
    }
    
    testEndpoints()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
      <div className="space-y-4">
        <div>
          <strong>API Base URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'Not set'}
        </div>
        <div>
          <strong>Results:</strong>
          <pre className="bg-gray-100 p-4 rounded mt-2 overflow-auto">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
