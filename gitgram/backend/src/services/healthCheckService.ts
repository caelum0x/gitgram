import prisma from '../utils/prisma';
import { connectRedis } from './redisService';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    storage: ServiceHealth;
    email: ServiceHealth;
  };
  metrics: {
    uptime: number;
    memory: MemoryMetrics;
    cpu: number;
  };
}

interface ServiceHealth {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

interface MemoryMetrics {
  used: number;
  total: number;
  percentage: number;
}

export const checkHealth = async (): Promise<HealthStatus> => {
  const [database, redis, storage, email] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
    checkEmail(),
  ]);

  const allHealthy = [database, redis, storage, email].every(s => s.status === 'up');
  const anyDown = [database, redis, storage, email].some(s => s.status === 'down');

  const memUsed = process.memoryUsage().heapUsed / 1024 / 1024;
  const memTotal = process.memoryUsage().heapTotal / 1024 / 1024;

  return {
    status: anyDown ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { database, redis, storage, email },
    metrics: {
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsed),
        total: Math.round(memTotal),
        percentage: Math.round((memUsed / memTotal) * 100),
      },
      cpu: process.cpuUsage().user / 1000000,
    }
  };
};

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'up',
      responseTime: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await connectRedis();
    return {
      status: 'up',
      responseTime: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

async function checkStorage(): Promise<ServiceHealth> {
  const start = Date.now();
  const storageType = process.env.STORAGE_TYPE || 'local';

  try {
    if (storageType === 's3') {
      // Check S3 bucket accessibility
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });

      const bucket = process.env.AWS_S3_BUCKET;
      if (!bucket) {
        return {
          status: 'down',
          error: 'AWS_S3_BUCKET not configured',
        };
      }

      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));

      return {
        status: 'up',
        responseTime: Date.now() - start,
        details: { type: 's3', bucket },
      };
    } else {
      // Check local storage directory
      const uploadDir = path.join(__dirname, '../../uploads');

      // Check if directory exists and is writable
      try {
        await fs.promises.access(uploadDir, fs.constants.W_OK);
      } catch {
        // Try to create it
        await fs.promises.mkdir(uploadDir, { recursive: true });
      }

      // Verify we can write a test file
      const testFile = path.join(uploadDir, '.health-check');
      await fs.promises.writeFile(testFile, 'test');
      await fs.promises.unlink(testFile);

      return {
        status: 'up',
        responseTime: Date.now() - start,
        details: { type: 'local', path: uploadDir },
      };
    }
  } catch (error: any) {
    logger.warn('Storage health check failed:', error.message);
    return {
      status: 'down',
      error: error.message,
      details: { type: storageType },
    };
  }
}

async function checkEmail(): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        status: 'down',
        error: 'RESEND_API_KEY not configured',
        details: { provider: 'resend' },
      };
    }

    // Validate API key format (Resend keys start with 're_')
    if (!apiKey.startsWith('re_')) {
      return {
        status: 'down',
        error: 'Invalid RESEND_API_KEY format',
        details: { provider: 'resend' },
      };
    }

    // Try to verify API key by making a lightweight API call
    // We use the domains endpoint as it's a read-only operation
    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      return {
        status: 'down',
        error: 'Invalid or expired API key',
        details: { provider: 'resend' },
      };
    }

    // Any response other than auth error means the API is reachable
    return {
      status: 'up',
      responseTime: Date.now() - start,
      details: {
        provider: 'resend',
        fromEmail: process.env.EMAIL_FROM || 'noreply@gitgram.com',
      },
    };
  } catch (error: any) {
    logger.warn('Email health check failed:', error.message);
    return {
      status: 'down',
      error: error.message,
      details: { provider: 'resend' },
    };
  }
}

// Quick health check for load balancers
export const checkQuickHealth = async (): Promise<{ status: 'ok' | 'error' }> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  } catch {
    return { status: 'error' };
  }
};
