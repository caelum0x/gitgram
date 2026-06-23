import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const KEYS_FILE = path.join(process.env.HOME || '', '.aitimemachine', 'api_keys.json');

export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

function loadKeys(): ApiKeyRecord[] {
  try {
    if (!fs.existsSync(KEYS_FILE)) return [];
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveKeys(keys: ApiKeyRecord[]): void {
  const dir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export function createApiKey(userId: string, name: string): { key: string; record: ApiKeyRecord } {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `aitm_${secret}`;
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const record: ApiKeyRecord = {
    id,
    userId,
    keyHash,
    keyPrefix: key.slice(0, 12),
    name,
    createdAt: new Date().toISOString(),
  };

  const keys = loadKeys();
  keys.push(record);
  saveKeys(keys);

  return { key, record };
}

export function listUserKeys(userId: string): Omit<ApiKeyRecord, 'keyHash'>[] {
  return loadKeys()
    .filter(k => k.userId === userId && !k.revokedAt)
    .map(({ keyHash, ...rest }) => rest);
}

export function revokeKey(id: string, userId: string): boolean {
  const keys = loadKeys();
  const key = keys.find(k => k.id === id && k.userId === userId);
  if (!key) return false;
  
  key.revokedAt = new Date().toISOString();
  saveKeys(keys);
  return true;
}

export function validateApiKey(apiKey: string): { userId: string; keyId: string } | null {
  if (!apiKey.startsWith('aitm_')) return null;
  
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keys = loadKeys();
  const key = keys.find(k => k.keyHash === keyHash && !k.revokedAt);
  
  if (!key) return null;

  // Update last used
  key.lastUsedAt = new Date().toISOString();
  saveKeys(keys);

  return { userId: key.userId, keyId: key.id };
}

export function storeKeyFromWebsite(record: Omit<ApiKeyRecord, 'createdAt'>): void {
  const keys = loadKeys();
  keys.push({ ...record, createdAt: new Date().toISOString() });
  saveKeys(keys);
}
