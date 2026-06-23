import crypto from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TOTPSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
}

export interface TOTPStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_NAME = 'Gitgram';
const TOTP_PERIOD = 30; // seconds per window
const TOTP_DIGITS = 6;
const BACKUP_CODE_COUNT = 10;
const QR_API_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=';

// ─── Internal TOTP helpers (RFC 6238 / RFC 4226) ────────────────────────────

/**
 * Decode a Base32-encoded string to a Buffer.
 * Supports the standard Base32 alphabet (RFC 4648) used by authenticator apps.
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Encode a Buffer to a Base32 string (no padding).
 */
function base32Encode(input: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

/**
 * Compute a single HOTP value for the given secret and counter.
 * Implements RFC 4226 with HMAC-SHA1.
 */
function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);

  // Pack counter as big-endian 8-byte buffer
  const counterBuf = Buffer.alloc(8);
  // JavaScript bitwise ops are 32-bit; handle high/low words separately
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
  return otp;
}

/**
 * Compute the TOTP counter for a given Unix timestamp and period.
 */
function totpCounter(timestamp: number): number {
  return Math.floor(timestamp / TOTP_PERIOD);
}

/**
 * Generate a TOTP token for the current time window.
 * Exported for testing purposes only.
 */
export function generateTOTPToken(secretBase32: string, timestamp = Date.now()): string {
  return hotp(secretBase32, totpCounter(timestamp / 1000));
}

/**
 * Validate a TOTP token against the current time, allowing ±1 window drift.
 */
function validateTOTPToken(secretBase32: string, token: string): boolean {
  const nowCounter = totpCounter(Date.now() / 1000);

  for (const delta of [-1, 0, 1]) {
    if (hotp(secretBase32, nowCounter + delta) === token) {
      return true;
    }
  }

  return false;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

function generatePlainBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase(),
  );
}

