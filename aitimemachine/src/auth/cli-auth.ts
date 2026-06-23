import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import { AuthService } from './auth-service.js';

const AUTH_FILE = path.join(process.env.HOME || '', '.aitimemachine', 'auth.json');
const WEBSITE_URL = process.env.AITM_WEBSITE_URL || 'https://timemachine.gitgram.app';

export interface StoredAuth {
  apiKey: string;
  userId: string;
  email: string;
  expiresAt?: string;
}

export function getStoredAuth(): StoredAuth | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      fs.unlinkSync(AUTH_FILE);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export function clearAuth(): void {
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
}

export function isAuthenticated(): boolean {
  return getStoredAuth() !== null;
}

// Login with API key directly
export async function loginWithApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  const authService = new AuthService();
  const user = authService.verifyApiKey(apiKey);
  
  if (!user) {
    return { success: false, error: 'Invalid API key' };
  }

  saveAuth({
    apiKey,
    userId: user.id,
    email: user.email,
  });

  return { success: true };
}

// Login with email/password (local auth)
export async function loginWithPassword(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const authService = new AuthService();
  const result = authService.login(email, password);

  if (!result.success || !result.user) {
    return { success: false, error: result.error || 'Login failed' };
  }

  saveAuth({
    apiKey: result.user.apiKey,
    userId: result.user.id,
    email: result.user.email,
  });

  return { success: true };
}

// Browser-based login flow
export async function loginWithBrowser(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const port = 19283 + Math.floor(Math.random() * 100);
    const state = crypto.randomBytes(16).toString('hex');

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      
      if (url.pathname === '/callback') {
        const apiKey = url.searchParams.get('api_key');
        const userId = url.searchParams.get('user_id');
        const email = url.searchParams.get('email');
        const returnedState = url.searchParams.get('state');

        if (returnedState !== state) {
          res.writeHead(400);
          res.end('Invalid state');
          server.close();
          resolve({ success: false, error: 'Invalid state parameter' });
          return;
        }

        if (apiKey && userId && email) {
          saveAuth({ apiKey, userId, email });
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>✓ Logged in!</h1><p>You can close this window.</p><script>window.close()</script></body></html>');
          server.close();
          resolve({ success: true });
        } else {
          res.writeHead(400);
          res.end('Missing parameters');
          server.close();
          resolve({ success: false, error: 'Missing auth parameters' });
        }
      }
    });

    server.listen(port, () => {
      const authUrl = `${WEBSITE_URL}/cli-auth?port=${port}&state=${state}`;
      console.log(`Opening browser for authentication...`);
      console.log(`If browser doesn't open, visit: ${authUrl}`);
      open(authUrl).catch(() => {});

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        resolve({ success: false, error: 'Login timed out' });
      }, 300000);
    });

    server.on('error', (err) => {
      resolve({ success: false, error: `Server error: ${err.message}` });
    });
  });
}

// Get auth headers for API requests
export function getAuthHeaders(): Record<string, string> {
  const auth = getStoredAuth();
  if (!auth) return {};
  return { 'X-API-Key': auth.apiKey };
}
