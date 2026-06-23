/**
 * Centralized input validation utilities using Zod.
 *
 * These schemas are framework-agnostic — they work in Express route handlers,
 * tRPC procedures, background jobs, or any other context.  Use parseBody() to
 * parse untrusted input and throw a structured ApiError on failure.
 *
 * Install peer dependency if not already present:
 *   npm install zod
 */

import { z, ZodSchema, ZodError } from 'zod';
import { ApiError } from '../middleware/errorHandler';

// ---------------------------------------------------------------------------
// Primitive field validators
// ---------------------------------------------------------------------------

/** 3–30 chars, letters / digits / underscore / hyphen only */
export const usernameValidator = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, digits, underscores, and hyphens');

/** RFC-5321 max length cap on top of Zod's built-in email check */
export const emailValidator = z
  .string()
  .email('Must be a valid email address')
  .max(254, 'Email must be at most 254 characters');

/**
 * Password must be 8–128 chars and contain at least one letter and one digit.
 * Upper-case is not mandatory so social-sign-in users can set simple passwords
 * without frustration; stricter rules can be layered by callers.
 */
export const passwordValidator = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/** Optional free-text bio capped at Twitter-style 160 chars */
export const bioValidator = z
  .string()
  .max(160, 'Bio must be at most 160 characters');

/** Optional absolute HTTP/HTTPS URL */
export const urlValidator = z
  .string()
  .url('Must be a valid URL')
  .optional();

/**
 * GitHub username: 1–39 chars, letters / digits / hyphens.
 * Leading/trailing hyphens are technically disallowed by GitHub but we only
 * enforce the character set here; stricter validation can be done via API.
 */
export const githubUsernameValidator = z
  .string()
  .max(39, 'GitHub username must be at most 39 characters')
  .regex(/^[a-zA-Z0-9-]+$/, 'GitHub username may only contain letters, digits, and hyphens')
  .optional();

/** Post body: 1–3 000 chars */
export const postContentValidator = z
  .string()
  .min(1, 'Post content must not be empty')
  .max(3000, 'Post content must be at most 3 000 characters');

/** Source code body: 1–50 000 chars */
export const snippetCodeValidator = z
  .string()
  .min(1, 'Code must not be empty')
  .max(50000, 'Code must be at most 50 000 characters');

/** Snippet title: 3–200 chars */
export const snippetTitleValidator = z
  .string()
  .min(3, 'Snippet title must be at least 3 characters')
  .max(200, 'Snippet title must be at most 200 characters');

/** Collection / bookmark-folder name: 1–100 chars */
export const collectionNameValidator = z
  .string()
  .min(1, 'Collection name must not be empty')
  .max(100, 'Collection name must be at most 100 characters');

/** Enumerated report reasons — kept narrow to aid moderation tooling */
export const reportReasonValidator = z.enum(
  ['spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'other'],
  { error: 'Invalid report reason' }
);

// ---------------------------------------------------------------------------
// Composite request body schemas
// ---------------------------------------------------------------------------

export const createPostSchema = z.object({
  content: postContentValidator,
  /** Optional reference to a repository account */
  repositoryId: z.string().optional(),
  /** Array of hashtag strings, each max 50 chars, at most 30 tags */
  hashtags: z
    .array(z.string().max(50, 'Each hashtag must be at most 50 characters'))
    .max(30, 'At most 30 hashtags are allowed')
    .optional(),
});

export const createSnippetSchema = z.object({
  title: snippetTitleValidator,
  description: z
    .string()
    .max(1000, 'Description must be at most 1 000 characters')
    .optional(),
  code: snippetCodeValidator,
  /** Programming language identifier */
  language: z
    .string()
    .max(50, 'Language identifier must be at most 50 characters')
    .optional(),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .max(60, 'Display name must be at most 60 characters')
    .optional(),
  bio: bioValidator.optional(),
  website: urlValidator,
  githubUsername: githubUsernameValidator,
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  jobTitle: z
    .string()
    .max(100, 'Job title must be at most 100 characters')
    .optional(),
  company: z
    .string()
    .max(100, 'Company must be at most 100 characters')
    .optional(),
});

export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be at most 100')
    .default(20),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// parseBody helper
// ---------------------------------------------------------------------------

/**
 * Parse and validate `body` against the provided Zod `schema`.
 *
 * On success the typed, coerced value is returned.
 * On failure an `ApiError` with type `validation_error` is thrown so that the
 * Express error handler can render a consistent JSON error response without any
 * boilerplate in the calling controller.
 *
 * @example
 * const input = parseBody(createPostSchema, req.body);
 * // input is typed as CreatePostInput
 */
export function parseBody<TSchema extends ZodSchema>(
  schema: TSchema,
  body: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(body);

  if (result.success) {
    return result.data as z.infer<TSchema>;
  }

  const zodError: ZodError = result.error;
  const firstIssue = zodError.issues[0];

  // Build a human-readable field path (e.g. "hashtags[2]")
  const param =
    firstIssue?.path.length > 0
      ? firstIssue.path
          .map((segment) =>
            typeof segment === 'number' ? `[${segment}]` : segment
          )
          .join('.')
          .replace(/\.\[/g, '[')
      : undefined;

  const message = firstIssue?.message ?? 'Validation failed';

  throw new ApiError(
    'validation_error',
    'invalid_input',
    message,
    400,
    param,
    { issues: zodError.issues }
  );
}
