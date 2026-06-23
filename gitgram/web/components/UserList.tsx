'use client'
import { useRouter } from 'next/navigation'

interface UserListProps {
  users: any[]
  showFollowButton?: boolean
}

export function UserList({ users, showFollowButton = false }: UserListProps) {
  const router = useRouter()

  return (
    <div className="space-y-2">
      {users.map(u => (
        <div key={u.id} className="p-4 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer flex items-center gap-3">
          <div onClick={() => router.push(`/profile/${u.username}`)} className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              {u.avatar ? (
                <img src={u.avatar} alt={u.username} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="font-semibold">{u.username?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="font-semibold">{u.username}</p>
              {u.fullName && <p className="text-sm text-muted">{u.fullName}</p>}
            </div>
          </div>
          {showFollowButton && (
            <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">
              Follow
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
