'use client'

/**
 * AccountProfileEditPage — /settings/account
 *
 * Profile editing surface. Fields: avatar (click-to-upload with preview),
 * display name, username (debounced availability check), bio (160 char max
 * with live counter), website URL (validated), GitHub username + Connect
 * button, Twitter/X handle, location, job title, company, and
 * public/private account radio group.
 *
 * Save:          PATCH /api/v1/users/profile
 * Avatar upload: POST  /api/v1/upload/avatar  (multipart → { avatarUrl })
 * On success:    toast "Profile updated!"
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
} from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import { githubService } from '@/services/githubService'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIO_MAX = 160
const USERNAME_DEBOUNCE_MS = 500
const URL_RE =
  /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/i

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileForm {
  displayName: string
  username: string
  bio: string
  website: string
  githubUsername: string
  twitterHandle: string
  location: string
  jobTitle: string
  company: string
  isPrivate: boolean
  avatarUrl: string
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error'

interface UsernameAvail {
  status: UsernameStatus
  message: string
}

type FieldErrors = Partial<Record<keyof ProfileForm, string>>

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateUsername(value: string): string | null {
  if (!value) return 'Username is required'
  if (value.length < 3) return 'Must be at least 3 characters'
  if (value.length > 30) return 'Must be 30 characters or fewer'
  if (!/^[a-zA-Z0-9_.-]+$/.test(value))
    return 'Only letters, numbers, underscores, hyphens, and dots'
  return null
}

function validateWebsite(value: string): string | null {
  if (!value) return null
  return URL_RE.test(value) ? null : 'Enter a valid URL (e.g. https://example.com)'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldGroupProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: React.ReactNode
}

function FieldGroup({ label, htmlFor, hint, error, children }: FieldGroupProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-[var(--foreground)]"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--foreground-secondary)]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
      <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccountProfileEditPage() {
  const router = useRouter()
  const { isAuthenticated, user, setUser } = useAuthStore()
  const { showToast } = useToast()

  // -------------------------------------------------------------------------
  // Form state
  // -------------------------------------------------------------------------

  const [form, setForm] = useState<ProfileForm>({
    displayName: user?.fullName ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
    website: '',
    githubUsername: user?.githubUsername ?? '',
    twitterHandle: '',
    location: '',
    jobTitle: '',
    company: '',
    isPrivate: user?.isPrivate ?? false,
    avatarUrl: user?.avatar ?? '',
  })

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.avatar ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Username availability
  const [usernameAvail, setUsernameAvail] = useState<UsernameAvail>({
    status: 'idle',
    message: '',
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originalUsername = useRef<string>(user?.username ?? '')

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // -------------------------------------------------------------------------
  // Sync store user into form on initial load
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!user) return
    setForm((prev) => ({
      ...prev,
      displayName: user.fullName ?? prev.displayName,
      username: user.username ?? prev.username,
      bio: user.bio ?? prev.bio,
      githubUsername: user.githubUsername ?? prev.githubUsername,
      isPrivate: user.isPrivate ?? prev.isPrivate,
      avatarUrl: user.avatar ?? prev.avatarUrl,
    }))
    setAvatarPreview(user.avatar ?? '')
    originalUsername.current = user.username ?? ''
  }, [user])

  // -------------------------------------------------------------------------
  // Cleanup debounce on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Generic immutable field updater
  // -------------------------------------------------------------------------

  const updateField = useCallback(
    <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Username debounce + availability check
  // -------------------------------------------------------------------------

  const checkUsernameAvailability = useCallback(
    async (value: string) => {
      if (value === originalUsername.current) {
        setUsernameAvail({ status: 'idle', message: '' })
        return
      }
      if (validateUsername(value)) {
        setUsernameAvail({ status: 'idle', message: '' })
        return
      }
      setUsernameAvail({ status: 'checking', message: 'Checking…' })
      try {
        const result = await userService.getProfile(value)
        setUsernameAvail(
          result
            ? { status: 'taken', message: 'Username is taken' }
            : { status: 'available', message: 'Available' },
        )
      } catch {
        // 404 = username is free
        setUsernameAvail({ status: 'available', message: 'Available' })
      }
    },
    [],
  )

  const handleUsernameChange = useCallback(
    (value: string) => {
      updateField('username', value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => checkUsernameAvailability(value),
        USERNAME_DEBOUNCE_MS,
      )
    },
    [updateField, checkUsernameAvailability],
  )

  // -------------------------------------------------------------------------
  // Avatar upload
  // -------------------------------------------------------------------------

  const handleAvatarChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const objectUrl = URL.createObjectURL(file)
      setAvatarPreview(objectUrl)
      setUploadingAvatar(true)

      try {
        const { avatarUrl } = await userService.uploadAvatarFile(file)
        updateField('avatarUrl', avatarUrl)
        setAvatarPreview(avatarUrl)
        showToast('Avatar uploaded!', 'success')
      } catch (err) {
        showToast(getErrorMessage(err), 'error')
        setAvatarPreview(form.avatarUrl)
      } finally {
        setUploadingAvatar(false)
        if (avatarInputRef.current) avatarInputRef.current.value = ''
        URL.revokeObjectURL(objectUrl)
      }
    },
    [form.avatarUrl, updateField, showToast],
  )

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const errors: FieldErrors = {}

    const usernameErr = validateUsername(form.username)
    if (usernameErr) errors.username = usernameErr

    if (usernameAvail.status === 'taken') errors.username = 'Username is already taken'

    const websiteErr = validateWebsite(form.website)
    if (websiteErr) errors.website = websiteErr

    if (form.bio.length > BIO_MAX)
      errors.bio = `Bio must be ${BIO_MAX} characters or fewer`

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [form, usernameAvail.status])

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!validate()) {
      showToast('Please fix the errors before saving', 'error')
      return
    }

    setSaving(true)
    try {
      const updated = await userService.patchProfile({
        displayName: form.displayName.trim() || undefined,
        username: form.username.trim(),
        bio: form.bio.trim() || undefined,
        website: form.website.trim() || undefined,
        githubUsername: form.githubUsername.trim() || undefined,
        twitterHandle: form.twitterHandle.trim() || undefined,
        location: form.location.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        company: form.company.trim() || undefined,
        isPrivate: form.isPrivate,
      })

      setUser({ ...user!, ...updated })
      showToast('Profile updated!', 'success')
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }, [form, user, validate, setUser, showToast])

  // -------------------------------------------------------------------------
  // GitHub OAuth connect
  // -------------------------------------------------------------------------

  const handleConnectGitHub = useCallback(() => {
    githubService.connectGitHub()
  }, [])

  // -------------------------------------------------------------------------
  // Guard
  // -------------------------------------------------------------------------

  if (!isAuthenticated) return null

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const bioCharsLeft = BIO_MAX - form.bio.length
  const bioOverLimit = bioCharsLeft < 0

  const inputCls =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors text-sm'
  const inputErrCls =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--error)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--error)] transition-colors text-sm'

  const usernameAdornment = (() => {
    switch (usernameAvail.status) {
      case 'checking':
        return (
          <span className="text-xs text-[var(--foreground-secondary)] flex items-center gap-1">
            <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
            Checking…
          </span>
        )
      case 'available':
        return (
          <span className="text-xs text-[var(--accent)] font-medium">
            Available
          </span>
        )
      case 'taken':
        return (
          <span className="text-xs text-[var(--error)] font-medium">
            Taken
          </span>
        )
      default:
        return null
    }
  })()

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Edit Profile</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">
            Update your public profile information
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* ---- Avatar ---- */}
      <Section title="Profile Photo">
        <div className="flex items-center gap-5">
          {/* Circle preview */}
          <button
            type="button"
            aria-label="Change profile photo"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative w-20 h-20 flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)] group"
          >
            {avatarPreview ? (
              <Image
                src={avatarPreview}
                alt="Avatar preview"
                fill
                className="rounded-full object-cover ring-2 ring-[var(--border)] group-hover:ring-[var(--primary)] transition-all"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center ring-2 ring-[var(--border)] group-hover:ring-[var(--primary)] transition-all">
                <svg
                  className="w-8 h-8 text-[var(--foreground-secondary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              </div>
            )}
            {/* Hover overlay camera icon */}
            {!uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            )}
          </button>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="px-4 py-2 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg text-sm font-medium text-[var(--foreground)] hover:bg-[var(--border)] transition-colors disabled:opacity-50"
            >
              {uploadingAvatar ? 'Uploading…' : 'Change photo'}
            </button>
            <p className="text-xs text-[var(--foreground-secondary)]">
              JPG, PNG or GIF — max 5 MB
            </p>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
            aria-label="Upload avatar"
          />
        </div>
      </Section>

      {/* ---- Basic info ---- */}
      <Section title="Basic Information">

        <FieldGroup
          label="Display Name"
          htmlFor="displayName"
          hint="Your full name or a name you prefer. Shown alongside your username."
          error={fieldErrors.displayName}
        >
          <input
            id="displayName"
            type="text"
            value={form.displayName}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateField('displayName', e.target.value)
            }
            placeholder="Jane Doe"
            maxLength={60}
            className={fieldErrors.displayName ? inputErrCls : inputCls}
          />
        </FieldGroup>

        <FieldGroup
          label="Username"
          htmlFor="username"
          error={fieldErrors.username}
        >
          <div className="space-y-1">
            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-[var(--foreground-secondary)] text-sm pointer-events-none select-none">
                @
              </span>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleUsernameChange(e.target.value)
                }
                placeholder="janedoe"
                maxLength={30}
                autoComplete="username"
                className={`${fieldErrors.username ? inputErrCls : inputCls} pl-8`}
              />
            </div>
            {usernameAdornment}
            {fieldErrors.username && (
              <p className="text-xs text-[var(--error)]" role="alert">
                {fieldErrors.username}
              </p>
            )}
          </div>
        </FieldGroup>

        <FieldGroup label="Bio" htmlFor="bio" error={fieldErrors.bio}>
          <div className="space-y-1">
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateField('bio', e.target.value)
              }
              rows={3}
              placeholder="Tell the world a little about yourself…"
              className={`${fieldErrors.bio || bioOverLimit ? inputErrCls : inputCls} resize-none`}
            />
            <p
              className={`text-xs text-right tabular-nums ${
                bioOverLimit
                  ? 'text-[var(--error)]'
                  : bioCharsLeft <= 20
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--foreground-secondary)]'
              }`}
            >
              {bioCharsLeft} / {BIO_MAX}
            </p>
          </div>
        </FieldGroup>
      </Section>

      {/* ---- Links & social ---- */}
      <Section title="Links &amp; Social">

        <FieldGroup
          label="Website URL"
          htmlFor="website"
          hint="Include https:// for external links."
          error={fieldErrors.website}
        >
          <input
            id="website"
            type="url"
            value={form.website}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateField('website', e.target.value)
            }
            placeholder="https://yoursite.com"
            className={fieldErrors.website ? inputErrCls : inputCls}
          />
        </FieldGroup>

        <FieldGroup
          label="GitHub Username"
          htmlFor="githubUsername"
          error={fieldErrors.githubUsername}
        >
          {user?.githubId ? (
            /* Already OAuth-connected — show badge + editable handle */
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-lg">
              <svg
                className="w-4 h-4 text-[var(--accent)] flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--accent)]">
                  GitHub Connected
                </p>
                <p className="text-xs text-[var(--foreground-secondary)] truncate">
                  @{user.githubUsername ?? form.githubUsername}
                </p>
              </div>
              <input
                id="githubUsername"
                type="text"
                value={form.githubUsername}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField('githubUsername', e.target.value)
                }
                placeholder="username"
                className="w-32 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
          ) : (
            /* Not connected — text input + OAuth button */
            <div className="flex gap-2">
              <input
                id="githubUsername"
                type="text"
                value={form.githubUsername}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField('githubUsername', e.target.value)
                }
                placeholder="your-github-handle"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={handleConnectGitHub}
                className="px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium hover:bg-[var(--foreground)]/90 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Connect GitHub
              </button>
            </div>
          )}
        </FieldGroup>

        <FieldGroup
          label="Twitter / X Handle"
          htmlFor="twitterHandle"
          hint="Without the @ symbol."
          error={fieldErrors.twitterHandle}
        >
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-[var(--foreground-secondary)] text-sm pointer-events-none select-none">
              @
            </span>
            <input
              id="twitterHandle"
              type="text"
              value={form.twitterHandle}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateField('twitterHandle', e.target.value)
              }
              placeholder="yourhandle"
              maxLength={50}
              className={`${fieldErrors.twitterHandle ? inputErrCls : inputCls} pl-8`}
            />
          </div>
        </FieldGroup>
      </Section>

      {/* ---- Personal details ---- */}
      <Section title="Personal Details">

        <FieldGroup
          label="Location"
          htmlFor="location"
          hint="City, country, or wherever you are."
          error={fieldErrors.location}
        >
          <input
            id="location"
            type="text"
            value={form.location}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateField('location', e.target.value)
            }
            placeholder="San Francisco, CA"
            maxLength={100}
            className={fieldErrors.location ? inputErrCls : inputCls}
          />
        </FieldGroup>

        <FieldGroup
          label="Job Title / Role"
          htmlFor="jobTitle"
          error={fieldErrors.jobTitle}
        >
          <input
            id="jobTitle"
            type="text"
            value={form.jobTitle}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateField('jobTitle', e.target.value)
            }
            placeholder="Software Engineer"
            maxLength={100}
            className={fieldErrors.jobTitle ? inputErrCls : inputCls}
          />
        </FieldGroup>

        <FieldGroup
          label="Company"
          htmlFor="company"
          error={fieldErrors.company}
        >
          <input
            id="company"
            type="text"
            value={form.company}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateField('company', e.target.value)
            }
            placeholder="Acme Corp"
            maxLength={100}
            className={fieldErrors.company ? inputErrCls : inputCls}
          />
        </FieldGroup>
      </Section>

      {/* ---- Privacy ---- */}
      <Section title="Account Visibility">
        <p className="text-sm text-[var(--foreground-secondary)] -mt-2">
          Choose who can see your profile and posts.
        </p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Account visibility</legend>

          {/* Public */}
          <label
            htmlFor="visibilityPublic"
            className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
              !form.isPrivate
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] hover:border-[var(--foreground-secondary)]'
            }`}
          >
            <input
              id="visibilityPublic"
              type="radio"
              name="visibility"
              value="public"
              checked={!form.isPrivate}
              onChange={() => updateField('isPrivate', false)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Public
              </p>
              <p className="text-xs text-[var(--foreground-secondary)]">
                Anyone can view your profile and posts. Best for open-source creators.
              </p>
            </div>
          </label>

          {/* Private */}
          <label
            htmlFor="visibilityPrivate"
            className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
              form.isPrivate
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] hover:border-[var(--foreground-secondary)]'
            }`}
          >
            <input
              id="visibilityPrivate"
              type="radio"
              name="visibility"
              value="private"
              checked={form.isPrivate}
              onChange={() => updateField('isPrivate', true)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Private
              </p>
              <p className="text-xs text-[var(--foreground-secondary)]">
                Only approved followers can see your posts and profile details.
              </p>
            </div>
          </label>
        </fieldset>
      </Section>

      {/* ---- Actions ---- */}
      <div className="flex gap-3 pb-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-semibold hover:bg-[var(--surface-secondary)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploadingAvatar}
          className="flex-1 py-3 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
