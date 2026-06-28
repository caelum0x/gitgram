import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { geocodingService } from '../services/geocodingService';

const EARTH_RADIUS_KM = 6371;
const MAX_CANDIDATES = 500;

/** Great-circle distance between two coordinates in kilometers (Haversine). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NearbyParams {
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
}

function parseNearbyParams(req: Request): NearbyParams {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw Errors.badRequest('A valid latitude is required');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw Errors.badRequest('A valid longitude is required');
  }
  const radius = Math.min(500, Math.max(0.1, Number(req.query.radius) || 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  return { latitude, longitude, radius, limit };
}

/** Filter candidates by radius, attach distance, sort ascending, and cap to limit. */
function withinRadius<T extends { latitude: number | null; longitude: number | null }>(
  candidates: T[],
  params: NearbyParams,
): Array<T & { distance: number }> {
  return candidates
    .filter((c) => c.latitude !== null && c.longitude !== null)
    .map((c) => ({
      ...c,
      distance: haversineKm(params.latitude, params.longitude, c.latitude as number, c.longitude as number),
    }))
    .filter((c) => c.distance <= params.radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, params.limit);
}

export const getNearbyProjects = asyncHandler(async (req: Request, res: Response) => {
  const params = parseNearbyParams(req);
  const candidates = await prisma.project.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES,
  });

  const projects = withinRadius(candidates, params).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    language: p.language,
    stars: p.stars,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    distance: p.distance,
  }));

  res.json({ projects });
});

export const getNearbyPosts = asyncHandler(async (req: Request, res: Response) => {
  const params = parseNearbyParams(req);
  const candidates = await prisma.post.findMany({
    where: { latitude: { not: null }, longitude: { not: null }, status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES,
    include: { user: { select: { id: true, username: true, avatar: true, verified: true } } },
  });

  const posts = withinRadius(candidates, params).map((p) => ({
    id: p.id,
    content: p.content,
    mediaUrls: p.mediaUrls,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    likesCount: p.likesCount,
    commentsCount: p.commentsCount,
    createdAt: p.createdAt,
    distance: p.distance,
    user: p.user,
  }));

  res.json({ posts });
});

export const getNearbyUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const params = parseNearbyParams(req);
  const candidates = await prisma.user.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      isBanned: false,
      ...(req.userId ? { id: { not: req.userId } } : {}),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      bio: true,
      location: true,
      latitude: true,
      longitude: true,
      verified: true,
    },
    take: MAX_CANDIDATES,
  });

  const users = withinRadius(candidates, params);
  res.json({ users });
});

export const geocode = asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address || typeof address !== 'string' || !address.trim()) {
    throw Errors.badRequest('Address is required');
  }

  const result = await geocodingService.geocodeAddress(address.trim());
  if (!result) {
    throw Errors.notFound('Location for the given address');
  }

  res.json(result);
});

export const getLocationPosts = asyncHandler(async (req: Request, res: Response) => {
  const name = decodeURIComponent(req.params.name || '').trim();
  if (!name) {
    throw Errors.badRequest('Location name is required');
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit ?? '30'), 10) || 30));

  const where = {
    location: { equals: name, mode: 'insensitive' as const },
    status: 'PUBLISHED',
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, username: true, avatar: true, verified: true } } },
    }),
    prisma.post.count({ where }),
  ]);

  res.json({
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      mediaUrl: p.mediaUrls[0] ?? null,
      mediaType: p.mediaUrls[0] ? 'image' : null,
      mediaUrls: p.mediaUrls,
      location: p.location,
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      createdAt: p.createdAt,
      user: p.user,
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export const searchLocations = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q ? String(req.query.q).trim() : '';
  if (!query) {
    res.json({ locations: [] });
    return;
  }

  // Resolve the free-text query to a concrete place via geocoding.
  const geocoded = await geocodingService.geocodeAddress(query);

  const locations = geocoded
    ? [
        {
          name: geocoded.formattedAddress || query,
          formattedAddress: geocoded.formattedAddress,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          placeId: geocoded.placeId,
        },
      ]
    : [];

  res.json({ locations });
});

export const getTrendingLocations = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

  // Aggregate published posts that carry a textual location, ranked by count.
  const grouped = await prisma.post.groupBy({
    by: ['location'],
    where: { location: { not: null }, status: 'PUBLISHED' },
    _count: { location: true },
    orderBy: { _count: { location: 'desc' } },
    take: limit,
  });

  const locations = grouped
    .filter((g) => g.location)
    .map((g) => ({ location: g.location as string, count: g._count.location }));

  res.json({ locations });
});
