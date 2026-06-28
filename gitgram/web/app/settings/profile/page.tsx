'use client'

/**
 * ProfileEditPage — /settings/profile
 *
 * Full profile editing surface. Fields: avatar, display name, username
 * (with debounced availability check), bio (160 char max), website URL,
 * GitHub username, Twitter/X handle, location, pronouns, job title, company,
 * and public/private account toggle.
 *
 * Save calls PATCH /api/v1/users/profile.
 * Avatar upload calls POST /api/v1/upload/avatar (multipart).
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
import CropImageDialog from '@/components/CropImageDialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIO_MAX_LENGTH = 160
const USERNAME_DEBOUNCE_MS = 500
const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const AVATAR_ASPECT_RATIO = 1 // square
const PRONOUNS_PRESETS = ['he/him', 'she/her', 'they/them', 'he/they', 'she/they', 'custom'] as const

const URL_PATTERN =
  /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/i

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PronounsPreset = (typeof PRONOUNS_PRESETS)[number]

interface ProfileFormState {
  displayName: string
  username: string
  bio: string
  website: string
  githubUsername: string
  twitterHandle: string
  location: string
  pronounsPreset: PronounsPreset
  pronounsCustom: string
  jobTitle: string
  company: string
  isPrivate: boolean
  avatarUrl: string
}

interface UsernameAvailability {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'error'
  message: string
}

type FieldError = Partial<Record<keyof ProfileFormState, string>>

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateWebsite(url: string): string | null {
  if (!url) return null
  return URL_PATTERN.test(url) ? null : 'Enter a valid URL (e.g. https://example.com)'
}

function validateUsername(value: string): string | null {
  if (!value) return 'Username is required'
  if (value.length < 3) return 'Must be at least 3 characters'
  if (value.length > 30) return 'Must be 30 characters or fewer'
  if (!/^[a-zA-Z0-9_.-]+$/.test(value)) return 'Only letters, numbers, underscores, hyphens, and dots'
  return null
}

function resolvePronouns(preset: PronounsPreset, custom: string): string {
  return preset === 'custom' ? custom.trim() : preset
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToggleProps {
  id: string
  checked: boolean
  onChange: () => void
}

function Toggle({ id, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
        checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

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
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-[var(--foreground)]">
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfileEditPage() {
  const router = useRouter()
  const { isAuthenticated, user, setUser } = useAuthStore()
  const { showToast } = useToast()

  // -------------------------------------------------------------------------
  // Form state — initialised from the auth store user
  // -------------------------------------------------------------------------

  const [form, setForm] = useState<ProfileFormState>({
    displayName: user?.fullName ?? '',
    username: user?.username ?? '',
    bio: user?.bio ?? '',
    website: '',
    githubUsername: user?.githubUsername ?? '',
    twitterHandle: '',
    location: '',
    pronounsPreset: 'he/him',
    pronounsCustom: '',
    jobTitle: '',
    company: '',
    isPrivate: user?.isPrivate ?? false,
    avatarUrl: user?.avatar ?? '',
  })

  const [fieldErrors, setFieldErrors] = useState<FieldError>({})
  const [saving, setSaving] = useState(false)

  // Avatar upload
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.avatar ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  // Source object URL for the crop dialog (null when closed)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // Username availability
  const [usernameAvail, setUsernameAvail] = useState<UsernameAvailability>({
    status: 'idle',
    message: '',
  })
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originalUsername = useRef<string>(user?.username ?? '')

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // -------------------------------------------------------------------------
  // Sync store user into form on first load
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
  // Generic field updater (immutable)
  // -------------------------------------------------------------------------

  const updateField = useCallback(
    <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Username debounce + availability check
  // -------------------------------------------------------------------------

  const checkUsernameAvailability = useCallback(async (value: string) => {
    if (value === originalUsername.current) {
      setUsernameAvail({ status: 'idle', message: '' })
      return
    }
    const validationError = validateUsername(value)
    if (validationError) {
      setUsernameAvail({ status: 'idle', message: '' })
      return
    }
    setUsernameAvail({ status: 'checking', message: 'Checking...' })
    try {
      const result = await userService.getProfile(value)
      // If a profile is returned the username is taken
      if (result) {
        setUsernameAvail({ status: 'taken', message: 'Username is taken' })
      } else {
        setUsernameAvail({ status: 'available', message: 'Available' })
      }
    } catch {
      // A 404 means the username is free
      setUsernameAvail({ status: 'available', message: 'Available' })
    }
  }, [])

  const handleUsernameChange = useCallback(
    (value: string) => {
      updateField('username', value)
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
      usernameDebounceRef.current = setTimeout(() => {
        checkUsernameAvailability(value)
      }, USERNAME_DEBOUNCE_MS)
    },
    [updateField, checkUsernameAvailability],
  )

  useEffect(() => {
    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Avatar upload
  // -------------------------------------------------------------------------

  // Step 1: validate the selected file and open the crop dialog.
  const handleAvatarFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Reset input immediately so the same file can be re-selected later.
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      if (!file) return

      if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
        showToast('Please choose a JPG, PNG, GIF, or WebP image', 'error')
        return
      }
      if (file.size > AVATAR_MAX_BYTES) {
        showToast('Image must be 5 MB or smaller', 'error')
        return
      }

      // Hand the raw image to the crop dialog; revoke any previous source.
      setCropSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
    },
    [showToast],
  )

  const closeCropDialog = useCallback(() => {
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  // Step 2: receive the cropped webp blob and upload it.
  const handleCroppedAvatar = useCallback(
    async (blob: Blob | null) => {
      if (!blob) {
        showToast('Could not process the image. Please try again.', 'error')
        return
      }

      const croppedFile = new File([blob], 'avatar.webp', { type: 'image/webp' })

      // Optimistic local preview of the cropped result.
      const previewUrl = URL.createObjectURL(croppedFile)
      const previousPreview = form.avatarUrl
      setAvatarPreview(previewUrl)

      setUploadingAvatar(true)
      try {
        const { avatarUrl } = await userService.uploadAvatarFile(croppedFile)
        updateField('avatarUrl', avatarUrl)
        setAvatarPreview(avatarUrl)
        showToast('Avatar uploaded!', 'success')
      } catch (err) {
        showToast(getErrorMessage(err), 'error')
        setAvatarPreview(previousPreview)
      } finally {
        setUploadingAvatar(false)
        URL.revokeObjectURL(previewUrl)
      }
    },
    [form.avatarUrl, updateField, showToast],
  )

  // -------------------------------------------------------------------------
  // Form validation
  // -------------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const errors: FieldError = {}

    const usernameError = validateUsername(form.username)
    if (usernameError) errors.username = usernameError

    const websiteError = validateWebsite(form.website)
    if (websiteError) errors.website = websiteError

    if (form.bio.length > BIO_MAX_LENGTH) {
      errors.bio = `Bio must be ${BIO_MAX_LENGTH} characters or fewer`
    }

    if (usernameAvail.status === 'taken') {
      errors.username = 'Username is already taken'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [form, usernameAvail])

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
        pronouns: resolvePronouns(form.pronounsPreset, form.pronounsCustom) || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        company: form.company.trim() || undefined,
        isPrivate: form.isPrivate,
      })

      // Merge the returned data back into the auth store
      setUser({
        ...user!,
        ...updated,
      })

      showToast('Profile updated!', 'success')
      router.push(`/${updated.username ?? form.username}`)
    } catch (err) {
      showToast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }, [form, user, validate, setUser, showToast, router])

  // -------------------------------------------------------------------------
  // GitHub connect
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

  const bioCharsLeft = BIO_MAX_LENGTH - form.bio.length
  const bioOverLimit = bioCharsLeft < 0

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
        return <span className="text-xs text-[var(--accent)] font-medium">Available</span>
      case 'taken':
        return <span className="text-xs text-[var(--error)] font-medium">Taken</span>
      default:
        return null
    }
  })()

  const inputClass =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors text-sm'

  const inputErrorClass =
    'w-full px-4 py-3 bg-[var(--background)] border border-[var(--error)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--error)] transition-colors text-sm'

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
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

      {/* Avatar */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Profile Photo</h2>
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 flex-shrink-0">
            {avatarPreview ? (
              <Image
                src={avatarPreview}
                alt="Avatar preview"
                fill
                className="rounded-full object-cover ring-2 ring-[var(--border)]"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center ring-2 ring-[var(--border)]">
                <svg className="w-8 h-8 text-[var(--foreground-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              </div>
            )}
          </div>

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
            onChange={handleAvatarFileChange}
            aria-label="Upload avatar"
          />
        </div>
      </section>

      {/* Basic info */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Basic Information</h2>

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
            onChange={(e) => updateField('displayName', e.target.value)}
            placeholder="Jane Doe"
            maxLength={60}
            className={fieldErrors.displayName ? inputErrorClass : inputClass}
          />
        </FieldGroup>

        <FieldGroup
          label="Username"
          htmlFor="username"
          error={fieldErrors.username}
        >
          <div className="space-y-1">
            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-[var(--foreground-secondary)] text-sm pointer-events-none">
                @
              </span>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="janedoe"
                maxLength={30}
                autoComplete="username"
                className={`${fieldErrors.username ? inputErrorClass : inputClass} pl-8`}
              />
            </div>
            {usernameAdornment}
          </div>
        </FieldGroup>

        <FieldGroup
          label="Bio"
          htmlFor="bio"
          error={fieldErrors.bio}
        >
          <div className="space-y-1">
            <textarea
              id="bio"
              value={form.bio}
              onChange={(e) => updateField('bio', e.target.value)}
              rows={3}
              placeholder="Tell the world a little about yourself…"
              className={`${fieldErrors.bio || bioOverLimit ? inputErrorClass : inputClass} resize-none`}
            />
            <p
              className={`text-xs text-right ${
                bioOverLimit
                  ? 'text-[var(--error)]'
                  : bioCharsLeft <= 20
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--foreground-secondary)]'
              }`}
            >
              {bioCharsLeft} characters remaining
            </p>
          </div>
        </FieldGroup>
      </section>

      {/* Links & social */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Links &amp; Social</h2>

        <FieldGroup
          label="Website"
          htmlFor="website"
          hint="Include https:// for external links."
          error={fieldErrors.website}
        >
          <input
            id="website"
            type="url"
            value={form.website}
            onChange={(e) => updateField('website', e.target.value)}
            placeholder="https://yoursite.com"
            className={fieldErrors.website ? inputErrorClass : inputClass}
          />
        </FieldGroup>

        <FieldGroup
          label="GitHub Username"
          htmlFor="githubUsername"
          error={fieldErrors.githubUsername}
        >
          {user?.githubId ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-lg">
              <svg className="w-4 h-4 text-[var(--accent)] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--accent)]">GitHub Connected</p>
                <p className="text-xs text-[var(--foreground-secondary)] truncate">
                  @{user.githubUsername ?? form.githubUsername}
                </p>
              </div>
              <input
                id="githubUsername"
                type="text"
                value={form.githubUsername}
                onChange={(e) => updateField('githubUsername', e.target.value)}
                placeholder="username"
                className="w-32 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  id="githubUsername"
                  type="text"
                  value={form.githubUsername}
                  onChange={(e) => updateField('githubUsername', e.target.value)}
                  placeholder="your-github-handle"
                  className={`${inputClass} flex-1`}
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
            <span className="absolute inset-y-0 left-4 flex items-center text-[var(--foreground-secondary)] text-sm pointer-events-none">
              @
            </span>
            <input
              id="twitterHandle"
              type="text"
              value={form.twitterHandle}
              onChange={(e) => updateField('twitterHandle', e.target.value)}
              placeholder="yourhandle"
              maxLength={50}
              className={`${fieldErrors.twitterHandle ? inputErrorClass : inputClass} pl-8`}
            />
          </div>
        </FieldGroup>
      </section>

      {/* Personal details */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Personal Details</h2>

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
            onChange={(e) => updateField('location', e.target.value)}
            placeholder="San Francisco, CA"
            maxLength={100}
            className={fieldErrors.location ? inputErrorClass : inputClass}
          />
        </FieldGroup>

        <FieldGroup
          label="Pronouns"
          htmlFor="pronounsPreset"
          error={fieldErrors.pronounsPreset}
        >
          <div className="space-y-2">
            <select
              id="pronounsPreset"
              value={form.pronounsPreset}
              onChange={(e) => updateField('pronounsPreset', e.target.value as PronounsPreset)}
              className={fieldErrors.pronounsPreset ? inputErrorClass : inputClass}
            >
              <option value="he/him">he/him</option>
              <option value="she/her">she/her</option>
              <option value="they/them">they/them</option>
              <option value="he/they">he/they</option>
              <option value="she/they">she/they</option>
              <option value="custom">Custom…</option>
            </select>
            {form.pronounsPreset === 'custom' && (
              <input
                type="text"
                value={form.pronounsCustom}
                onChange={(e) => updateField('pronounsCustom', e.target.value)}
                placeholder="e.g. xe/xem"
                maxLength={30}
                className={inputClass}
                aria-label="Custom pronouns"
              />
            )}
          </div>
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
            onChange={(e) => updateField('jobTitle', e.target.value)}
            placeholder="Software Engineer"
            maxLength={100}
            className={fieldErrors.jobTitle ? inputErrorClass : inputClass}
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
            onChange={(e) => updateField('company', e.target.value)}
            placeholder="Acme Corp"
            maxLength={100}
            className={fieldErrors.company ? inputErrorClass : inputClass}
          />
        </FieldGroup>
      </section>

      {/* Privacy */}
      <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Privacy</h2>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label htmlFor="isPrivate" className="text-sm font-medium text-[var(--foreground)] cursor-pointer">
              Private account
            </label>
            <p className="text-xs text-[var(--foreground-secondary)]">
              When enabled, only approved followers can see your posts and profile details.
            </p>
          </div>
          <Toggle
            id="isPrivate"
            checked={form.isPrivate}
            onChange={() => updateField('isPrivate', !form.isPrivate)}
          />
        </div>
      </section>

      {/* Save / Cancel */}
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

      {/* Avatar crop dialog */}
      {cropSrc && (
        <CropImageDialog
          src={cropSrc}
          cropAspectRatio={AVATAR_ASPECT_RATIO}
          onCropped={handleCroppedAvatar}
          onClose={closeCropDialog}
          title="Crop your photo"
        />
      )}
    </div>
  )
}