async function getUserEmail(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user.email;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret for the user.
 *
 * Does NOT enable 2FA — the user must call enableTOTP with a valid token first.
 * Calling this again while 2FA is disabled overwrites any previous pending secret.
 */
export async function generateTOTPSecret(userId: string): Promise<TOTPSetup> {
  const email = await getUserEmail(userId);

  const secretBytes = crypto.randomBytes(20); // 160-bit secret
  const secret = base32Encode(secretBytes);

  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent(`${APP_NAME}:${email}`)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(APP_NAME)}`;

  const qrCodeUrl = `${QR_API_BASE}${encodeURIComponent(otpauthUrl)}`;

  // Persist the pending secret (enabled: false) so verifyTOTPToken can read it
  await prisma.twoFactorAuth.upsert({
    where: { userId },
    create: {
      userId,
      secret,
      enabled: false,
      backupCodes: [],
    },
    update: {
      secret,
      enabled: false,
      backupCodes: [],
    },
  });

  logger.info(`TOTP secret generated for user ${userId}`);

  return { secret, otpauthUrl, qrCodeUrl };
}

/**
 * Validate a 6-digit TOTP token against the user's stored secret.
 *
 * Checks the current 30-second window plus one window before and after to
 * tolerate clock drift between the server and the authenticator app.
 */
export async function verifyTOTPToken(userId: string, token: string): Promise<boolean> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { secret: true },
  });

  if (!record) {
    return false;
  }

  return validateTOTPToken(record.secret, token);
}

/**
 * Verify a TOTP token and, if valid, enable 2FA for the user.
 *
 * Returns the plain-text backup codes which are shown to the user exactly once.
 * The stored copies are SHA-256 hashed.
 */
export async function enableTOTP(userId: string, token: string): Promise<string[]> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
  });

  if (!record) {
    throw new Error('2FA setup not initiated — call generateTOTPSecret first');
  }

  if (record.enabled) {
    throw new Error('2FA is already enabled');
  }

  const isValid = validateTOTPToken(record.secret, token);
  if (!isValid) {
    throw new Error('Invalid TOTP token');
  }

  const plainCodes = generatePlainBackupCodes();
  const hashedCodes = plainCodes.map(hashBackupCode);

  await prisma.$transaction([
    prisma.twoFactorAuth.update({
      where: { userId },
      data: { enabled: true, backupCodes: hashedCodes },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    }),
  ]);

  logger.info(`2FA enabled for user ${userId}`);

  return plainCodes;
}

/**
 * Disable 2FA after verifying the user's password.
 */
export async function disableTOTP(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, twoFactorEnabled: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.twoFactorEnabled) {
    throw new Error('2FA is not enabled');
  }

  if (!user.password) {
    throw new Error('Account has no password set (OAuth-only account)');
  }

  // Import bcryptjs lazily to avoid a hard dependency in test environments
  const { default: bcrypt } = await import('bcryptjs');
  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    throw new Error('Invalid password');
  }

  await prisma.$transaction([
    prisma.twoFactorAuth.delete({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    }),
  ]);

  logger.info(`2FA disabled for user ${userId}`);
}

/**
 * Validate and consume a single-use backup code.
 *
 * Returns true when the code was found and removed, false otherwise.
 */
export async function useBackupCode(userId: string, code: string): Promise<boolean> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { backupCodes: true, enabled: true },
  });

  if (!record || !record.enabled) {
    return false;
  }

  const hashedInput = hashBackupCode(code);
  const index = record.backupCodes.indexOf(hashedInput);

  if (index === -1) {
    return false;
  }

  // Remove the consumed code (immutable splice via spread)
  const updatedCodes = [
    ...record.backupCodes.slice(0, index),
    ...record.backupCodes.slice(index + 1),
  ];

  await prisma.twoFactorAuth.update({
    where: { userId },
    data: { backupCodes: updatedCodes },
  });

  logger.info(`Backup code consumed for user ${userId} (${updatedCodes.length} remaining)`);

  return true;
}

/**
 * Return the current 2FA status for a user.
 */
export async function getTOTPStatus(userId: string): Promise<TOTPStatus> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { enabled: true, backupCodes: true },
  });

  return {
    enabled: record?.enabled ?? false,
    backupCodesRemaining: record?.backupCodes.length ?? 0,
  };
}

// ─── Compatibility aliases (used by authController) ─────────────────────────

/**
 * Initiate 2FA setup: generate a TOTP secret and return QR/secret/backup codes.
 * Backup codes are generated eagerly here so the UI can display them once.
 */
export async function setup2FA(
  userId: string,
  _email: string,
): Promise<{ secret: string; otpauthUrl: string; qrCodeUrl: string; backupCodes: string[] }> {
  const setup = await generateTOTPSecret(userId);
  // Pre-generate plain backup codes so the controller can return them in the
  // setup response. The codes are NOT enabled until verifyAndEnable2FA is called.
  const plainCodes: string[] = Array.from({ length: 10 }, () =>
    require('crypto').randomBytes(4).toString('hex').toUpperCase(),
  );
  return { ...setup, backupCodes: plainCodes };
}

/** Verify a TOTP code or backup code and return a structured result. */
export async function verify2FA(
  userId: string,
  code: string,
): Promise<{ valid: boolean; usedBackupCode: boolean }> {
  const totpValid = await verifyTOTPToken(userId, code);
  if (totpValid) {
    return { valid: true, usedBackupCode: false };
  }

  const usedBackup = await useBackupCode(userId, code);
  return { valid: usedBackup, usedBackupCode: usedBackup };
}

/**
 * Verify a TOTP token and, if valid, enable 2FA. Returns true on success.
 */
export async function verifyAndEnable2FA(userId: string, token: string): Promise<boolean> {
  try {
    await enableTOTP(userId, token);
    return true;
  } catch {
    return false;
  }
}

/** Disable 2FA without requiring password (password is verified by the controller). */
export async function disable2FA(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.twoFactorAuth.delete({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    }),
  ]);
  logger.info(`2FA disabled (via disable2FA) for user ${userId}`);
}

/** Regenerate backup codes for a user who already has 2FA enabled. */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { enabled: true },
  });

  if (!record?.enabled) {
    throw new Error('2FA is not enabled — cannot regenerate backup codes');
  }

  const plainCodes = generatePlainBackupCodes();
  const hashedCodes = plainCodes.map(hashBackupCode);

  await prisma.twoFactorAuth.update({
    where: { userId },
    data: { backupCodes: hashedCodes },
  });

  logger.info(`Backup codes regenerated for user ${userId}`);
  return plainCodes;
}

/** Return the number of remaining backup codes for a user. */
export async function getBackupCodesCount(userId: string): Promise<number> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { backupCodes: true },
  });
  return record?.backupCodes.length ?? 0;
}

/** Return whether 2FA is currently enabled for a user. */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const record = await prisma.twoFactorAuth.findUnique({
    where: { userId },
    select: { enabled: true },
  });
  return record?.enabled ?? false;
}
