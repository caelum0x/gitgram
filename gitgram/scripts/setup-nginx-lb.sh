#!/bin/bash

# Nginx Load Balancer Configuration Generator
# This script generates Nginx configuration for load balancing

set -e

# Configuration
DOMAIN="${DOMAIN:-gitgram.app}"
BACKEND_SERVERS="${BACKEND_SERVERS:-localhost:3000,localhost:3001,localhost:3002}"
OUTPUT_FILE="${OUTPUT_FILE:-/etc/nginx/sites-available/gitgram-lb.conf}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}⚙️  Generating Nginx Load Balancer Configuration${NC}"

# Generate upstream configuration
UPSTREAM_SERVERS=""
IFS=',' read -ra SERVERS <<< "$BACKEND_SERVERS"
for server in "${SERVERS[@]}"; do
  UPSTREAM_SERVERS+="    server $server max_fails=3 fail_timeout=30s;\n"
done

# Generate Nginx configuration
cat > "$OUTPUT_FILE" << EOF
# Gitgram Load Balancer Configuration
# Generated on $(date)

# Upstream backend servers
upstream gitgram_backend {
    least_conn;  # Use least connections load balancing
    
$UPSTREAM_SERVERS
    # Health check
    keepalive 32;
}

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req_zone \$binary_remote_addr zone=auth_limit:10m rate=10r/s;
limit_conn_zone \$binary_remote_addr zone=conn_limit:10m;

# Cache configuration
proxy_cache_path /var/cache/nginx/gitgram levels=1:2 keys_zone=gitgram_cache:10m max_size=1g inactive=60m use_temp_path=off;

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Logging
    access_log /var/log/nginx/gitgram_access.log;
    error_log /var/log/nginx/gitgram_error.log;
    
    # Max upload size
    client_max_body_size 10M;
    
    # Proxy settings
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_cache_bypass \$http_upgrade;
    
    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
    }
    
    # API endpoints
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_conn conn_limit 10;
        
        proxy_pass http://gitgram_backend;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
    
    # Auth endpoints (stricter rate limiting)
    location /api/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        
        proxy_pass http://gitgram_backend;
    }
    
    # WebSocket for Socket.io
    location /socket.io/ {
        proxy_pass http://gitgram_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
    
    # Static files (with caching)
    location /uploads/ {
        proxy_pass http://gitgram_backend;
        proxy_cache gitgram_cache;
        proxy_cache_valid 200 60m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        add_header X-Cache-Status \$upstream_cache_status;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://gitgram_backend;
        access_log off;
    }
}

# API subdomain
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # CORS headers
    add_header Access-Control-Allow-Origin "https://$DOMAIN" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
    add_header Access-Control-Allow-Credentials "true" always;
    
    # Handle OPTIONS requests
    if (\$request_method = OPTIONS) {
        return 204;
    }
    
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://gitgram_backend;
    }
}
EOF

echo -e "${GREEN}✅ Configuration generated: $OUTPUT_FILE${NC}"
echo ""
echo "Next steps:"
echo "1. Review the configuration: sudo nano $OUTPUT_FILE"
echo "2. Test the configuration: sudo nginx -t"
echo "3. Enable the site: sudo ln -s $OUTPUT_FILE /etc/nginx/sites-enabled/"
echo "4. Reload Nginx: sudo systemctl reload nginx"

exit 0
