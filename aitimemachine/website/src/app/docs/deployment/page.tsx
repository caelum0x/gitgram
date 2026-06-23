'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  Check,
  Download,
  Zap,
  BookOpen,
  Terminal,
  Code2,
  Puzzle,
  Webhook,
  Box,
  ChevronRight,
  Server,
  Container,
  Cloud,
  Database,
  Activity,
  HardDrive,
  AlertCircle,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';

const navSections = [
  { id: 'installation', title: 'Installation', href: '/docs/installation', icon: Download },
  { id: 'quick-start', title: 'Quick Start', href: '/docs/quick-start', icon: Zap },
  { id: 'core-concepts', title: 'Core Concepts', href: '/docs/core-concepts', icon: BookOpen },
  { id: 'cli-reference', title: 'CLI Reference', href: '/docs/cli-reference', icon: Terminal },
  { id: 'vscode-extension', title: 'VS Code Extension', href: '/docs/vscode-extension', icon: Puzzle },
  { id: 'mcp-tools', title: 'MCP Tools', href: '/docs/mcp-tools', icon: Webhook },
  { id: 'api-reference', title: 'API Reference', href: '/docs/api-reference', icon: Code2 },
  { id: 'integrations', title: 'Integrations', href: '/docs/integrations', icon: Box },
  { id: 'deployment', title: 'Deployment', href: '/docs/deployment', icon: Server },
];

const onThisPage = [
  { id: 'overview', label: 'Overview' },
  { id: 'prerequisites', label: 'Prerequisites' },
  { id: 'self-hosted', label: 'Self-hosted' },
  { id: 'docker', label: 'Docker' },
  { id: 'kubernetes', label: 'Kubernetes' },
  { id: 'env-reference', label: 'Environment Variables' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'backup', label: 'Backup' },
];

interface CodeBlockProps {
  code: string;
  id: string;
  language?: string;
  label?: string;
}

