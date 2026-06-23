#!/bin/bash

# SSL Certificate Setup Script
# This script sets up SSL certificates using Let's Encrypt (Certbot)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${DOMAIN:-gitgram.app}"
EMAIL="${SSL_EMAIL:-admin@gitgram.app}"
WEBROOT="${WEBROOT:-/var/www/html}"

echo -e "${GREEN}🔒 SSL Certificate Setup${NC}"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ Please run as root (use sudo)${NC}"
  exit 1
fi

# Install Certbot if not installed
if ! command -v certbot &> /dev/null; then
  echo -e "${YELLOW}📦 Installing Certbot...${NC}"
  
  if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
  elif command -v yum &> /dev/null; then
    # CentOS/RHEL
    yum install -y certbot python3-certbot-nginx
  else
    echo -e "${RED}❌ Unsupported package manager${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Certbot installed${NC}"
else
  echo -e "${GREEN}✅ Certbot already installed${NC}"
fi

# Obtain SSL certificate
echo -e "${YELLOW}🔐 Obtaining SSL certificate...${NC}"

certbot certonly \
  --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  -d "api.$DOMAIN"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ SSL certificate obtained successfully${NC}"
else
  echo -e "${RED}❌ Failed to obtain SSL certificate${NC}"
  exit 1
fi

# Set up auto-renewal
echo -e "${YELLOW}⏰ Setting up auto-renewal...${NC}"

# Add cron job for auto-renewal
CRON_CMD="0 0,12 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'"

(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_CMD") | crontab -

echo -e "${GREEN}✅ Auto-renewal configured (runs twice daily)${NC}"

# Test auto-renewal
echo -e "${YELLOW}🧪 Testing auto-renewal...${NC}"
certbot renew --dry-run

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Auto-renewal test passed${NC}"
else
  echo -e "${YELLOW}⚠️  Auto-renewal test failed (certificate is still valid)${NC}"
fi

# Display certificate info
echo ""
echo -e "${GREEN}📋 Certificate Information:${NC}"
certbot certificates

echo ""
echo -e "${GREEN}✅ SSL setup completed successfully!${NC}"
echo ""
echo "Certificate locations:"
echo "  Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  Private Key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo "Next steps:"
echo "1. Update your Nginx configuration to use these certificates"
echo "2. Reload Nginx: sudo systemctl reload nginx"
echo "3. Test your SSL: https://www.ssllabs.com/ssltest/"

exit 0
