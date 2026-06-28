/**
 * Unit tests for organizationService
 *
 * All Prisma calls are intercepted by the in-memory mock in tests/setup.ts.
 * Tests seed __rows directly, then call the service and assert behaviour.
 *
 * The $transaction mock delegates to the same mockPrisma instance so create
 * operations inside transactions are visible after the call returns.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID, TEST_USER_ID_2 } from '../helpers';
import { organizationService } from '../../src/services/organizationService';

const USER_3 = 'user-003';
const ORG_ID = 'org-001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRow(model: any, row: Record<string, unknown>) {
  model.__rows.push(row);
}

function clearAll() {
  [mockPrisma.organization, mockPrisma.organizationMember, mockPrisma.user, mockPrisma.repository].forEach(
    (m) => m.__rows.splice(0)
  );
}

/** Seed the canonical org with one OWNER member. */
function seedOrgWithOwner(ownerId = TEST_USER_ID) {
  seedRow(mockPrisma.organization, {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    description: null,
    website: null,
    location: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { members: 1, repositories: 0 },
  });
  seedRow(mockPrisma.organizationMember, {
    id: 'mem-owner',
    organizationId: ORG_ID,
    userId: ownerId,
    role: 'OWNER',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Test suite: createOrganization
// ---------------------------------------------------------------------------

describe('organizationService.createOrganization', () => {
  beforeEach(() => {
    clearAll();
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user' });
  });

  it('creates org and returns it with a valid name and slug', async () => {
    const result = await organizationService.createOrganization(TEST_USER_ID, {
      name: 'My Org',
      slug: 'my-org',
      description: 'A test org',
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('My Org');
    expect(result.slug).toBe('my-org');
  });

  it('registers the creator as OWNER via transaction', async () => {
    await organizationService.createOrganization(TEST_USER_ID, {
      name: 'Tx Org',
      slug: 'tx-org',
    });

    // The org is created with a nested member write in the same transaction, so
    // organization.create must be called with a members.create payload that
    // registers the caller as OWNER (the nested write is atomic with the org).
    const createCall = (mockPrisma.organization.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.members.create).toMatchObject({
      userId: TEST_USER_ID,
      role: 'OWNER',
    });
  });

  it('throws invalidField when name is empty', async () => {
    await expect(
      organizationService.createOrganization(TEST_USER_ID, { name: '   ', slug: 'valid-slug' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws invalidField when slug contains invalid characters', async () => {
    // The service normalizes case (UPPER -> upper), so uppercase alone is valid.
    // A slug with spaces / illegal characters must still be rejected.
    await expect(
      organizationService.createOrganization(TEST_USER_ID, { name: 'Valid', slug: 'bad slug!' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws invalidField when slug starts with a hyphen', async () => {
    await expect(
      organizationService.createOrganization(TEST_USER_ID, { name: 'Valid', slug: '-bad' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws alreadyExists when slug is taken', async () => {
    seedRow(mockPrisma.organization, { id: 'existing-org', slug: 'taken-slug', name: 'Existing' });

    await expect(
      organizationService.createOrganization(TEST_USER_ID, { name: 'New Org', slug: 'taken-slug' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
// Test suite: getOrganization
// ---------------------------------------------------------------------------

describe('organizationService.getOrganization', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner();
  });

  it('returns org with memberCount and repoCount', async () => {
    const result = await organizationService.getOrganization('test-org');
    expect(result).toHaveProperty('memberCount');
    expect(result).toHaveProperty('repoCount');
    expect(result.slug).toBe('test-org');
  });

  it('is case-insensitive on slug lookup', async () => {
    const result = await organizationService.getOrganization('TEST-ORG');
    expect(result.id).toBe(ORG_ID);
  });

  it('throws notFound when slug does not exist', async () => {
    await expect(organizationService.getOrganization('nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ---------------------------------------------------------------------------
// Test suite: addMember
// ---------------------------------------------------------------------------

describe('organizationService.addMember', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner(TEST_USER_ID);
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'new-member' });
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user' });
  });

  it('adds a member with default role "member"', async () => {
    const result = await organizationService.addMember(ORG_ID, TEST_USER_ID, {
      userId: TEST_USER_ID_2,
    });

    expect(result.userId).toBe(TEST_USER_ID_2);
    expect(result.role).toBe('MEMBER');
  });

  it('throws forbidden when caller is not a member', async () => {
    const outsider = 'outsider-id';
    seedRow(mockPrisma.user, { id: outsider, username: 'outsider' });

    await expect(
      organizationService.addMember(ORG_ID, outsider, { userId: TEST_USER_ID_2 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws forbidden when admin tries to grant OWNER role', async () => {
    // Make user2 an admin
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-admin',
      organizationId: ORG_ID,
      userId: TEST_USER_ID_2,
      role: 'ADMIN',
      createdAt: new Date(),
    });
    const user3 = 'user-new';
    seedRow(mockPrisma.user, { id: user3, username: 'user-new' });

    await expect(
      organizationService.addMember(ORG_ID, TEST_USER_ID_2, {
        userId: user3,
        role: 'owner',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws alreadyExists when user is already a member', async () => {
    // seed user2 as existing member first
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-existing',
      organizationId: ORG_ID,
      userId: TEST_USER_ID_2,
      role: 'MEMBER',
      createdAt: new Date(),
    });

    await expect(
      organizationService.addMember(ORG_ID, TEST_USER_ID, { userId: TEST_USER_ID_2 })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws userNotFound when target user does not exist', async () => {
    await expect(
      organizationService.addMember(ORG_ID, TEST_USER_ID, { userId: 'ghost-user' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Test suite: removeMember
// ---------------------------------------------------------------------------

describe('organizationService.removeMember', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner(TEST_USER_ID);
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user' });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'member-user' });
    // Seed user2 as a regular member
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-user2',
      organizationId: ORG_ID,
      userId: TEST_USER_ID_2,
      role: 'MEMBER',
      createdAt: new Date(),
    });
  });

  it('owner can remove a regular member', async () => {
    const result = await organizationService.removeMember(ORG_ID, TEST_USER_ID, TEST_USER_ID_2);
    expect(result).toEqual({ success: true });
    const remaining = mockPrisma.organizationMember.__rows.find(
      (m: any) => m.userId === TEST_USER_ID_2 && m.organizationId === ORG_ID
    );
    expect(remaining).toBeUndefined();
  });

  it('throws forbidden when a non-member tries to remove', async () => {
    const outsider = 'outsider-id';
    await expect(
      organizationService.removeMember(ORG_ID, outsider, TEST_USER_ID_2)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws forbidden when admin tries to remove an owner', async () => {
    // Make user2 an admin
    mockPrisma.organizationMember.__rows.find(
      (m: any) => m.userId === TEST_USER_ID_2
    ).role = 'ADMIN';

    // Seed user3 as an owner
    seedRow(mockPrisma.user, { id: USER_3, username: 'second-owner' });
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-owner2',
      organizationId: ORG_ID,
      userId: USER_3,
      role: 'OWNER',
      createdAt: new Date(),
    });

    await expect(
      organizationService.removeMember(ORG_ID, TEST_USER_ID_2, USER_3)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws badRequest when removing the last owner', async () => {
    // Try to remove the only owner
    await expect(
      organizationService.removeMember(ORG_ID, TEST_USER_ID, TEST_USER_ID)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws notFound when target member is not in the org', async () => {
    const ghost = 'ghost-user';
    await expect(
      organizationService.removeMember(ORG_ID, TEST_USER_ID, ghost)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Test suite: updateMemberRole
// ---------------------------------------------------------------------------

describe('organizationService.updateMemberRole', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner(TEST_USER_ID);
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user' });
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'member-user' });
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-user2',
      organizationId: ORG_ID,
      userId: TEST_USER_ID_2,
      role: 'MEMBER',
      createdAt: new Date(),
    });
  });

  it('owner can promote a member to admin', async () => {
    const result = await organizationService.updateMemberRole(ORG_ID, TEST_USER_ID, TEST_USER_ID_2, 'admin');
    expect(result.role).toBe('ADMIN');
  });

  it('owner can promote a member to owner', async () => {
    const result = await organizationService.updateMemberRole(ORG_ID, TEST_USER_ID, TEST_USER_ID_2, 'owner');
    expect(result.role).toBe('OWNER');
  });

  it('throws forbidden when admin tries to grant owner role', async () => {
    // Promote user2 to admin
    mockPrisma.organizationMember.__rows.find(
      (m: any) => m.userId === TEST_USER_ID_2
    ).role = 'ADMIN';

    seedRow(mockPrisma.user, { id: USER_3, username: 'user3' });
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-user3',
      organizationId: ORG_ID,
      userId: USER_3,
      role: 'MEMBER',
      createdAt: new Date(),
    });

    await expect(
      organizationService.updateMemberRole(ORG_ID, TEST_USER_ID_2, USER_3, 'owner')
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws badRequest when trying to demote the last owner', async () => {
    // Only one owner (TEST_USER_ID) — trying to demote should fail
    await expect(
      organizationService.updateMemberRole(ORG_ID, TEST_USER_ID, TEST_USER_ID, 'member')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws notFound when target member does not exist', async () => {
    await expect(
      organizationService.updateMemberRole(ORG_ID, TEST_USER_ID, 'ghost', 'admin')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Test suite: getMembers
// ---------------------------------------------------------------------------

describe('organizationService.getMembers', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner(TEST_USER_ID);
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user', displayName: 'Owner', avatar: null });

    for (let i = 0; i < 5; i++) {
      const uid = `member-${i}`;
      seedRow(mockPrisma.user, { id: uid, username: `user${i}`, displayName: null, avatar: null });
      seedRow(mockPrisma.organizationMember, {
        id: `mem-${i}`,
        organizationId: ORG_ID,
        userId: uid,
        role: 'MEMBER',
        createdAt: new Date(),
      });
    }
  });

  it('returns members and meta object', async () => {
    const result = await organizationService.getMembers(ORG_ID);
    expect(result).toHaveProperty('members');
    expect(result).toHaveProperty('meta');
    expect(Array.isArray(result.members)).toBe(true);
  });

  it('meta contains total, page, and limit', async () => {
    const result = await organizationService.getMembers(ORG_ID);
    expect(result.meta).toHaveProperty('total');
    expect(result.meta).toHaveProperty('page');
    expect(result.meta).toHaveProperty('limit');
  });

  it('each member has id, userId, role, and joinedAt', async () => {
    const result = await organizationService.getMembers(ORG_ID);
    if (result.members.length > 0) {
      const member = result.members[0];
      expect(member).toHaveProperty('id');
      expect(member).toHaveProperty('userId');
      expect(member).toHaveProperty('role');
      expect(member).toHaveProperty('joinedAt');
    }
  });

  it('respects pagination — limit controls page size', async () => {
    const result = await organizationService.getMembers(ORG_ID, { limit: 2 });
    expect(result.members.length).toBeLessThanOrEqual(2);
    expect(result.meta.limit).toBe(2);
  });

  it('second page returns different members', async () => {
    const page1 = await organizationService.getMembers(ORG_ID, { page: 1, limit: 2 });
    const page2 = await organizationService.getMembers(ORG_ID, { page: 2, limit: 2 });

    const page1Ids = new Set(page1.members.map((m) => m.id));
    for (const member of page2.members) {
      expect(page1Ids.has(member.id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Test suite: deleteOrganization
// ---------------------------------------------------------------------------

describe('organizationService.deleteOrganization', () => {
  beforeEach(() => {
    clearAll();
    seedOrgWithOwner(TEST_USER_ID);
    seedRow(mockPrisma.user, { id: TEST_USER_ID, username: 'owner-user' });
  });

  it('owner can delete the organization', async () => {
    const result = await organizationService.deleteOrganization(ORG_ID, TEST_USER_ID);
    expect(result).toEqual({ success: true });

    // Org row should be gone
    const remaining = mockPrisma.organization.__rows.find((o: any) => o.id === ORG_ID);
    expect(remaining).toBeUndefined();
  });

  it('throws forbidden when a non-owner tries to delete', async () => {
    seedRow(mockPrisma.user, { id: TEST_USER_ID_2, username: 'admin-user' });
    seedRow(mockPrisma.organizationMember, {
      id: 'mem-admin',
      organizationId: ORG_ID,
      userId: TEST_USER_ID_2,
      role: 'ADMIN',
      createdAt: new Date(),
    });

    await expect(
      organizationService.deleteOrganization(ORG_ID, TEST_USER_ID_2)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws forbidden when caller is not a member at all', async () => {
    const outsider = 'outsider-id';
    await expect(
      organizationService.deleteOrganization(ORG_ID, outsider)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('org no longer queryable by slug after deletion', async () => {
    await organizationService.deleteOrganization(ORG_ID, TEST_USER_ID);
    await expect(organizationService.getOrganization('test-org')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