function CodeBlock({ code, id, language = 'bash', label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-gray-800">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-xs font-medium text-gray-400">{label}</span>
          <span className="text-xs text-gray-600">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="bg-gray-950 p-4 overflow-x-auto text-sm leading-relaxed">
          <code className={`language-${language} text-gray-300`}>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          className={cn(
            'absolute top-3 right-3 p-1.5 rounded-md border transition-all',
            copied
              ? 'bg-green-500/20 border-green-500/40 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-white hover:border-gray-500'
          )}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface EnvVar {
  variable: string;
  required: boolean;
  default: string;
  description: string;
}

const envVars: EnvVar[] = [
  { variable: 'DATABASE_URL', required: true, default: '—', description: 'PostgreSQL connection string (postgres://user:pass@host:5432/db)' },
  { variable: 'REDIS_URL', required: true, default: '—', description: 'Redis connection string (redis://host:6379)' },
  { variable: 'AITM_API_SECRET', required: true, default: '—', description: 'Secret key used to sign API tokens (min 32 chars)' },
  { variable: 'AITM_WEBHOOK_SECRET', required: true, default: '—', description: 'Shared secret for verifying incoming webhook payloads' },
  { variable: 'PORT', required: false, default: '3000', description: 'HTTP port the API server listens on' },
  { variable: 'NODE_ENV', required: false, default: 'production', description: 'Runtime environment (development | production | test)' },
  { variable: 'LOG_LEVEL', required: false, default: 'info', description: 'Logging verbosity (error | warn | info | debug)' },
  { variable: 'CORS_ORIGINS', required: false, default: '*', description: 'Comma-separated list of allowed CORS origins' },
  { variable: 'MAX_CHECKPOINT_SIZE_MB', required: false, default: '500', description: 'Maximum size in MB for a single checkpoint archive' },
  { variable: 'CHECKPOINT_RETENTION_DAYS', required: false, default: '90', description: 'Days to keep checkpoints before automatic pruning' },
  { variable: 'S3_BUCKET', required: false, default: '—', description: 'AWS S3 (or compatible) bucket name for checkpoint storage' },
  { variable: 'S3_REGION', required: false, default: 'us-east-1', description: 'AWS region for the S3 bucket' },
  { variable: 'AWS_ACCESS_KEY_ID', required: false, default: '—', description: 'AWS access key for S3 backup integration' },
  { variable: 'AWS_SECRET_ACCESS_KEY', required: false, default: '—', description: 'AWS secret key for S3 backup integration' },
  { variable: 'SMTP_HOST', required: false, default: '—', description: 'SMTP server hostname for transactional email' },
  { variable: 'SMTP_PORT', required: false, default: '587', description: 'SMTP server port' },
  { variable: 'SMTP_USER', required: false, default: '—', description: 'SMTP authentication username' },
  { variable: 'SMTP_PASS', required: false, default: '—', description: 'SMTP authentication password' },
  { variable: 'RATE_LIMIT_RPM', required: false, default: '300', description: 'Max requests per minute per IP address' },
  { variable: 'METRICS_ENABLED', required: false, default: 'true', description: 'Expose Prometheus metrics at /metrics' },
];

export default function DeploymentPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              <nav className="space-y-1">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Documentation
                </p>
                {navSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = section.id === 'deployment';
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {section.title}
                      {isActive && <ChevronRight className="w-3 h-3 ml-auto text-blue-400" />}
                    </Link>
                  );
                })}
              </nav>

              {/* On this page */}
              <div className="border-t border-gray-800 pt-4">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  On this page
                </p>
                {onThisPage.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-700 flex-shrink-0" />
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 space-y-16 pb-16">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-gray-300 transition-colors">
                Docs
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-gray-300">Deployment</span>
            </nav>

            {/* Header */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium">
                <Server className="w-3.5 h-3.5" />
                Deployment
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Deploy AITM</h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                Run the AITimeMachine API server in your own infrastructure. Choose from
                self-hosted, Docker, or Kubernetes depending on your team size and ops maturity.
              </p>
            </div>

            {/* ── Overview ─────────────────────────────────── */}
            <section id="overview" className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                Overview
              </h2>
              <p className="text-gray-400 leading-relaxed">
                The AITM API server is a Node.js application that exposes a REST API for
                checkpoint management, session tracking, and webhook delivery. It requires a
                PostgreSQL database and a Redis instance. You can deploy it in three ways:
              </p>

              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    icon: Server,
                    title: 'Self-hosted',
                    color: 'text-blue-400',
                    bg: 'bg-blue-500/10 border-blue-500/20',
                    description:
                      'Run directly on a VPS or bare-metal server with systemd and Nginx. Best for teams that prefer minimal tooling.',
                  },
                  {
                    icon: Container,
                    title: 'Docker',
                    color: 'text-cyan-400',
                    bg: 'bg-cyan-500/10 border-cyan-500/20',
                    description:
                      'Spin up the full stack with docker-compose. Ideal for quick self-hosted setups and local staging environments.',
                  },
                  {
                    icon: Cloud,
                    title: 'Kubernetes',
                    color: 'text-purple-400',
                    bg: 'bg-purple-500/10 border-purple-500/20',
                    description:
                      'Deploy to any K8s cluster for production-grade scaling, rolling updates, and automated failover.',
                  },
                ].map(({ icon: Icon, title, color, bg, description }) => (
                  <div
                    key={title}
                    className="flex flex-col gap-3 p-5 bg-gray-900 border border-gray-800 rounded-xl"
                  >
                    <div className={cn('inline-flex p-2 rounded-lg border w-fit', bg)}>
                      <Icon className={cn('w-5 h-5', color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{title}</h3>
                      <p className="text-sm text-gray-400 mt-1 leading-relaxed">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Prerequisites ───────────────────────────── */}
            <section id="prerequisites" className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                Prerequisites
              </h2>
              <p className="text-gray-400 leading-relaxed">
                Ensure the following are available before deploying any variant:
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: 'Node.js', version: '18 or later', note: 'LTS recommended' },
                  { label: 'PostgreSQL', version: '14 or later', note: 'TimescaleDB optional' },
                  { label: 'Redis', version: '6 or later', note: 'Redis 7 recommended' },
                  { label: 'npm', version: '9 or later', note: 'Comes with Node.js' },
                ].map(({ label, version, note }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-lg"
                  >
                    <div>
                      <span className="font-medium text-white">{label}</span>
                      <span className="ml-2 text-sm text-gray-400">{version}</span>
                    </div>
                    <span className="text-xs text-gray-600">{note}</span>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-3">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  All required environment variables must be set before starting the server.
                  The server will throw on startup if any required variable is missing. See the{' '}
                  <a href="#env-reference" className="underline text-amber-400 hover:text-amber-300">
                    Environment Variables reference
                  </a>{' '}
                  below.
                </p>
              </div>
            </section>

            {/* ── Self-hosted ──────────────────────────────── */}
            <section id="self-hosted" className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                  Self-hosted Deployment
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Deploy the AITM API server directly on Ubuntu 22.04 (or any systemd-based Linux)
                  behind an Nginx reverse proxy.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">1. Clone and install</h3>
                <CodeBlock
                  id="clone"
                  language="bash"
                  label="Terminal"
                  code={`git clone https://github.com/aitimemachine/aitm.git
cd aitm/aitimemachine/api-server

# Install production dependencies only
npm ci --omit=dev`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">2. Configure environment</h3>
                <CodeBlock
                  id="env-setup"
                  language="bash"
                  label="Terminal"
                  code={`cp .env.example .env
# Edit .env and fill in all required variables
nano .env`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">3. Run database migrations</h3>
                <CodeBlock
                  id="db-migrate"
                  language="bash"
                  label="Terminal"
                  code={`npm run db:migrate`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">4. Build and start</h3>
                <CodeBlock
                  id="build-start"
                  language="bash"
                  label="Terminal"
                  code={`npm run build

# One-off start (for testing)
npm start

# Production start with PM2 (recommended)
npm install -g pm2
pm2 start dist/index.js --name aitm-api --instances max
pm2 save
pm2 startup`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">5. Nginx reverse proxy</h3>
                <p className="text-gray-400 text-sm">
                  Place the following configuration in{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 text-xs">
                    /etc/nginx/sites-available/aitm
                  </code>
                  , then symlink it to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 text-xs">sites-enabled</code>.
                </p>
                <CodeBlock
                  id="nginx-config"
                  language="nginx"
                  label="/etc/nginx/sites-available/aitm"
                  code={`upstream aitm_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 512M;

    location / {
        proxy_pass         http://aitm_api;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    location /health {
        proxy_pass http://aitm_api/health;
        access_log off;
    }
}`}
                />
                <CodeBlock
                  id="nginx-enable"
                  language="bash"
                  label="Terminal"
                  code={`sudo ln -s /etc/nginx/sites-available/aitm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtain TLS certificate
sudo certbot --nginx -d api.yourdomain.com`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">6. systemd service (alternative to PM2)</h3>
                <CodeBlock
                  id="systemd"
                  language="ini"
                  label="/etc/systemd/system/aitm-api.service"
                  code={`[Unit]
Description=AITimeMachine API Server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=aitm
WorkingDirectory=/opt/aitm/api-server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aitm-api

# Load environment from file
EnvironmentFile=/opt/aitm/api-server/.env

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target`}
                />
                <CodeBlock
                  id="systemd-enable"
                  language="bash"
                  label="Terminal"
                  code={`sudo systemctl daemon-reload
sudo systemctl enable aitm-api
sudo systemctl start aitm-api
sudo systemctl status aitm-api`}
                />
              </div>
            </section>

            {/* ── Docker ───────────────────────────────────── */}
            <section id="docker" className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                  Docker Deployment
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Use Docker Compose to run the full AITM stack — API server, PostgreSQL, and
                  Redis — in isolated containers with a single command.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">docker-compose.yml</h3>
                <CodeBlock
                  id="docker-compose"
                  language="yaml"
                  label="docker-compose.yml"
                  code={`version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: aitm
      POSTGRES_USER: \${POSTGRES_USER:-aitm}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-aitm}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass \${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "\${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api-server:
    image: ghcr.io/aitimemachine/api-server:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://\${POSTGRES_USER:-aitm}:\${POSTGRES_PASSWORD}@postgres:5432/aitm
      REDIS_URL: redis://:\${REDIS_PASSWORD}@redis:6379
      AITM_API_SECRET: \${AITM_API_SECRET}
      AITM_WEBHOOK_SECRET: \${AITM_WEBHOOK_SECRET}
      PORT: 3000
      LOG_LEVEL: \${LOG_LEVEL:-info}
      METRICS_ENABLED: "true"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

volumes:
  postgres_data:
  redis_data:`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Environment variables</h3>
                <p className="text-gray-400 text-sm">
                  Create a <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 text-xs">.env</code> file
                  next to <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 text-xs">docker-compose.yml</code>:
                </p>
                <CodeBlock
                  id="docker-env"
                  language="bash"
                  label=".env"
                  code={`POSTGRES_USER=aitm
POSTGRES_PASSWORD=change-me-strong-password
REDIS_PASSWORD=change-me-redis-password
AITM_API_SECRET=at-least-32-chars-random-secret-here
AITM_WEBHOOK_SECRET=another-32-chars-random-secret
LOG_LEVEL=info`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Start the stack</h3>
                <CodeBlock
                  id="docker-start"
                  language="bash"
                  label="Terminal"
                  code={`# Pull images and start all services in detached mode
docker compose up -d

# Run database migrations inside the running container
docker compose exec api-server npm run db:migrate

# Stream logs
docker compose logs -f api-server`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Health check</h3>
                <CodeBlock
                  id="docker-health"
                  language="bash"
                  label="Terminal"
                  code={`# All services should show "healthy" or "running"
docker compose ps

# Verify the API is responding
curl -s http://localhost:3000/health | jq .`}
                />
                <p className="text-sm text-gray-500">
                  Expected response:{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 text-xs">
                    {`{ "status": "ok", "version": "x.y.z", "db": "connected", "redis": "connected" }`}
                  </code>
                </p>
              </div>
            </section>

            {/* ── Kubernetes ───────────────────────────────── */}
            <section id="kubernetes" className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                  Kubernetes
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Deploy to any Kubernetes 1.26+ cluster. The manifests below are a minimal
                  starting point — adapt resource limits, replicas, and ingress annotations
                  for your cluster.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">ConfigMap</h3>
                <CodeBlock
                  id="k8s-configmap"
                  language="yaml"
                  label="configmap.yaml"
                  code={`apiVersion: v1
kind: ConfigMap
metadata:
  name: aitm-config
  namespace: aitm
data:
  NODE_ENV: "production"
  PORT: "3000"
  LOG_LEVEL: "info"
  METRICS_ENABLED: "true"
  CHECKPOINT_RETENTION_DAYS: "90"`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Deployment</h3>
                <CodeBlock
                  id="k8s-deployment"
                  language="yaml"
                  label="deployment.yaml"
                  code={`apiVersion: apps/v1
kind: Deployment
metadata:
  name: aitm-api
  namespace: aitm
  labels:
    app: aitm-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: aitm-api
  template:
    metadata:
      labels:
        app: aitm-api
    spec:
      containers:
        - name: api-server
          image: ghcr.io/aitimemachine/api-server:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: aitm-config
            - secretRef:
                name: aitm-secrets
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Service and Ingress</h3>
                <CodeBlock
                  id="k8s-service-ingress"
                  language="yaml"
                  label="service-ingress.yaml"
                  code={`apiVersion: v1
kind: Service
metadata:
  name: aitm-api
  namespace: aitm
spec:
  selector:
    app: aitm-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aitm-api
  namespace: aitm
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "512m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.yourdomain.com
      secretName: aitm-api-tls
  rules:
    - host: api.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aitm-api
                port:
                  number: 80`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Apply manifests</h3>
                <CodeBlock
                  id="k8s-apply"
                  language="bash"
                  label="Terminal"
                  code={`kubectl create namespace aitm

# Create the secrets (never commit these to git)
kubectl create secret generic aitm-secrets \\
  --namespace=aitm \\
  --from-literal=DATABASE_URL="postgres://user:pass@host:5432/aitm" \\
  --from-literal=REDIS_URL="redis://:password@host:6379" \\
  --from-literal=AITM_API_SECRET="your-32-char-secret" \\
  --from-literal=AITM_WEBHOOK_SECRET="your-webhook-secret"

# Apply all manifests
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service-ingress.yaml

# Watch rollout
kubectl rollout status deployment/aitm-api -n aitm`}
                />
              </div>
            </section>

            {/* ── Environment Variables Reference ──────────── */}
            <section id="env-reference" className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                Environment Variables Reference
              </h2>
              <p className="text-gray-400 leading-relaxed">
                All configuration is passed through environment variables. Required variables
                must be set or the server will not start.
              </p>

              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900">
                      <th className="px-4 py-3 text-left font-semibold text-gray-300">Variable</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-300">Required</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-300">Default</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-300">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envVars.map((env, i) => (
                      <tr
                        key={env.variable}
                        className={cn(
                          'border-b border-gray-800/60 transition-colors hover:bg-gray-900/40',
                          i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/20'
                        )}
                      >
                        <td className="px-4 py-3">
                          <code className="text-blue-300 text-xs font-mono">{env.variable}</code>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              env.required
                                ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                                : 'bg-gray-700/50 text-gray-400 border border-gray-700'
                            )}
                          >
                            {env.required ? 'required' : 'optional'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-gray-400 text-xs font-mono">{env.default}</code>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs leading-relaxed max-w-xs">
                          {env.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Monitoring ───────────────────────────────── */}
            <section id="monitoring" className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                Monitoring
              </h2>
              <p className="text-gray-400 leading-relaxed">
                AITM exposes two built-in endpoints for health checks and observability.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <h3 className="font-semibold text-white">Health endpoint</h3>
                  </div>
                  <code className="block text-xs text-blue-300 font-mono bg-gray-950 px-3 py-2 rounded-lg border border-gray-800">
                    GET /health
                  </code>
                  <p className="text-sm text-gray-400">
                    Returns <code className="bg-gray-800 px-1 rounded text-gray-300">200 OK</code> with database
                    and Redis connectivity status. Use this for load-balancer health checks and
                    Kubernetes liveness/readiness probes.
                  </p>
                </div>

                <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-purple-400" />
                    <h3 className="font-semibold text-white">Metrics endpoint</h3>
                  </div>
                  <code className="block text-xs text-blue-300 font-mono bg-gray-950 px-3 py-2 rounded-lg border border-gray-800">
                    GET /metrics
                  </code>
                  <p className="text-sm text-gray-400">
                    Exposes Prometheus-compatible metrics: request latency, checkpoint counts,
                    active sessions, and database pool utilization. Enable with{' '}
                    <code className="bg-gray-800 px-1 rounded text-gray-300 text-xs">METRICS_ENABLED=true</code>.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Prometheus scrape config</h3>
                <CodeBlock
                  id="prometheus"
                  language="yaml"
                  label="prometheus.yml (scrape_configs)"
                  code={`scrape_configs:
  - job_name: aitm-api
    static_configs:
      - targets: ["api.yourdomain.com:443"]
    scheme: https
    metrics_path: /metrics
    scrape_interval: 30s`}
                />
              </div>
            </section>

            {/* ── Backup ───────────────────────────────────── */}
            <section id="backup" className="space-y-6">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3">
                Backup
              </h2>
              <p className="text-gray-400 leading-relaxed">
                Configure automated database backups to Amazon S3 (or any S3-compatible
                storage like Cloudflare R2 or MinIO). The script below runs as a cron job
                and retains the last 30 daily dumps.
              </p>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Backup script</h3>
                <CodeBlock
                  id="backup-script"
                  language="bash"
                  label="/opt/aitm/scripts/backup.sh"
                  code={`#!/usr/bin/env bash
set -euo pipefail

# Configuration — set these as environment variables or edit here
DB_NAME="\${POSTGRES_DB:-aitm}"
DB_USER="\${POSTGRES_USER:-aitm}"
S3_BUCKET="\${S3_BUCKET}"
RETAIN_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/aitm_backup_\${TIMESTAMP}.sql.gz"

echo "[backup] Starting dump: \${BACKUP_FILE}"
pg_dump -U "\${DB_USER}" "\${DB_NAME}" | gzip > "\${BACKUP_FILE}"

echo "[backup] Uploading to s3://\${S3_BUCKET}/backups/\${TIMESTAMP}.sql.gz"
aws s3 cp "\${BACKUP_FILE}" "s3://\${S3_BUCKET}/backups/\${TIMESTAMP}.sql.gz" \\
  --storage-class STANDARD_IA

# Remove old backups beyond retention window
echo "[backup] Pruning backups older than \${RETAIN_DAYS} days"
CUTOFF=$(date -d "-\${RETAIN_DAYS} days" +%Y-%m-%dT%H:%M:%S 2>/dev/null \\
  || date -v -\${RETAIN_DAYS}d +%Y-%m-%dT%H:%M:%S)

aws s3 ls "s3://\${S3_BUCKET}/backups/" | while read -r _ _ _ KEY; do
  OBJECT_DATE=$(echo "\${KEY}" | grep -oE '^[0-9]{8}' | head -1 \\
    | xargs -I{} date -d "{}" +%Y-%m-%dT%H:%M:%S 2>/dev/null \\
    || echo "2000-01-01T00:00:00")
  if [[ "\${OBJECT_DATE}" < "\${CUTOFF}" ]]; then
    aws s3 rm "s3://\${S3_BUCKET}/backups/\${KEY}"
    echo "[backup] Deleted old backup: \${KEY}"
  fi
done

rm -f "\${BACKUP_FILE}"
echo "[backup] Done"`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Schedule with cron</h3>
                <CodeBlock
                  id="backup-cron"
                  language="bash"
                  label="Terminal"
                  code={`# Make the script executable
chmod +x /opt/aitm/scripts/backup.sh

# Edit the crontab for the aitm user
crontab -e

# Add this line to run daily at 02:00 UTC
0 2 * * * S3_BUCKET=your-bucket-name /opt/aitm/scripts/backup.sh >> /var/log/aitm-backup.log 2>&1`}
                />
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-3">
                <HardDrive className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm text-blue-200/80 font-medium">Restore from backup</p>
                  <p className="text-sm text-blue-200/60">
                    To restore from a backup file:{' '}
                    <code className="bg-blue-950/40 px-1.5 py-0.5 rounded text-blue-300 text-xs">
                      aws s3 cp s3://your-bucket/backups/TIMESTAMP.sql.gz - | gunzip | psql -U aitm aitm
                    </code>
                  </p>
                </div>
              </div>
            </section>

            {/* Footer nav */}
            <div className="flex items-center justify-between pt-8 border-t border-gray-800">
              <Link
                href="/docs/integrations"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors group"
              >
                <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                Integrations
              </Link>
              <Link
                href="/docs/api-reference"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors group"
              >
                API Reference
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
