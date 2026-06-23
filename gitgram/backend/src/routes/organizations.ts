import { Router, Response } from 'express';
import { z, ZodSchema } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { organizationService, OrgRole } from '../services/organizationService';

const router = Router();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const roleSchema = z.enum(['owner', 'admin', 'member']);

const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,38}$/, 'Invalid slug format'),
  description: z.string().trim().max(2000).optional(),
});

const updateOrgSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    website: z.string().trim().url().max(255).optional(),
    location: z.string().trim().max(255).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema.optional(),
});

const updateRoleSchema = z.object({
  role: roleSchema,
});

const transferRepoSchema = z.object({
  repoId: z.string().min(1),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/** Parse `data` with `schema`, converting Zod errors into a 400 ApiError. */
function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw Errors.badRequest(issue.message, issue.path.join('.') || undefined);
  }
  return result.data;
}

/** Read the authenticated user id, throwing if the middleware did not set it. */
function requireUserId(req: AuthRequest): string {
  if (!req.userId) {
    throw Errors.unauthorized();
  }
  return req.userId;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/v1/orgs:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = requireUserId(req);
    const body = parse(createOrgSchema, req.body);
    const organization = await organizationService.createOrganization(userId, body);
    res.status(201).json({ success: true, data: organization });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{slug}:
 *   get:
 *     summary: Get an organization by slug
 *     tags: [Organizations]
 */
router.get(
  '/:slug',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const organization = await organizationService.getOrganization(req.params.slug);
    res.json({ success: true, data: organization });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}:
 *   patch:
 *     summary: Update an organization (owner/admin only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = requireUserId(req);
    const updates = parse(updateOrgSchema, req.body);
    const organization = await organizationService.updateOrganization(
      req.params.id,
      userId,
      updates
    );
    res.json({ success: true, data: organization });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}:
 *   delete:
 *     summary: Delete an organization (owner only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = requireUserId(req);
    const result = await organizationService.deleteOrganization(req.params.id, userId);
    res.json({ success: true, data: result });
  })
);

// --- Members ---------------------------------------------------------------

/**
 * @swagger
 * /api/v1/orgs/{id}/members:
 *   get:
 *     summary: List organization members (paginated)
 *     tags: [Organizations]
 */
router.get(
  '/:id/members',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parse(paginationSchema, req.query);
    const result = await organizationService.getMembers(req.params.id, { page, limit });
    res.json({ success: true, data: result.members, meta: result.meta });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}/members:
 *   post:
 *     summary: Add a member to the organization (owner/admin only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/members',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const adminId = requireUserId(req);
    const body = parse(addMemberSchema, req.body);
    const member = await organizationService.addMember(req.params.id, adminId, {
      userId: body.userId,
      role: body.role as OrgRole | undefined,
    });
    res.status(201).json({ success: true, data: member });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}/members/{userId}:
 *   patch:
 *     summary: Update a member's role (owner/admin only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id/members/:userId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const adminId = requireUserId(req);
    const { role } = parse(updateRoleSchema, req.body);
    const member = await organizationService.updateMemberRole(
      req.params.id,
      adminId,
      req.params.userId,
      role as OrgRole
    );
    res.json({ success: true, data: member });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member (owner/admin only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:id/members/:userId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const adminId = requireUserId(req);
    const result = await organizationService.removeMember(
      req.params.id,
      adminId,
      req.params.userId
    );
    res.json({ success: true, data: result });
  })
);

// --- Repositories ----------------------------------------------------------

/**
 * @swagger
 * /api/v1/orgs/{id}/repositories:
 *   get:
 *     summary: List repositories owned by the organization (paginated)
 *     tags: [Organizations]
 */
router.get(
  '/:id/repositories',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parse(paginationSchema, req.query);
    const result = await organizationService.getOrgRepositories(req.params.id, { page, limit });
    res.json({ success: true, data: result.repositories, meta: result.meta });
  })
);

/**
 * @swagger
 * /api/v1/orgs/{id}/repositories:
 *   post:
 *     summary: Transfer a repository under the organization (owner/admin only)
 *     tags: [Organizations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:id/repositories',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = requireUserId(req);
    const { repoId } = parse(transferRepoSchema, req.body);
    const repository = await organizationService.transferRepoToOrg(repoId, req.params.id, userId);
    res.json({ success: true, data: repository });
  })
);

export default router;
