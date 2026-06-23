import { OrgRole as PrismaOrgRole, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { Errors } from '../middleware/errorHandler';

/**
 * API-facing organization role. The database stores these as an uppercase
 * Prisma enum (OWNER | ADMIN | MEMBER); this module translates between the two
 * so callers only ever deal with the lowercase form.
 */
export type OrgRole = 'owner' | 'admin' | 'member';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  website?: string;
  location?: string;
}

export interface AddMemberInput {
  userId: string;
  role?: OrgRole;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPrismaRole(role: OrgRole): PrismaOrgRole {
  return role.toUpperCase() as PrismaOrgRole;
}

function toApiRole(role: PrismaOrgRole): OrgRole {
  return role.toLowerCase() as OrgRole;
}

function normalizePagination(options: PaginationOptions = {}): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(DEFAULT_PAGE, Math.floor(options.page ?? DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Resolve the caller's membership in an organization, throwing if it is missing.
 * Optionally enforce that the membership role is in `allowed`.
 */
async function requireMembership(
  organizationId: string,
  userId: string,
  allowed?: PrismaOrgRole[]
): Promise<{ role: PrismaOrgRole }> {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });

  if (!membership) {
    throw Errors.forbidden('You are not a member of this organization');
  }

  if (allowed && !allowed.includes(membership.role)) {
    throw Errors.forbidden('You do not have permission to perform this action');
  }

  return membership;
}

export const organizationService = {
  /**
   * Create an organization and register the creator as its OWNER in a single
   * transaction so an org is never left without an owner.
   */
  async createOrganization(ownerId: string, input: CreateOrganizationInput) {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();

    if (!name) {
      throw Errors.invalidField('name', 'Organization name is required');
    }
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(slug)) {
      throw Errors.invalidField(
        'slug',
        'Slug must be 1-39 chars: lowercase letters, numbers and hyphens'
      );
    }

    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw Errors.alreadyExists('Organization slug');
    }

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          slug,
          description: input.description?.trim() || null,
          members: {
            create: { userId: ownerId, role: PrismaOrgRole.OWNER },
          },
        },
      });

      return organization;
    });
  },

  /**
   * Public organization view: details plus member and repository counts.
   */
  async getOrganization(slug: string) {
    const normalized = slug.trim().toLowerCase();
    const organization = await prisma.organization.findUnique({
      where: { slug: normalized },
      include: {
        _count: { select: { members: true, repositories: true } },
      },
    });

    if (!organization) {
      throw Errors.notFound('Organization', slug);
    }

    const { _count, ...rest } = organization;
    return {
      ...rest,
      memberCount: _count.members,
      repoCount: _count.repositories,
    };
  },

  /**
   * Update organization profile fields. Admin- or owner-gated.
   */
  async updateOrganization(orgId: string, userId: string, updates: UpdateOrganizationInput) {
    await requireMembership(orgId, userId, [PrismaOrgRole.OWNER, PrismaOrgRole.ADMIN]);

    const data: Prisma.OrganizationUpdateInput = {};
    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name) {
        throw Errors.invalidField('name', 'Organization name cannot be empty');
      }
      data.name = name;
    }
    if (updates.description !== undefined) {
      data.description = updates.description.trim() || null;
    }
    if (updates.website !== undefined) {
      data.website = updates.website.trim() || null;
    }
    if (updates.location !== undefined) {
      data.location = updates.location.trim() || null;
    }

    return prisma.organization.update({ where: { id: orgId }, data });
  },

  /**
   * Invite/add a member. Only owners and admins may add members, and only an
   * owner may grant the OWNER role.
   */
  async addMember(orgId: string, adminId: string, input: AddMemberInput) {
    const actor = await requireMembership(orgId, adminId, [
      PrismaOrgRole.OWNER,
      PrismaOrgRole.ADMIN,
    ]);

    const role = toPrismaRole(input.role ?? 'member');
    if (role === PrismaOrgRole.OWNER && actor.role !== PrismaOrgRole.OWNER) {
      throw Errors.forbidden('Only an owner can grant the owner role');
    }

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) {
      throw Errors.userNotFound(input.userId);
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: input.userId } },
      select: { id: true },
    });
    if (existing) {
      throw Errors.alreadyExists('Organization membership');
    }

    return prisma.organizationMember.create({
      data: { organizationId: orgId, userId: input.userId, role },
    });
  },

  /**
   * Remove a member. Owners/admins only. The last (or sole) owner cannot be
   * removed, preventing an ownerless organization.
   */
  async removeMember(orgId: string, adminId: string, userId: string) {
    const actor = await requireMembership(orgId, adminId, [
      PrismaOrgRole.OWNER,
      PrismaOrgRole.ADMIN,
    ]);

    const target = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { role: true },
    });
    if (!target) {
      throw Errors.notFound('Organization membership', userId);
    }

    // Admins cannot remove owners; only owners can remove owners.
    if (target.role === PrismaOrgRole.OWNER) {
      if (actor.role !== PrismaOrgRole.OWNER) {
        throw Errors.forbidden('Only an owner can remove another owner');
      }
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: PrismaOrgRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw Errors.badRequest('Cannot remove the last owner of the organization');
      }
    }

    await prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });

    return { success: true };
  },

  /**
   * Change a member's role. Owners/admins only; granting or revoking OWNER is
   * owner-only, and the last owner cannot be demoted.
   */
  async updateMemberRole(orgId: string, adminId: string, userId: string, role: OrgRole) {
    const actor = await requireMembership(orgId, adminId, [
      PrismaOrgRole.OWNER,
      PrismaOrgRole.ADMIN,
    ]);

    const nextRole = toPrismaRole(role);
    const target = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { role: true },
    });
    if (!target) {
      throw Errors.notFound('Organization membership', userId);
    }

    const touchesOwner = nextRole === PrismaOrgRole.OWNER || target.role === PrismaOrgRole.OWNER;
    if (touchesOwner && actor.role !== PrismaOrgRole.OWNER) {
      throw Errors.forbidden('Only an owner can change owner roles');
    }

    // Prevent demoting the last owner.
    if (target.role === PrismaOrgRole.OWNER && nextRole !== PrismaOrgRole.OWNER) {
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: PrismaOrgRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw Errors.badRequest('Cannot demote the last owner of the organization');
      }
    }

    return prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: { role: nextRole },
    });
  },

  /**
   * Paginated members with their roles and basic user profile data.
   */
  async getMembers(orgId: string, options: PaginationOptions = {}) {
    const { page, limit, skip } = normalizePagination(options);

    const [members, total] = await Promise.all([
      prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        skip,
        take: limit,
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      }),
      prisma.organizationMember.count({ where: { organizationId: orgId } }),
    ]);

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: toApiRole(m.role),
        joinedAt: m.createdAt,
        user: m.user,
      })),
      meta: { total, page, limit },
    };
  },

  /**
   * Paginated repositories owned by the organization.
   */
  async getOrgRepositories(orgId: string, options: PaginationOptions = {}) {
    const { page, limit, skip } = normalizePagination(options);

    const [repositories, total] = await Promise.all([
      prisma.repository.findMany({
        where: { organizationId: orgId },
        skip,
        take: limit,
        orderBy: { stars: 'desc' },
      }),
      prisma.repository.count({ where: { organizationId: orgId } }),
    ]);

    return { repositories, meta: { total, page, limit } };
  },

  /**
   * Move a repository under an organization. The caller must be an owner/admin
   * of the destination org and must own (have claimed) the repository.
   */
  async transferRepoToOrg(repoId: string, orgId: string, userId: string) {
    await requireMembership(orgId, userId, [PrismaOrgRole.OWNER, PrismaOrgRole.ADMIN]);

    const repository = await prisma.repository.findUnique({
      where: { id: repoId },
      select: { id: true, claimedBy: true },
    });
    if (!repository) {
      throw Errors.notFound('Repository', repoId);
    }
    if (repository.claimedBy !== userId) {
      throw Errors.notOwner('repository');
    }

    return prisma.repository.update({
      where: { id: repoId },
      data: { organizationId: orgId },
    });
  },

  /**
   * Delete an organization. Owner-only. Members and repository links cascade /
   * detach via the schema's referential actions.
   */
  async deleteOrganization(orgId: string, ownerId: string) {
    await requireMembership(orgId, ownerId, [PrismaOrgRole.OWNER]);

    await prisma.organization.delete({ where: { id: orgId } });
    return { success: true };
  },
};

export default organizationService;
