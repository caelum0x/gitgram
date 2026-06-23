#!/bin/bash

# Auto-scaling Configuration Script
# This script sets up auto-scaling for the application

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}⚡ Setting up Auto-scaling Configuration${NC}"
echo ""

# Create PM2 ecosystem file for auto-scaling
cat > ecosystem.autoscale.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'gitgram-api',
      script: './dist/index.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Auto-scaling configuration
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Monitoring
      instance_var: 'INSTANCE_ID',
      listen_timeout: 10000,
      kill_timeout: 5000,
      
      // Health check
      wait_ready: true,
      
      // Environment-specific settings
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
    },
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['server1.gitgram.app', 'server2.gitgram.app'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/gitgram.git',
      path: '/var/www/gitgram',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.autoscale.config.js --env production',
      'pre-setup': 'apt-get install git -y',
    },
  },
};
EOF

echo -e "${GREEN}✅ PM2 auto-scaling configuration created${NC}"

# Create Docker Compose file for horizontal scaling
cat > docker-compose.scale.yml << 'EOF'
version: '3.8'

services:
  # Load Balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - gitgram-network
  
  # API Servers (scalable)
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
    deploy:
      replicas: 3  # Start with 3 instances
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - gitgram-network
  
  # Redis Cache
  redis:
    image: redis:alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - gitgram-network
  
  # Database (PostgreSQL)
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=gitgram
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - gitgram-network

networks:
  gitgram-network:
    driver: bridge

volumes:
  redis-data:
  postgres-data:
EOF

echo -e "${GREEN}✅ Docker Compose scaling configuration created${NC}"

# Create Kubernetes deployment for cloud auto-scaling
cat > k8s-deployment.yml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gitgram-api
  labels:
    app: gitgram
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gitgram
      tier: backend
  template:
    metadata:
      labels:
        app: gitgram
        tier: backend
    spec:
      containers:
      - name: api
        image: gitgram/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: gitgram-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: gitgram-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: gitgram-api-service
spec:
  selector:
    app: gitgram
    tier: backend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gitgram-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gitgram-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF

echo -e "${GREEN}✅ Kubernetes auto-scaling configuration created${NC}"

# Create scaling monitoring script
cat > scripts/monitor-scaling.sh << 'EOF'
#!/bin/bash

# Monitor auto-scaling metrics

echo "📊 Auto-scaling Metrics"
echo "======================="
echo ""

# PM2 instances
if command -v pm2 &> /dev/null; then
  echo "PM2 Instances:"
  pm2 list
  echo ""
fi

# Docker containers
if command -v docker &> /dev/null; then
  echo "Docker Containers:"
  docker ps --filter "name=gitgram" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
fi

# Kubernetes pods
if command -v kubectl &> /dev/null; then
  echo "Kubernetes Pods:"
  kubectl get pods -l app=gitgram
  echo ""
  
  echo "HPA Status:"
  kubectl get hpa gitgram-api-hpa
  echo ""
fi

# System resources
echo "System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100}')"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
EOF

chmod +x scripts/monitor-scaling.sh

echo -e "${GREEN}✅ Scaling monitoring script created${NC}"

echo ""
echo -e "${GREEN}✅ Auto-scaling setup complete!${NC}"
echo ""
echo "Available scaling options:"
echo "1. PM2 Cluster Mode: pm2 start ecosystem.autoscale.config.js"
echo "2. Docker Compose: docker-compose -f docker-compose.scale.yml up --scale api=5"
echo "3. Kubernetes: kubectl apply -f k8s-deployment.yml"
echo ""
echo "Monitor scaling: ./scripts/monitor-scaling.sh"

exit 0
