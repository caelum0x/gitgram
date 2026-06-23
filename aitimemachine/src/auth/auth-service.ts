import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.AITM_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES = '7d';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  role: 'admin' | 'user';
  settings?: Record<string, any>;
}

export interface AuthToken {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: Omit<User, 'passwordHash' | 'salt'>;
  error?: string;
}

export class AuthService {
  private usersFile: string;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.env.HOME || '', '.aitimemachine');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadUsers(): User[] {
    if (!fs.existsSync(this.usersFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.usersFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveUsers(users: User[]): void {
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateApiKey(): string {
    return `aitm_${crypto.randomBytes(24).toString('hex')}`;
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash' | 'salt'> {
    const { passwordHash, salt, ...safe } = user;
    return safe;
  }

  // Register new user
  register(email: string, password: string, role: 'admin' | 'user' = 'user'): AuthResult {
    const users = this.loadUsers();

    // Check if email exists
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'Email already registered' };
    }

    // Validate email
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate password
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    const salt = this.generateSalt();
    const now = new Date().toISOString();

    const user: User = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      passwordHash: this.hashPassword(password, salt),
      salt,
      apiKey: this.generateApiKey(),
      createdAt: now,
      updatedAt: now,
      role,
    };

    users.push(user);
    this.saveUsers(users);

    // Create user data directory
    const userDataDir = path.join(this.dataDir, 'users', user.id);
    fs.mkdirSync(userDataDir, { recursive: true });

    const token = this.generateToken(user);

    return {
      success: true,
      token,
      user: this.sanitizeUser(user),
    };
  }

  // Login
  login(email: string, password: string): AuthResult {
    const users = this.loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return { success: false, error: 'Invalid email or password' };
    }

    const token = this.generateToken(user);

    return {
      success: true,
      token,
      user: this.sanitizeUser(user),
    };
  }

  // Generate JWT token
  private generateToken(user: User): string {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
  }

  // Verify JWT token
  verifyToken(token: string): AuthToken | null {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthToken;
    } catch {
      return null;
    }
  }

  // Verify API key
  verifyApiKey(apiKey: string): User | null {
    const users = this.loadUsers();
    const user = users.find(u => u.apiKey === apiKey);
    return user || null;
  }

  // Get user by ID
  getUser(userId: string): Omit<User, 'passwordHash' | 'salt'> | null {
    const users = this.loadUsers();
    const user = users.find(u => u.id === userId);
    return user ? this.sanitizeUser(user) : null;
  }

  // Get user by email
  getUserByEmail(email: string): Omit<User, 'passwordHash' | 'salt'> | null {
    const users = this.loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user ? this.sanitizeUser(user) : null;
  }

  // Regenerate API key
  regenerateApiKey(userId: string): string | null {
    const users = this.loadUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return null;

    user.apiKey = this.generateApiKey();
    user.updatedAt = new Date().toISOString();
    this.saveUsers(users);

    return user.apiKey;
  }

  // Change password
  changePassword(userId: string, oldPassword: string, newPassword: string): AuthResult {
    const users = this.loadUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const oldHash = this.hashPassword(oldPassword, user.salt);
    if (oldHash !== user.passwordHash) {
      return { success: false, error: 'Current password is incorrect' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }

    const newSalt = this.generateSalt();
    user.salt = newSalt;
    user.passwordHash = this.hashPassword(newPassword, newSalt);
    user.updatedAt = new Date().toISOString();

    this.saveUsers(users);

    return { success: true, user: this.sanitizeUser(user) };
  }

  // List all users (admin only)
  listUsers(): Array<Omit<User, 'passwordHash' | 'salt'>> {
    return this.loadUsers().map(u => this.sanitizeUser(u));
  }

  // Delete user
  deleteUser(userId: string): boolean {
    const users = this.loadUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;

    users.splice(idx, 1);
    this.saveUsers(users);

    // Optionally delete user data directory
    const userDataDir = path.join(this.dataDir, 'users', userId);
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true });
    }

    return true;
  }

  // Get user data directory
  getUserDataDir(userId: string): string {
    return path.join(this.dataDir, 'users', userId);
  }

  // Get JWT secret (for middleware)
  static getJwtSecret(): string {
    return JWT_SECRET;
  }
}
