import { Request, Response, NextFunction } from 'express';

// Sanitize string input
function sanitize(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove HTML tags
    .trim()
    .slice(0, 10000); // Max length
}

// Validate email format
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate checkpoint ID format
export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

// Validate path (no traversal)
export function isValidPath(p: string): boolean {
  const normalized = p.replace(/\\/g, '/');
  return !normalized.includes('..') && !normalized.startsWith('/');
}

// Input validation middleware
export function validateBody(schema: Record<string, 'string' | 'number' | 'boolean' | 'email' | 'id' | 'path'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    for (const [field, type] of Object.entries(schema)) {
      const value = req.body?.[field];
      
      if (value === undefined) continue;
      
      switch (type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
          } else {
            req.body[field] = sanitize(value);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${field} must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${field} must be a boolean`);
          }
          break;
        case 'email':
          if (typeof value !== 'string' || !isValidEmail(value)) {
            errors.push(`${field} must be a valid email`);
          }
          break;
        case 'id':
          if (typeof value !== 'string' || !isValidId(value)) {
            errors.push(`${field} must be a valid ID`);
          }
          break;
        case 'path':
          if (typeof value !== 'string' || !isValidPath(value)) {
            errors.push(`${field} contains invalid path`);
          }
          break;
      }
    }
    
    if (errors.length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    
    next();
  };
}

// Validate query params
export function validateQuery(schema: Record<string, 'string' | 'number' | 'id'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const [field, type] of Object.entries(schema)) {
      const value = req.query?.[field];
      if (value === undefined) continue;
      
      if (type === 'number') {
        const num = parseInt(value as string, 10);
        if (isNaN(num)) {
          res.status(400).json({ error: `${field} must be a number` });
          return;
        }
        (req.query as any)[field] = num;
      } else if (type === 'id' && !isValidId(value as string)) {
        res.status(400).json({ error: `${field} must be a valid ID` });
        return;
      }
    }
    next();
  };
}
