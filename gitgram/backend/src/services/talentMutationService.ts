import { createHash, randomUUID } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth';
import { Errors } from '../middleware/errorHandler';
import prisma from '../utils/prisma';

interface MutationResource<T> {
  value: T;
  resourceType: 'opportunity' | 'referral' | 'pilot';
  resourceId: string;
}

export interface TalentMutationResult<T> {
  value: T;
  replayed: boolean;
}

const RECEIPT_RETENTION_DAYS = 30;

export function requireIdempotencyKey(req: AuthRequest): string {
  const raw = req.get('idempotency-key')?.trim() || '';
  if (raw.length < 8 || raw.length > 128 || !/^[\x21-\x7e]+$/.test(raw)) {
    throw Errors.invalidField('Idempotency-Key', 'Idempotency-Key must contain 8 to 128 visible characters');
  }
  return raw;
}

export async function runTalentMutation<T>(
  req: AuthRequest,
  operation: string,
  execute: (tx: any) => Promise<MutationResource<T>>,
): Promise<TalentMutationResult<T>> {
  const actorId = req.userId!;
  const idempotencyKey = requireIdempotencyKey(req);
  const requestFingerprint = sha256(`${actorId}\n${operation}\n${idempotencyKey}`);
  const requestHash = sha256(canonicalJson(req.body ?? {}));
  const requestId = String((req as AuthRequest & { requestId?: string }).requestId || req.get('x-request-id') || randomUUID()).slice(0, 128);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const receipt = await tx.talentMutationReceipt.findUnique({
          where: { requestFingerprint },
          select: { requestHash: true, response: true },
        });
        if (receipt) return replayReceipt<T>(receipt, requestHash);

        const resource = await execute(tx);
        const response = toJson(resource.value);
        await tx.talentMutationReceipt.create({
          data: {
            requestFingerprint,
            requestHash,
            actorId,
            operation,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            requestId,
            response,
          },
        });
        await tx.talentMutationReceipt.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
        });
        return { value: resource.value, replayed: false };
      }, { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (isPrismaCode(error, 'P2034') && attempt < 2) continue;
      if (isPrismaCode(error, 'P2002')) {
        const receipt = await prisma.talentMutationReceipt.findUnique({
          where: { requestFingerprint },
          select: { requestHash: true, response: true },
        });
        if (receipt) return replayReceipt<T>(receipt, requestHash);
        throw Errors.conflict('A conflicting Talent Graph record already exists');
      }
      throw error;
    }
  }
  throw Errors.conflict('The mutation could not be serialized. Retry with the same Idempotency-Key');
}

function replayReceipt<T>(
  receipt: { requestHash: string; response: unknown },
  requestHash: string,
): TalentMutationResult<T> {
  if (receipt.requestHash !== requestHash) {
    throw Errors.conflict('This Idempotency-Key was already used with a different request');
  }
  return { value: receipt.response as T, replayed: true };
}

function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value !== 'object') return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
