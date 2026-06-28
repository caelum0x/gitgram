import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { uploadMultipleImages } from '../services/storageService';
import { createCheckoutSession } from '../services/polarService';

const SELLER_SELECT = {
  id: true,
  username: true,
  avatar: true,
  verified: true,
} as const;

const PUBLIC_STATUSES = ['active', 'sold'];

/**
 * Serialize a StoreItem with seller info. Exposes both `title` and `name`
 * (alias) so every frontend page that reads either field works.
 */
function serializeItem(
  item: { id: string; sellerId: string; title: string; description: string | null; price: number; category: string; images: string[]; status: string; createdAt: Date },
  seller?: { id: string; username: string | null; avatar: string | null; verified: boolean } | null,
) {
  return {
    id: item.id,
    userId: item.sellerId,
    sellerId: item.sellerId,
    title: item.title,
    name: item.title,
    description: item.description ?? '',
    price: item.price,
    category: item.category,
    images: item.images,
    status: item.status,
    createdAt: item.createdAt,
    user: seller
      ? { id: seller.id, username: seller.username, avatar: seller.avatar, verified: seller.verified }
      : null,
  };
}

async function loadSellers(sellerIds: string[]) {
  const unique = Array.from(new Set(sellerIds));
  const sellers = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: SELLER_SELECT,
  });
  return new Map(sellers.map((s) => [s.id, s]));
}

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const category = req.query.category ? String(req.query.category) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;

  const where = {
    status: { in: PUBLIC_STATUSES },
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.storeItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.storeItem.count({ where }),
  ]);

  const sellerMap = await loadSellers(items.map((i) => i.sellerId));
  const serialized = items.map((i) => serializeItem(i, sellerMap.get(i.sellerId)));

  res.json({
    items: serialized,
    products: serialized,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const item = await prisma.storeItem.findUnique({ where: { id } });
  if (!item) {
    throw Errors.notFound('Store item');
  }

  const sellerMap = await loadSellers([item.sellerId]);
  res.json({ item: serializeItem(item, sellerMap.get(item.sellerId)) });
});

export const createItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, name, description, price, category } = req.body;
  const resolvedTitle = (title || name || '').toString().trim();

  if (!resolvedTitle) {
    throw Errors.badRequest('Title is required');
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw Errors.badRequest('Price must be a non-negative number');
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let imageUrls: string[] = [];
  if (files.length > 0) {
    const uploaded = await uploadMultipleImages(files, 'post', 'store');
    imageUrls = uploaded.map((u) => u.url);
  }

  const item = await prisma.storeItem.create({
    data: {
      sellerId: req.userId!,
      title: resolvedTitle,
      description: description ? String(description) : null,
      price: numericPrice,
      category: category ? String(category) : 'other',
      images: imageUrls,
    },
  });

  const sellerMap = await loadSellers([item.sellerId]);
  res.status(201).json({ item: serializeItem(item, sellerMap.get(item.sellerId)) });
});

export const updateItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.storeItem.findUnique({ where: { id } });
  if (!existing) {
    throw Errors.notFound('Store item');
  }
  if (existing.sellerId !== req.userId) {
    throw Errors.forbidden('You can only edit your own items');
  }

  const { title, name, description, price, category } = req.body;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let imageUrls = existing.images;
  if (files.length > 0) {
    const uploaded = await uploadMultipleImages(files, 'post', 'store');
    imageUrls = uploaded.map((u) => u.url);
  }

  let nextPrice = existing.price;
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      throw Errors.badRequest('Price must be a non-negative number');
    }
    nextPrice = numericPrice;
  }

  const resolvedTitle = title ?? name;
  const item = await prisma.storeItem.update({
    where: { id },
    data: {
      title: resolvedTitle !== undefined ? String(resolvedTitle) : existing.title,
      description: description !== undefined ? String(description) : existing.description,
      price: nextPrice,
      category: category !== undefined ? String(category) : existing.category,
      images: imageUrls,
    },
  });

  const sellerMap = await loadSellers([item.sellerId]);
  res.json({ item: serializeItem(item, sellerMap.get(item.sellerId)) });
});

export const deleteItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.storeItem.findUnique({ where: { id } });
  if (!existing) {
    throw Errors.notFound('Store item');
  }
  if (existing.sellerId !== req.userId) {
    throw Errors.forbidden('You can only delete your own items');
  }

  await prisma.storeItem.delete({ where: { id } });
  res.json({ success: true });
});

export const getMyItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const items = await prisma.storeItem.findMany({
    where: { sellerId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  const sellerMap = await loadSellers([req.userId!]);
  res.json({ items: items.map((i) => serializeItem(i, sellerMap.get(i.sellerId))) });
});

export const getPurchaseHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const purchases = await prisma.storePurchase.findMany({
    where: { buyerId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { item: true },
  });

  const sellerMap = await loadSellers(purchases.map((p) => p.item.sellerId));

  res.json({
    purchases: purchases.map((p) => ({
      id: p.id,
      itemId: p.itemId,
      amount: p.amount,
      status: p.status,
      provider: p.provider,
      checkoutId: p.checkoutId,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
      item: serializeItem(p.item, sellerMap.get(p.item.sellerId)),
    })),
  });
});

/**
 * Purchase a store item. Records a purchase row and, when Polar is configured
 * and the seller has a Polar product, creates a real checkout session and
 * returns its URL. Without Polar configured, the purchase is recorded as a
 * pending order that requires manual settlement (no fake "completed" state).
 */
export const purchaseItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const itemId = req.params.id || req.body.itemId;
  if (!itemId) {
    throw Errors.badRequest('Item id is required');
  }

  const item = await prisma.storeItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw Errors.notFound('Store item');
  }
  if (item.status !== 'active') {
    throw Errors.badRequest('This item is no longer available');
  }
  if (item.sellerId === req.userId) {
    throw Errors.badRequest('You cannot purchase your own item');
  }

  const buyer = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true },
  });
  if (!buyer) {
    throw Errors.notFound('Buyer');
  }

  const purchase = await prisma.storePurchase.create({
    data: {
      itemId: item.id,
      buyerId: req.userId!,
      sellerId: item.sellerId,
      amount: item.price,
      status: 'pending',
      provider: item.polarProductId && process.env.POLAR_ACCESS_TOKEN ? 'polar' : 'internal',
    },
  });

  // If the item has a Polar product and Polar is configured, create a real
  // checkout session so the buyer can complete payment.
  if (item.polarProductId && process.env.POLAR_ACCESS_TOKEN) {
    const baseUrl = process.env.WEB_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const checkout = await createCheckoutSession(
      item.polarProductId,
      buyer.email,
      req.userId!,
      `${baseUrl}/store/purchase-history?purchase=${purchase.id}`,
    );

    await prisma.storePurchase.update({
      where: { id: purchase.id },
      data: { checkoutId: checkout.id },
    });

    res.status(201).json({
      purchase: { id: purchase.id, status: 'pending', amount: purchase.amount },
      checkoutUrl: checkout.url,
    });
    return;
  }

  res.status(201).json({
    purchase: { id: purchase.id, status: 'pending', amount: purchase.amount },
    message: 'Purchase recorded. Payment settlement is pending.',
  });
});
