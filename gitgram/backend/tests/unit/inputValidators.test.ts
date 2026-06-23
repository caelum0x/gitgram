/**
 * Unit tests for src/validators/inputValidators.ts
 *
 * Each primitive validator and composite schema is exercised with both valid
 * and invalid inputs.  The parseBody() helper is tested for happy-path
 * parsing and error throwing.
 *
 * Framework: Jest (ts-jest) — same runner used across the backend test suite.
 * No database, network, or Express app is required.
 */

// ---------------------------------------------------------------------------
// Module-level mocks — keep the logger silent during tests
// ---------------------------------------------------------------------------

jest.mock('../../src/utils/logger', () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  usernameValidator,
  emailValidator,
  passwordValidator,
  bioValidator,
  urlValidator,
  githubUsernameValidator,
  postContentValidator,
  snippetCodeValidator,
  snippetTitleValidator,
  collectionNameValidator,
  reportReasonValidator,
  createPostSchema,
  createSnippetSchema,
  updateProfileSchema,
  paginationSchema,
  parseBody,
  type CreatePostInput,
  type CreateSnippetInput,
  type UpdateProfileInput,
  type PaginationInput,
} from '../../src/validators/inputValidators';

import { ApiError } from '../../src/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the first validation error message for a given value, or null */
function firstError(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } }, value: unknown): string | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return result.error?.issues[0]?.message ?? 'unknown error';
}

