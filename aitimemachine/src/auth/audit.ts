import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

function resolveLogDir(): string {
  const candidates = [
    process.env.AITM_AUDIT_DIR,
    process.env.AITM_HOME ? path.join(process.env.AITM_HOME, '.aitimemachine', 'logs') : undefined,
    process.env.HOME ? path.join(process.env.HOME, '.aitimemachine', 'logs') : undefined,
    path.join(process.cwd(), '.aitimemachine', 'logs'),
    path.join(os.tmpdir(), '.aitimemachine', 'logs'),
  ].filter((v): v is string => !!v);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // try next candidate
    }
  }

  throw new Error('No writable audit log directory available');
}

function getLogFile(): string {
  return path.join(resolveLogDir(), 'audit.log');
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId?: string;
  action: string;
  resource?: string;
  ip?: string;
  success: boolean;
  details?: Record<string, any>;
}

export function logAudit(event: Omit<AuditEvent, 'timestamp' | 'id'>): string {
  const entry: AuditEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(getLogFile(), line);
  return entry.id;
}

// Express middleware for audit logging
export function auditMiddleware(action: string) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      logAudit({
        userId: req.user?.userId,
        action,
        resource: req.originalUrl,
        ip: req.ip,
        success: res.statusCode < 400,
        details: {
          method: req.method,
          statusCode: res.statusCode,
          duration: Date.now() - start,
        },
      });
    });
    
    next();
  };
}

// Get recent audit logs
export function getAuditLogs(limit = 100): AuditEvent[] {
  const logFile = getLogFile();
  if (!fs.existsSync(logFile)) return [];
  
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  return lines
    .slice(-limit)
    .reverse()
    .map(line => JSON.parse(line));
}
