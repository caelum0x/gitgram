'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { snippetService } from '@/services/snippetService';

// ── Supported languages ───────────────────────────────────────────────────────

type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'cpp'
  | 'bash'
  | 'json'
  | 'yaml'
  | 'sql';

const LANGUAGES: { value: SupportedLanguage; label: string }[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
];

const LANGUAGE_COLORS: Record<SupportedLanguage, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3572a5',
  go: '#00acd7',
  rust: '#dea584',
  java: '#b07219',
  cpp: '#f34b7d',
  bash: '#89e051',
  json: '#292929',
  yaml: '#cb171e',
  sql: '#e38c00',
};

const LIGHT_BG_LANGS = new Set<SupportedLanguage>(['javascript', 'bash']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormValues {
  title: string;
  description: string;
  language: SupportedLanguage;
  code: string;
}

interface FormErrors {
  title?: string;
  code?: string;
}

function validateForm(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.title.trim().length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  }
  if (values.code.trim().length === 0) {
    errors.code = 'Code is required.';
  }
  return errors;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LanguageBadge({ language }: { language: SupportedLanguage }) {
  const bg = LANGUAGE_COLORS[language] ?? '#6e7681';
  const textColor = LIGHT_BG_LANGS.has(language) ? '#1a1a2e' : '#e6edf3';

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold font-mono tracking-wide"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {language}
    </span>
  );
}

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FormField({ id, label, error, required, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium"
        style={{ color: 'var(--foreground)' }}
      >
        {label}
        {required && (
          <span className="ml-1 text-xs" style={{ color: '#f43f5e' }} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-xs font-medium" style={{ color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface PreviewPanelProps {
  values: FormValues;
}

function PreviewPanel({ values }: PreviewPanelProps) {
  const hasContent = values.title.trim() || values.code.trim();

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col h-full"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Preview header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b text-xs font-semibold tracking-wide uppercase"
        style={{ borderColor: 'var(--border)', color: 'var(--foreground-secondary)' }}
      >
        <span>Live Preview</span>
        <LanguageBadge language={values.language} />
      </div>

      {!hasContent ? (
        <div
          className="flex-1 flex items-center justify-center p-8 text-center"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          <div className="space-y-2">
            <svg
              className="w-10 h-10 mx-auto opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            <p className="text-sm">Start typing to see a preview</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {values.title.trim() && (
            <h3 className="text-base font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
              {values.title}
            </h3>
          )}
          {values.description.trim() && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
              {values.description}
            </p>
          )}
          {values.code.trim() && (
            <div
              className="rounded-lg overflow-auto"
              style={{ backgroundColor: '#0d1117', border: '1px solid var(--border)' }}
            >
              <div
                className="flex items-center justify-between px-3 py-1.5 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-xs font-mono" style={{ color: 'var(--foreground-secondary)' }}>
                  {values.language}
                </span>
              </div>
              <pre
                className="p-4 text-sm font-mono leading-relaxed overflow-x-auto"
                style={{ color: '#e6edf3', whiteSpace: 'pre' }}
                aria-label="Code preview"
              >
                <code>{values.code}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreateSnippetPage() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuthStore();

  const [values, setValues] = useState<FormValues>({
    title: '',
    description: '',
    language: 'typescript',
    code: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isInitialized, router]);

  const handleChange = useCallback(
    <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      // Clear error for the field being edited
      if (errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validateForm(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        // Focus the first errored field
        const firstErrorKey = Object.keys(validationErrors)[0];
        const el = document.getElementById(firstErrorKey);
        el?.focus();
        return;
      }

      setSubmitting(true);
      try {
        const created = await snippetService.createSnippet({
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          language: values.language,
          code: values.code,
        });
        router.push(`/snippets/${created.id}`);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err));
        setSubmitting(false);
      }
    },
    [values, router]
  );

  // Show nothing while auth state is being initialized (avoids flash of content)
  if (!isInitialized) return null;
  if (!isAuthenticated) return null;

  const inputBase: React.CSSProperties = {
    backgroundColor: 'var(--surface-secondary)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
    outline: 'none',
  };

  return (
    <main className="max-w-7xl mx-auto py-8 px-4">

      {/* ── Page header ── */}
      <header className="mb-8 space-y-1">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--foreground)' }}
        >
          Create a Snippet
        </h1>
        <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
          Share a reusable block of code with the community.
        </p>
      </header>

      {/* ── Two-column layout on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* ── Left: form ── */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-6"
          aria-label="Create snippet form"
        >
          {/* Title */}
          <FormField id="title" label="Title" required error={errors.title}>
            <input
              id="title"
              type="text"
              value={values.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g. Debounce hook in TypeScript"
              maxLength={120}
              className="w-full px-3 py-2.5 rounded-lg border text-sm transition-colors focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              style={inputBase}
              aria-required="true"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
          </FormField>

          {/* Description */}
          <FormField id="description" label="Description">
            <textarea
              id="description"
              value={values.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Briefly describe what this snippet does (optional)"
              rows={2}
              maxLength={300}
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-y transition-colors focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              style={{ ...inputBase, minHeight: '64px' }}
            />
          </FormField>

          {/* Language */}
          <FormField id="language" label="Language" required>
            <select
              id="language"
              value={values.language}
              onChange={(e) => handleChange('language', e.target.value as SupportedLanguage)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm transition-colors focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] cursor-pointer"
              style={inputBase}
              aria-required="true"
            >
              {LANGUAGES.map((lang) => (
                <option
                  key={lang.value}
                  value={lang.value}
                  style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
                >
                  {lang.label}
                </option>
              ))}
            </select>
          </FormField>

          {/* Code */}
          <FormField id="code" label="Code" required error={errors.code}>
            <textarea
              id="code"
              value={values.code}
              onChange={(e) => handleChange('code', e.target.value)}
              placeholder={`// Paste or type your ${values.language} code here`}
              rows={16}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono resize-y transition-colors focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              style={{
                ...inputBase,
                minHeight: '240px',
                tabSize: 2,
                lineHeight: '1.6',
              }}
              aria-required="true"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? 'code-error' : undefined}
            />
          </FormField>

          {/* Submit error */}
          {submitError && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: 'rgba(218,54,51,0.12)', color: 'var(--error)' }}
              role="alert"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.293 3.293a1 1 0 011.414 0l9 9a1 1 0 010 1.414l-9 9a1 1 0 01-1.414 0l-9-9a1 1 0 010-1.414l9-9z" />
              </svg>
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#fff',
              }}
            >
              {submitting ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Publishing…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 4v16m8-8H4" />
                  </svg>
                  Publish Snippet
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] disabled:opacity-60"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
            >
              Cancel
            </button>
          </div>
        </form>

        {/* ── Right: live preview ── */}
        <div className="lg:sticky lg:top-8" style={{ minHeight: '400px' }}>
          <PreviewPanel values={values} />
        </div>

      </div>
    </main>
  );
}
