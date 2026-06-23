#!/bin/bash

# Production Monitoring Setup Script
# This script sets up monitoring infrastructure

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}📊 Setting up Production Monitoring${NC}"
echo ""

# Check if running in backend directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ Please run this script from the backend directory${NC}"
  exit 1
fi

# Install monitoring dependencies
echo -e "${YELLOW}📦 Installing monitoring dependencies...${NC}"
npm install --save \
  @sentry/node \
  @sentry/tracing \
  prom-client \
  winston \
  winston-daily-rotate-file

echo -e "${GREEN}✅ Dependencies installed${NC}"

# Create monitoring directory
mkdir -p src/monitoring

# Create Prometheus metrics collector
cat > src/monitoring/metrics.ts << 'EOF'
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry
export const register = new Registry();

// HTTP request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Database metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

// Application metrics
export const activeUsers = new Gauge({
  name: 'active_users_total',
  help: 'Number of currently active users',
  registers: [register],
});

export const postsCreated = new Counter({
  name: 'posts_created_total',
  help: 'Total number of posts created',
  registers: [register],
});

export const messagesCreated = new Counter({
  name: 'messages_created_total',
  help: 'Total number of messages sent',
  registers: [register],
});

// Error metrics
export const errorTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity'],
  registers: [register],
});

// Cache metrics
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});
EOF

# Create monitoring middleware
cat > src/monitoring/middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from './metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
    
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });
  
  next();
}
EOF

# Create metrics endpoint
cat > src/monitoring/endpoint.ts << 'EOF'
import { Request, Response } from 'express';
import { register } from './metrics';

export async function metricsEndpoint(req: Request, res: Response) {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
}
EOF

echo -e "${GREEN}✅ Monitoring infrastructure created${NC}"

# Create logging configuration
cat > src/config/logging.ts << 'EOF'
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = process.env.LOG_DIR || 'logs';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
    })
  );
  
  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: logFormat,
    })
  );
  
  // Access logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '20m',
      maxFiles: '7d',
      format: logFormat,
    })
  );
}

// Create logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false,
});

// Stream for Morgan (HTTP request logging)
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
EOF

echo -e "${GREEN}✅ Logging configuration created${NC}"

# Create alerting configuration
cat > src/config/alerts.ts << 'EOF'
import logger from '../utils/logger';

export interface AlertConfig {
  name: string;
  condition: () => boolean | Promise<boolean>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  cooldown: number; // minutes
}

class AlertManager {
  private lastAlertTimes: Map<string, number> = new Map();
  
  async checkAlert(config: AlertConfig): Promise<void> {
    const now = Date.now();
    const lastAlert = this.lastAlertTimes.get(config.name) || 0;
    const cooldownMs = config.cooldown * 60 * 1000;
    
    // Check if we're still in cooldown period
    if (now - lastAlert < cooldownMs) {
      return;
    }
    
    // Check condition
    const shouldAlert = await config.condition();
    
    if (shouldAlert) {
      this.sendAlert(config);
      this.lastAlertTimes.set(config.name, now);
    }
  }
  
  private sendAlert(config: AlertConfig): void {
    logger.error(`[ALERT] ${config.severity.toUpperCase()}: ${config.message}`, {
      alert: config.name,
      severity: config.severity,
    });
    
    // Send to external services (Slack, PagerDuty, etc.)
    if (process.env.SLACK_WEBHOOK_URL) {
      this.sendSlackAlert(config);
    }
  }
  
  private async sendSlackAlert(config: AlertConfig): Promise<void> {
    try {
      const emoji = {
        low: '⚠️',
        medium: '🔶',
        high: '🔴',
        critical: '🚨',
      }[config.severity];
      
      await fetch(process.env.SLACK_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji} *${config.severity.toUpperCase()}*: ${config.message}`,
          attachments: [{
            color: config.severity === 'critical' ? 'danger' : 'warning',
            fields: [
              { title: 'Alert', value: config.name, short: true },
              { title: 'Severity', value: config.severity, short: true },
            ],
          }],
        }),
      });
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }
}

export const alertManager = new AlertManager();

// Define alerts
export const alerts: AlertConfig[] = [
  {
    name: 'high_error_rate',
    condition: async () => {
      // Check if error rate > 5%
      return false; // Implement actual check
    },
    severity: 'high',
    message: 'Error rate exceeded 5%',
    cooldown: 15,
  },
  {
    name: 'database_slow',
    condition: async () => {
      // Check if database latency > 1s
      return false; // Implement actual check
    },
    severity: 'medium',
    message: 'Database response time > 1s',
    cooldown: 10,
  },
  {
    name: 'disk_space_low',
    condition: async () => {
      // Check if disk space < 10%
      return false; // Implement actual check
    },
    severity: 'critical',
    message: 'Disk space below 10%',
    cooldown: 30,
  },
];
EOF

echo -e "${GREEN}✅ Alerting configuration created${NC}"

echo ""
echo -e "${GREEN}✅ Monitoring setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Add metrics middleware to your Express app"
echo "2. Expose /metrics endpoint for Prometheus"
echo "3. Set up Prometheus to scrape metrics"
echo "4. Set up Grafana dashboards"
echo "5. Configure Slack webhook for alerts"

exit 0
