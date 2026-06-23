'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { userService } from '@/services/userService'
import { useToast } from '@/components/ui/toast'

export default function EditProfilePage() {
  const router = useRouter()
  const { isAuthenticated, user, setUser } = useAuthStore()
  const { showToast } = useToast()
  const [form, setForm] = useState({ fullName: user?.fullName || '', bio: user?.bio || '', username: user?.username || '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updated = await userService.updateProfile(form)
      setUser(updated)
      showToast('Profile updated!', 'success')
      router.push(`/profile/${updated.username}`)
    } catch (error) {
      showToast('Failed to update', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Edit Profile</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Username</label>
          <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full px-4 py-2 bg-card border border-border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Full Name</label>
          <input type="text" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} className="w-full px-4 py-2 bg-card border border-border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Bio</label>
          <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={4} className="w-full px-4 py-2 bg-card border border-border rounded-lg" />
        </div>
        <div className="flex gap-4">
          <button type="submit" disabled={loading} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-muted rounded-lg hover:bg-muted/80">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
