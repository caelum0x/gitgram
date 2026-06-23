# Backend Testing Guide

## Test Structure

The backend tests are organized into the following categories:

### 1. API Endpoint Tests
- `auth.test.ts` - Authentication endpoints (register, login, token refresh)
- `posts.test.ts` - Post CRUD operations, likes, comments
- `users.test.ts` - User profiles, follow/unfollow, search, blocking

### 2. Service Layer Tests
- `services.test.ts` - Unit tests for service layer (email, payment, geocoding, 2FA)

### 3. Integration Tests
- `integration.test.ts` - Complex workflows (follow → post → like → comment → feed)

### 4. Test Utilities
- `setup.ts` - Test environment configuration
- `fixtures.ts` - Test data creation helpers

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- posts.test.ts
```

## Test Database Setup

Tests use a separate test database. Configure it via:

```env
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/gitgram_test
```

## Test Fixtures

Use the `testFixtures` helper to create test data:

```typescript
import { testFixtures } from './fixtures';

const user = await testFixtures.createTestUser('testuser', 'test@example.com');
const post = await testFixtures.createTestPost(user.id, 'Test content');
await testFixtures.cleanupTestData([user.id]);
```

## Writing New Tests

1. Import necessary modules:
```typescript
import request from 'supertest';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
```

2. Set up test data in `beforeAll`:
```typescript
beforeAll(async () => {
  app = createApp();
  // Create test users, get tokens, etc.
});
```

3. Clean up in `afterAll`:
```typescript
afterAll(async () => {
  // Delete test data
  await prisma.$disconnect();
});
```

4. Write test cases:
```typescript
it('should do something', async () => {
  const response = await request(app)
    .get('/api/v1/endpoint')
    .set('Authorization', `Bearer ${token}`);
  
  expect(response.status).toBe(200);
});
```

## Coverage Goals

- **Unit Tests**: 80%+ coverage for services
- **Integration Tests**: All major workflows covered
- **API Tests**: All endpoints have at least basic tests

## Notes

- Tests automatically disable external service calls (email, payment, geocoding)
- Test database should be separate from development/production
- All tests clean up after themselves

