/**
 * Shared CLI helpers: ANSI colors, formatters, utilities.
 */

import * as readline from 'readline';

// ANSI color codes
export const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export function ok(message: string): void {
  console.log(`${C.green}[OK]${C.reset} ${message}`);
}

export function warn(message: string, details?: string[]): void {
  console.warn(`${C.yellow}[!]${C.reset} ${message}`);
  if (details && details.length > 0) {
    details.forEach((line) => console.warn(`  - ${line}`));
  }
}

export function fail(message: string, details?: string[]): void {
  console.error(`${C.red}[!]${C.reset} ${message}`);
  if (details && details.length > 0) {
    details.forEach((line) => console.error(`  - ${line}`));
  }
  process.exitCode = 1;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function parseTime(str: string): Date {
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  const match = str.match(/(\d+)\s*(second|minute|hour|day|week)s?\s*ago/i);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const ms: Record<string, number> = {
      second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000
    };
    return new Date(Date.now() - amount * (ms[unit] || 0));
  }

  throw new Error(`Cannot parse time: ${str}`);
}

export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
