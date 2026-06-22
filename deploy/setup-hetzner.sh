#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Hetzner VPS bootstrap helper
# Run as root on a fresh Ubuntu 22.04+ VPS
# This is not the full launch procedure; use docs/runbook.md for launch.
# =============================================================================

echo "========================================="
echo " Hetzner VPS Bootstrap for Gitgram + AITM"
echo "========================================="

# --- System Updates ---
echo "[1/7] Updating system packages..."
apt-get update && apt-get upgrade -y

# --- Install Node 20 + PM2 ---
echo "[2/7] Installing Node 20 runtime and PM2..."
apt-get install -y curl ca-certificates gnupg build-essential

if ! command -v node &> /dev/null || ! node -v | grep -q '^v20\.'; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
fi

npm install -g pm2

# --- Install Nginx ---
echo "[3/7] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# --- Configure UFW Firewall ---
echo "[4/7] Configuring firewall..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
echo "y" | ufw enable
ufw status

# --- Create deploy user ---
echo "[5/7] Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    echo "  Created user 'deploy'. Set a password with: passwd deploy"
    echo "  Add SSH key: ssh-copy-id deploy@<server-ip>"
else
    echo "  User 'deploy' already exists."
fi

# --- Setup Nginx config ---
echo "[6/7] Installing Nginx configuration..."
mkdir -p /etc/ssl/cloudflare

# Copy the nginx config
if [ -f "$(dirname "$0")/nginx/sites.conf" ]; then
    cp "$(dirname "$0")/nginx/sites.conf" /etc/nginx/conf.d/sites.conf
    echo "  Nginx config installed to /etc/nginx/conf.d/sites.conf"
else
    echo "  WARNING: nginx/sites.conf not found. Copy it manually."
fi

# --- Create project directory & env files ---
echo "[7/7] Setting up project directory..."
PROJECT_DIR="/home/deploy/gitgram-ai"
BOOTSTRAP_ENV_DIR="$PROJECT_DIR/bootstrap-env"
mkdir -p "$PROJECT_DIR"
mkdir -p "$BOOTSTRAP_ENV_DIR"

# Copy env templates if they exist
for env_file in .env.postgres.example .env.gitgram.example .env.gitgram-web.example .env.aitm-api.example .env.aitm-website.example; do
    src="$(dirname "$0")/../$env_file"
    dest_name="${env_file%.example}"
    if [ -f "$src" ] && [ ! -f "$BOOTSTRAP_ENV_DIR/$dest_name" ]; then
        cp "$src" "$BOOTSTRAP_ENV_DIR/$dest_name"
        echo "  Staged $dest_name in $BOOTSTRAP_ENV_DIR"
    fi
done

chown -R deploy:deploy "$PROJECT_DIR"

# --- Print next steps ---
echo ""
echo "========================================="
echo " Setup Complete!"
echo "========================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Upload Cloudflare Origin Certificates:"
echo "   scp gitgram.app.pem root@<server>:/etc/ssl/cloudflare/"
echo "   scp gitgram.app.key root@<server>:/etc/ssl/cloudflare/"
echo "   (gitgram.app wildcard cert covers timemachine.gitgram.app subdomains)"
echo ""
echo "2. Configure Cloudflare DNS (A records):"
echo "   gitgram.app          -> <server-ip> (Proxied)"
echo "   www.gitgram.app      -> <server-ip> (Proxied)"
echo "   timemachine.gitgram.app     -> <server-ip> (Proxied)"
echo "   timemachine-api.gitgram.app -> <server-ip> (Proxied)"
echo ""
echo "3. Set Cloudflare SSL/TLS mode to 'Full (Strict)'"
echo ""
echo "4. Edit environment files in $PROJECT_DIR:"
echo "   Templates were staged in $BOOTSTRAP_ENV_DIR"
echo "   Copy them into the repo root after cloning"
echo ""
echo "5. Clone repo and continue with the manual runbook:"
echo "   su - deploy"
echo "   cd $PROJECT_DIR"
echo "   git clone <repo-url> ."
echo "   cp bootstrap-env/.env.gitgram ."
echo "   cp bootstrap-env/.env.gitgram-web ."
echo "   cp bootstrap-env/.env.aitm-api ."
echo "   cp bootstrap-env/.env.aitm-website .  # optional"
echo "   less docs/runbook.md"
echo "   npm run verify:launch"
echo "   bash scripts/deploy-launch.sh staging --gitgram-only"
echo "   # Then deploy AITM and run the public verification script"
echo ""
echo "6. Test nginx config:"
echo "   nginx -t && systemctl reload nginx"