function isValid(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): boolean {
  return schema.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// usernameValidator
// ---------------------------------------------------------------------------

describe('usernameValidator', () => {
  test('accepts a standard alphanumeric username', () => {
    expect(isValid(usernameValidator, 'john_doe')).toBe(true);
  });

  test('accepts hyphens and underscores', () => {
    expect(isValid(usernameValidator, 'dev-user_42')).toBe(true);
  });

  test('rejects username shorter than 3 characters', () => {
    expect(isValid(usernameValidator, 'ab')).toBe(false);
  });

  test('rejects username longer than 30 characters', () => {
    expect(isValid(usernameValidator, 'a'.repeat(31))).toBe(false);
  });

  test('rejects username with spaces', () => {
    expect(isValid(usernameValidator, 'bad username')).toBe(false);
  });

  test('rejects username with special characters', () => {
    expect(isValid(usernameValidator, 'user@name!')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// emailValidator
// ---------------------------------------------------------------------------

describe('emailValidator', () => {
  test('accepts a well-formed email', () => {
    expect(isValid(emailValidator, 'user@example.com')).toBe(true);
  });

  test('accepts email with plus-alias', () => {
    expect(isValid(emailValidator, 'user+tag@example.co.uk')).toBe(true);
  });

  test('rejects email without @', () => {
    expect(isValid(emailValidator, 'notanemail')).toBe(false);
  });

  test('rejects email without domain', () => {
    expect(isValid(emailValidator, 'user@')).toBe(false);
  });

  test('rejects email longer than 254 characters', () => {
    const longLocal = 'a'.repeat(245);
    expect(isValid(emailValidator, `${longLocal}@example.com`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// passwordValidator
// ---------------------------------------------------------------------------

describe('passwordValidator', () => {
  test('accepts a valid password with letter and digit', () => {
    expect(isValid(passwordValidator, 'secret42')).toBe(true);
  });

  test('accepts a long complex password', () => {
    expect(isValid(passwordValidator, 'C0rrect!H0rseBatteryStaple')).toBe(true);
  });

  test('rejects password shorter than 8 characters', () => {
    expect(isValid(passwordValidator, 'ab1')).toBe(false);
  });

  test('rejects password longer than 128 characters', () => {
    expect(isValid(passwordValidator, 'aB1' + 'x'.repeat(130))).toBe(false);
  });

  test('rejects password with no letters', () => {
    expect(isValid(passwordValidator, '12345678')).toBe(false);
  });

  test('rejects password with no digits', () => {
    expect(isValid(passwordValidator, 'NoDigitsHere')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bioValidator
// ---------------------------------------------------------------------------

describe('bioValidator', () => {
  test('accepts an empty string', () => {
    expect(isValid(bioValidator, '')).toBe(true);
  });

  test('accepts bio at exactly 160 chars', () => {
    expect(isValid(bioValidator, 'x'.repeat(160))).toBe(true);
  });

  test('rejects bio longer than 160 chars', () => {
    expect(isValid(bioValidator, 'x'.repeat(161))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// urlValidator
// ---------------------------------------------------------------------------

describe('urlValidator', () => {
  test('accepts an https URL', () => {
    expect(isValid(urlValidator, 'https://example.com')).toBe(true);
  });

  test('accepts undefined (optional)', () => {
    expect(isValid(urlValidator, undefined)).toBe(true);
  });

  test('rejects a plain string that is not a URL', () => {
    expect(isValid(urlValidator, 'not-a-url')).toBe(false);
  });

  test('rejects a URL with no protocol', () => {
    expect(isValid(urlValidator, 'example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// githubUsernameValidator
// ---------------------------------------------------------------------------

describe('githubUsernameValidator', () => {
  test('accepts a valid GitHub username', () => {
    expect(isValid(githubUsernameValidator, 'octocat')).toBe(true);
  });

  test('accepts undefined (optional)', () => {
    expect(isValid(githubUsernameValidator, undefined)).toBe(true);
  });

  test('rejects username longer than 39 characters', () => {
    expect(isValid(githubUsernameValidator, 'a'.repeat(40))).toBe(false);
  });

  test('rejects username with underscore (not allowed on GitHub)', () => {
    expect(isValid(githubUsernameValidator, 'bad_name')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// postContentValidator
// ---------------------------------------------------------------------------

describe('postContentValidator', () => {
  test('accepts normal post content', () => {
    expect(isValid(postContentValidator, 'Hello, world!')).toBe(true);
  });

  test('accepts content at exactly 3000 chars', () => {
    expect(isValid(postContentValidator, 'x'.repeat(3000))).toBe(true);
  });

  test('rejects empty string', () => {
    expect(isValid(postContentValidator, '')).toBe(false);
  });

  test('rejects content longer than 3000 characters', () => {
    expect(isValid(postContentValidator, 'x'.repeat(3001))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// snippetCodeValidator
// ---------------------------------------------------------------------------

describe('snippetCodeValidator', () => {
  test('accepts a short code snippet', () => {
    expect(isValid(snippetCodeValidator, 'console.log("hi")')).toBe(true);
  });

  test('accepts code at exactly 50 000 chars', () => {
    expect(isValid(snippetCodeValidator, 'x'.repeat(50000))).toBe(true);
  });

  test('rejects empty code', () => {
    expect(isValid(snippetCodeValidator, '')).toBe(false);
  });

  test('rejects code longer than 50 000 characters', () => {
    expect(isValid(snippetCodeValidator, 'x'.repeat(50001))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// snippetTitleValidator
// ---------------------------------------------------------------------------

describe('snippetTitleValidator', () => {
  test('accepts a normal title', () => {
    expect(isValid(snippetTitleValidator, 'My Snippet')).toBe(true);
  });

  test('rejects title shorter than 3 characters', () => {
    expect(isValid(snippetTitleValidator, 'ab')).toBe(false);
  });

  test('rejects title longer than 200 characters', () => {
    expect(isValid(snippetTitleValidator, 'x'.repeat(201))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// collectionNameValidator
// ---------------------------------------------------------------------------

describe('collectionNameValidator', () => {
  test('accepts a valid collection name', () => {
    expect(isValid(collectionNameValidator, 'Favourites')).toBe(true);
  });

  test('rejects an empty string', () => {
    expect(isValid(collectionNameValidator, '')).toBe(false);
  });

  test('rejects a name longer than 100 characters', () => {
    expect(isValid(collectionNameValidator, 'x'.repeat(101))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reportReasonValidator
// ---------------------------------------------------------------------------

describe('reportReasonValidator', () => {
  const validReasons = ['spam', 'harassment', 'inappropriate', 'copyright', 'misinformation', 'other'] as const;

  test.each(validReasons)('accepts reason "%s"', (reason) => {
    expect(isValid(reportReasonValidator, reason)).toBe(true);
  });

  test('rejects an unlisted reason', () => {
    expect(isValid(reportReasonValidator, 'hate_speech')).toBe(false);
  });

  test('rejects an empty string', () => {
    expect(isValid(reportReasonValidator, '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPostSchema
// ---------------------------------------------------------------------------

describe('createPostSchema', () => {
  const validPost: CreatePostInput = {
    content: 'Just shipped a new feature!',
  };

  test('accepts minimal valid post', () => {
    expect(isValid(createPostSchema, validPost)).toBe(true);
  });

  test('accepts post with optional hashtags and repositoryId', () => {
    expect(
      isValid(createPostSchema, { ...validPost, hashtags: ['typescript', 'oss'], repositoryId: 'clxyz123' })
    ).toBe(true);
  });

  test('rejects post with empty content', () => {
    expect(isValid(createPostSchema, { content: '' })).toBe(false);
  });

  test('rejects post when content is missing', () => {
    expect(isValid(createPostSchema, {})).toBe(false);
  });

  test('rejects post with too many hashtags (>30)', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `tag${i}`);
    expect(isValid(createPostSchema, { content: 'hi', hashtags: tags })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSnippetSchema
// ---------------------------------------------------------------------------

describe('createSnippetSchema', () => {
  const validSnippet: CreateSnippetInput = {
    title: 'Hello World in TS',
    code: 'console.log("hello")',
    language: 'typescript',
  };

  test('accepts a fully populated snippet', () => {
    expect(isValid(createSnippetSchema, validSnippet)).toBe(true);
  });

  test('accepts snippet without optional fields', () => {
    expect(isValid(createSnippetSchema, { title: 'Min Snippet', code: 'x = 1' })).toBe(true);
  });

  test('rejects snippet with title too short', () => {
    expect(isValid(createSnippetSchema, { title: 'ab', code: 'x = 1' })).toBe(false);
  });

  test('rejects snippet with empty code', () => {
    expect(isValid(createSnippetSchema, { title: 'Valid Title', code: '' })).toBe(false);
  });

  test('rejects snippet when both title and code are missing', () => {
    expect(isValid(createSnippetSchema, {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateProfileSchema
// ---------------------------------------------------------------------------

describe('updateProfileSchema', () => {
  const validProfile: UpdateProfileInput = {
    displayName: 'Jane Doe',
    bio: 'Full-stack developer',
    website: 'https://janedoe.dev',
    githubUsername: 'janedoe',
    location: 'Berlin',
    jobTitle: 'Senior Engineer',
    company: 'Gitgram',
  };

  test('accepts a fully populated profile update', () => {
    expect(isValid(updateProfileSchema, validProfile)).toBe(true);
  });

  test('accepts empty object (all fields optional)', () => {
    expect(isValid(updateProfileSchema, {})).toBe(true);
  });

  test('rejects bio longer than 160 chars', () => {
    expect(isValid(updateProfileSchema, { bio: 'x'.repeat(161) })).toBe(false);
  });

  test('rejects invalid website URL', () => {
    expect(isValid(updateProfileSchema, { website: 'not-a-url' })).toBe(false);
  });

  test('rejects GitHub username with underscore', () => {
    expect(isValid(updateProfileSchema, { githubUsername: 'bad_name' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// paginationSchema
// ---------------------------------------------------------------------------

describe('paginationSchema', () => {
  test('applies defaults when no values provided', () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  test('coerces string numbers', () => {
    const result = paginationSchema.parse({ page: '3', limit: '50' });
    expect(result).toEqual({ page: 3, limit: 50 });
  });

  test('rejects page less than 1', () => {
    expect(isValid(paginationSchema, { page: 0 })).toBe(false);
  });

  test('rejects limit greater than 100', () => {
    expect(isValid(paginationSchema, { limit: 101 })).toBe(false);
  });

  test('rejects non-integer page', () => {
    expect(isValid(paginationSchema, { page: 1.5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseBody helper
// ---------------------------------------------------------------------------

describe('parseBody', () => {
  test('returns parsed data on success', () => {
    const input = { content: 'Test post' };
    const result: CreatePostInput = parseBody(createPostSchema, input);
    expect(result.content).toBe('Test post');
  });

  test('throws ApiError on validation failure', () => {
    expect(() => parseBody(createPostSchema, {})).toThrow(ApiError);
  });

  test('thrown ApiError has validation_error type', () => {
    try {
      parseBody(createPostSchema, { content: '' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.type).toBe('validation_error');
      expect(apiErr.statusCode).toBe(400);
    }
  });

  test('thrown ApiError carries a param pointing to the failing field', () => {
    try {
      parseBody(createPostSchema, { content: '' });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.param).toBe('content');
    }
  });

  test('thrown ApiError details include zod issues array', () => {
    try {
      parseBody(createSnippetSchema, { title: 'ab', code: '' });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.details).toHaveProperty('issues');
      expect(Array.isArray((apiErr.details as { issues: unknown[] }).issues)).toBe(true);
    }
  });

  test('paginationSchema parseBody coerces and applies defaults', () => {
    const result: PaginationInput = parseBody(paginationSchema, { page: '2' });
    expect(result).toEqual({ page: 2, limit: 20 });
  });
});
