'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { userService } from '@/services/userService'

interface UserSelectorProps {
  selectedUsers: string[]
  onUsersChange: (userIds: string[]) => void
}

export default function UserSelector({ selectedUsers, onUsersChange }: UserSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUserDetails, setSelectedUserDetails] = useState<any[]>([])

  useEffect(() => {
    if (selectedUsers.length > 0) {
      // Load details for selected users
      Promise.all(
        selectedUsers.map((userId) =>
          userService.getProfile(userId).catch(() => null)
        )
      ).then((results) => {
        setSelectedUserDetails(results.filter(Boolean))
      })
    } else {
      setSelectedUserDetails([])
    }
  }, [selectedUsers])

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setUsers([])
      return
    }

    setLoading(true)
    try {
      const response = await userService.searchUsers(query, 1, 20)
      // Filter out already selected users
      const filtered = (response.users || []).filter(
        (user: any) => !selectedUsers.includes(user.id)
      )
      setUsers(filtered)
    } catch (error) {
      console.error('Search users error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = (user: any) => {
    if (!selectedUsers.includes(user.id)) {
      onUsersChange([...selectedUsers, user.id])
      setSelectedUserDetails([...selectedUserDetails, user])
      setSearchQuery('')
      setUsers([])
    }
  }

  const handleRemoveUser = (userId: string) => {
    onUsersChange(selectedUsers.filter((id) => id !== userId))
    setSelectedUserDetails(selectedUserDetails.filter((u) => u.id !== userId))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        Add Members *
      </label>

      {/* Selected Users */}
      {selectedUserDetails.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedUserDetails.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 px-3 py-1 bg-hover border border-border rounded-md"
            >
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.username}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">
                    {user.username[0].toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm text-foreground">@{user.username}</span>
              <button
                type="button"
                onClick={() => handleRemoveUser(user.id)}
                className="text-foreground/70 hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          handleSearch(e.target.value)
        }}
        placeholder="Search users to add..."
        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-foreground-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent mb-2"
      />

      {/* Search Results */}
      {searchQuery && (
        <div className="max-h-60 overflow-y-auto border border-border rounded-lg bg-surface">
          {loading ? (
            <div className="p-4 text-center text-foreground/70">Searching...</div>
          ) : users.length > 0 ? (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleAddUser(user)}
                className="w-full flex items-center gap-3 p-3 hover:bg-surface/80 border-b border-border last:border-b-0"
              >
                {user.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.username}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {user.username[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 text-left">
                  <p className="font-semibold text-foreground">@{user.username}</p>
                  {user.bio && (
                    <p className="text-sm text-foreground/70">{user.bio}</p>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-foreground/70">No users found</div>
          )}
        </div>
      )}
    </div>
  )
}

