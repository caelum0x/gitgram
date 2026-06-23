'use client'

/**
 * OrganizationSettingsPage — /orgs/[org]/settings
 *
 * Admin-only organization settings: general info, member management
 * (invite / remove / change role), a billing link, and a danger zone for
 * deleting the org.
 *
 * Access control: the page fetches the org and checks the viewer's role.
 * Non Owner/Admin viewers are shown an access-denied screen. Server-side
 * enforcement still happens on every mutating endpoint.
 *
 * Endpoints:
 *   GET    /v1/orgs/:org
 *   GET    /v1/orgs/:org/members
 *   PATCH  /v1/orgs/:org                          (general info)
 *   POST   /v1/orgs/:org/members                  (invite)
 *   DELETE /v1/orgs/:org/members/:id              (remove)
 *   PATCH  /v1/orgs/:org/members/:id              (change role)
 *   DELETE /v1/orgs/:org                          (delete org)
 *
 * Styling uses the dark-theme CSS custom properties from app/globals.css.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

type MemberRole = 'Owner' | 'Admin' | 'Member'

interface OrgInfo {
  id: string
  login: string
  name: string
  description: string
  location: string
  website: string
  viewerRole?: MemberRole
}

interface OrgMember {
  id: string
  username: string
  displayName?: string
  role: MemberRole
}

function normalizeRole(value: unknown): MemberRole {
  if (value === 'Owner' || value === 'owner') return 'Owner'
  if (value === 'Admin' || value === 'admin') return 'Admin'
  return 'Member'
}

async function fetchOrg(org: string): Promise<OrgInfo | null> {
  try {
    const res = await fetch(`${API_URL}/v1/orgs/${org}`)
    if (!res.ok) return null
    const d = await res.json()
    return {
      id: String(d.id ?? ''),
      login: String(d.login ?? org),
      name: typeof d.name === 'string' ? d.name : '',
      description: typeof d.description === 'string' ? d.description : '',
      location: typeof d.location === 'string' ? d.location : '',
      website: typeof d.website === 'string' ? d.website : '',
      viewerRole: d.viewerRole ? normalizeRole(d.viewerRole) : undefined,
    }
  } catch {
    return null
  }
}

async function fetchMembers(org: string): Promise<OrgMember[]> {
  try {
    const res = await fetch(`${API_URL}/v1/orgs/${org}/members`)
    if (!res.ok) return []
    const data = await res.json()
    const raw: unknown = data.members ?? data ?? []
    if (!Array.isArray(raw)) return []
    return raw.map((m): OrgMember => {
      const member = m as Record<string, unknown>
      return {
        id: String(member.id ?? ''),
        username: String(member.username ?? member.login ?? ''),
        displayName: typeof member.displayName === 'string' ? member.displayName : undefined,
        role: normalizeRole(member.role),
      }
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--background)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--foreground-secondary)',
  marginBottom: 6,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { org: string }
}

export default function OrganizationSettingsPage({ params }: PageProps) {
  const { org } = params
  const router = useRouter()

  const [info, setInfo] = useState<OrgInfo | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('')

  const [inviteUser, setInviteUser] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('Member')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [o, m] = await Promise.all([fetchOrg(org), fetchMembers(org)])
    setInfo(o)
    setMembers(m)
    setLoading(false)
  }, [org])

  useEffect(() => {
    load()
  }, [load])

  const updateField = (field: keyof OrgInfo, value: string) => {
    setInfo((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSaveGeneral = async () => {
    if (!info) return
    setSaving(true)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/orgs/${org}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: info.name,
          description: info.description,
          location: info.location,
          website: info.website,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus('Saved.')
    } catch {
      setStatus('Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async () => {
    const username = inviteUser.trim()
    if (!username) return
    try {
      const res = await fetch(`${API_URL}/v1/orgs/${org}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: inviteRole }),
      })
      if (!res.ok) throw new Error('Invite failed')
      setInviteUser('')
      setInviteRole('Member')
      await load()
    } catch {
      setStatus('Could not invite member.')
    }
  }

  const handleRoleChange = async (memberId: string, role: MemberRole) => {
    const prev = members
    setMembers((list) => list.map((m) => (m.id === memberId ? { ...m, role } : m)))
    try {
      const res = await fetch(`${API_URL}/v1/orgs/${org}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error('Update failed')
    } catch {
      setMembers(prev)
      setStatus('Could not update role.')
    }
  }

  const handleRemove = async (memberId: string) => {
    const prev = members
    setMembers((list) => list.filter((m) => m.id !== memberId))
    try {
      const res = await fetch(`${API_URL}/v1/orgs/${org}/members/${memberId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Remove failed')
    } catch {
      setMembers(prev)
      setStatus('Could not remove member.')
    }
  }

  const handleDeleteOrg = async () => {
    if (deleteConfirm !== org) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/v1/orgs/${org}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.push('/')
    } catch {
      setStatus('Could not delete organization.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: 32 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', color: 'var(--foreground-secondary)' }}>
          Loading settings…
        </div>
      </div>
    )
  }

  const canManage = info?.viewerRole === 'Owner' || info?.viewerRole === 'Admin'

  if (!info || !canManage) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
          color: 'var(--foreground)',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Access denied</h1>
        <p style={{ color: 'var(--foreground-secondary)', margin: 0 }}>
          You must be an owner or admin to manage this organization.
        </p>
      </div>
    )
  }

  const isOwner = info.viewerRole === 'Owner'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>
          {info.name || info.login} settings
        </h1>
        <p style={{ color: 'var(--foreground-secondary)', margin: '0 0 24px', fontSize: 14 }}>
          @{info.login}
        </p>

        {status && (
          <div
            style={{
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--foreground)',
            }}
          >
            {status}
          </div>
        )}

        {/* General info */}
        <Section title="General">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="org-name">Display name</label>
              <input
                id="org-name"
                style={inputStyle}
                value={info.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="org-desc">Description</label>
              <textarea
                id="org-desc"
                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={info.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="org-location">Location</label>
              <input
                id="org-location"
                style={inputStyle}
                value={info.location}
                onChange={(e) => updateField('location', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="org-website">Website</label>
              <input
                id="org-website"
                style={inputStyle}
                value={info.website}
                onChange={(e) => updateField('website', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <button
                onClick={handleSaveGeneral}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Section>

        {/* Member management */}
        <Section title="Members">
          {/* Invite */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              aria-label="Username to invite"
              style={{ ...inputStyle, flex: 1, minWidth: 160, width: 'auto' }}
              placeholder="Invite by username"
              value={inviteUser}
              onChange={(e) => setInviteUser(e.target.value)}
            />
            <select
              aria-label="Invite role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as MemberRole)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              <option value="Member">Member</option>
              <option value="Admin">Admin</option>
              {isOwner && <option value="Owner">Owner</option>}
            </select>
            <button
              onClick={handleInvite}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                background: 'var(--primary)',
                color: '#0A0C10',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Invite
            </button>
          </div>

          {/* Member list */}
          {members.length === 0 ? (
            <p style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>No members yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {member.displayName ?? member.username}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-secondary)' }}>
                      @{member.username}
                    </div>
                  </div>
                  <select
                    aria-label={`Role for ${member.username}`}
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value as MemberRole)}
                    style={{ ...inputStyle, width: 'auto', padding: '4px 8px' }}
                  >
                    <option value="Member">Member</option>
                    <option value="Admin">Admin</option>
                    {isOwner && <option value="Owner">Owner</option>}
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      background: 'transparent',
                      color: 'var(--error)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Billing */}
        <Section title="Billing">
          <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', margin: '0 0 12px' }}>
            Manage your organization plan, seats, and invoices.
          </p>
          <a
            href={`/orgs/${org}/billing`}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--surface-secondary)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            Manage billing
          </a>
        </Section>

        {/* Danger zone — owner only */}
        {isOwner && (
          <section
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--error)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--error)' }}>
              Danger zone
            </h2>
            <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', margin: '0 0 16px' }}>
              Deleting an organization is permanent and cannot be undone. All repositories,
              members, and settings will be removed. Type{' '}
              <strong style={{ color: 'var(--foreground)' }}>{org}</strong> to confirm.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                aria-label="Confirm organization name to delete"
                style={{ ...inputStyle, flex: 1, minWidth: 200, width: 'auto' }}
                placeholder={`Type "${org}" to confirm`}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <button
                onClick={handleDeleteOrg}
                disabled={deleteConfirm !== org || saving}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'var(--error)',
                  color: '#fff',
                  border: 'none',
                  cursor: deleteConfirm === org && !saving ? 'pointer' : 'not-allowed',
                  opacity: deleteConfirm === org && !saving ? 1 : 0.5,
                }}
              >
                Delete organization
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
