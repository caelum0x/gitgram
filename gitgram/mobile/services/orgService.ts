import api from './api';

/**
 * Organization domain service.
 *
 * Wraps the shared axios instance (`services/api.ts`) and targets the backend
 * routes mounted at `/api/v1/orgs` (see backend `routes/organizations.ts`).
 *
 * Backend contract notes:
 * - `GET /v1/orgs/:slug` resolves an organization by its slug and returns
 *   `{ success, data }`, where `data` includes `id`, `name`, `slug`,
 *   `description`, `memberCount`, `repoCount`.
 * - `GET /v1/orgs/:id/members` and `GET /v1/orgs/:id/repositories` are keyed by
 *   the organization **id** (not the slug) and return paginated
 *   `{ success, data, meta }` envelopes.
 *
 * The backend currently exposes no follow or projects endpoints for
 * organizations, so this service intentionally does not implement them; the
 * screen degrades gracefully where those surfaces would appear.
 */

export type OrgMemberRole = 'owner' | 'admin' | 'member';

export interface OrgUserSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  location: string | null;
  memberCount: number;
  repoCount: number;
}

export interface OrgMember {
  id: string;
  userId: string;
  role: OrgMemberRole;
  joinedAt: string;
  user: OrgUserSummary;
}

export interface OrgRepository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  ownerAvatar: string | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

interface OrgEnvelope {
  data?: Organization;
}

interface PaginatedEnvelope<T> {
  data?: T[];
  meta?: PaginationMeta;
}

const DEFAULT_LIMIT = 20;

function emptyMeta(page: number, limit: number): PaginationMeta {
  return { total: 0, page, limit };
}

function toPaginated<T>(
  envelope: PaginatedEnvelope<T> | undefined,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items: envelope?.data ?? [],
    meta: envelope?.meta ?? emptyMeta(page, limit),
  };
}

export const orgService = {
  /** Resolve an organization by its slug. */
  getOrg: async (slug: string): Promise<Organization | null> => {
    const response = await api.get<OrgEnvelope>(`/orgs/${encodeURIComponent(slug)}`);
    return response.data.data ?? null;
  },

  /**
   * List repositories owned by an organization. Keyed by the organization id
   * (resolve it via {@link getOrg} first).
   */
  getOrgRepos: async (
    orgId: string,
    page = 1,
    limit = DEFAULT_LIMIT,
  ): Promise<PaginatedResult<OrgRepository>> => {
    const response = await api.get<PaginatedEnvelope<OrgRepository>>(
      `/orgs/${encodeURIComponent(orgId)}/repositories`,
      { params: { page, limit } },
    );
    return toPaginated(response.data, page, limit);
  },

  /**
   * List members of an organization. Keyed by the organization id (resolve it
   * via {@link getOrg} first).
   */
  getOrgMembers: async (
    orgId: string,
    page = 1,
    limit = DEFAULT_LIMIT,
  ): Promise<PaginatedResult<OrgMember>> => {
    const response = await api.get<PaginatedEnvelope<OrgMember>>(
      `/orgs/${encodeURIComponent(orgId)}/members`,
      { params: { page, limit } },
    );
    return toPaginated(response.data, page, limit);
  },
};

export default orgService;
