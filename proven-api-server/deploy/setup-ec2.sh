#!/usr/bin/env bash
# =============================================================================
# EC2 Setup Script for Proven Backend
#
# Supports:
# - Amazon Linux (2/2023): yum/dnf
# - Ubuntu/Debian: apt
#
# Purpose:
# - Install Docker + Docker Compose
# - (Optional) Install Nginx + Certbot
# - Create /opt/proven-backend working directory
# - Create a simple systemd unit that runs docker-compose on boot
#
# Usage:
#   ./setup-ec2.sh
#
# Optional flags (env vars):
#   INSTALL_NGINX_CERTBOT=0 ./setup-ec2.sh
# =============================================================================

set -euo pipefail

APP_DIR="/opt/proven-backend"
SERVICE_NAME="proven-backend"
INSTALL_NGINX_CERTBOT="${INSTALL_NGINX_CERTBOT:-1}"

step() {
  echo ""
  echo "[$1] $2"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ "$(id -u)" -eq 0 ]]; then
  die "Run this script as a non-root user with sudo privileges (not as root)."
fi

if ! command -v sudo >/dev/null 2>&1; then
  die "sudo is required."
fi

PKG=""
if command -v apt-get >/dev/null 2>&1; then
  PKG="apt"
elif command -v dnf >/dev/null 2>&1; then
  PKG="dnf"
elif command -v yum >/dev/null 2>&1; then
  PKG="yum"
else
  die "Unsupported OS: could not find apt-get, dnf, or yum."
fi

echo "=========================================="
echo "Proven Backend - EC2 Setup"
echo "Package manager: ${PKG}"
echo "=========================================="

step "1/7" "Updating system packages + installing prerequisites (curl, git)..."
case "$PKG" in
  apt)
    sudo apt-get update -y
    sudo apt-get upgrade -y
    sudo apt-get install -y curl git ca-certificates
    ;;
  dnf)
    sudo dnf -y update
    sudo dnf -y install curl git ca-certificates
    ;;
  yum)
    sudo yum -y update
    sudo yum -y install curl git ca-certificates
    ;;
esac

step "2/7" "Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  # Amazon Linux 2 supports amazon-linux-extras; try it first (fast path).
  if command -v amazon-linux-extras >/dev/null 2>&1; then
    sudo amazon-linux-extras install docker -y || true
  fi

  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm -f get-docker.sh
  fi
else
  echo "Docker already installed."
fi

# Ensure Docker is enabled and running
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now docker
else
  # Very old distros (not expected on EC2) may not have systemd.
  sudo service docker start
fi

# Allow current user to run docker without sudo (takes effect after re-login)
sudo usermod -aG docker "$USER" || true

step "3/7" "Installing Docker Compose..."
if ! command -v docker-compose >/dev/null 2>&1; then
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
else
  echo "Docker Compose already installed."
fi

if [[ "$INSTALL_NGINX_CERTBOT" -eq 1 ]]; then
  step "4/7" "Installing Nginx (optional)..."
  set +e
  if ! command -v nginx >/dev/null 2>&1; then
    case "$PKG" in
      apt)
        sudo apt-get install -y nginx
        ;;
      dnf)
        sudo dnf -y install nginx
        ;;
      yum)
        # AL2 may prefer amazon-linux-extras nginx1; try yum first then fallback.
        sudo yum -y install nginx || (command -v amazon-linux-extras >/dev/null 2>&1 && sudo amazon-linux-extras install nginx1 -y)
        ;;
    esac
  fi
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now nginx || true
  fi
  set -e

  step "5/7" "Installing Certbot (optional)..."
  # Certbot packaging varies by distro/repo; don't fail the setup if this step fails.
  set +e
  case "$PKG" in
    apt)
      sudo apt-get install -y certbot python3-certbot-nginx
      ;;
    dnf)
      sudo dnf -y install certbot python3-certbot-nginx
      ;;
    yum)
      sudo yum -y install certbot python3-certbot-nginx
      ;;
  esac
  if [[ $? -ne 0 ]]; then
    echo "Certbot install failed (non-fatal). You can install it later if you want HTTPS via nginx."
  fi
  set -e
else
  step "4/7" "Skipping Nginx/Certbot (INSTALL_NGINX_CERTBOT=0)."
  step "5/7" "Skipping Nginx/Certbot (INSTALL_NGINX_CERTBOT=0)."
fi

step "6/7" "Setting up application directory (${APP_DIR})..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

step "7/7" "Creating systemd service (${SERVICE_NAME})..."
if command -v systemctl >/dev/null 2>&1; then
  sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null << SERVICE
[Unit]
Description=Proven Backend
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SERVICE

  sudo systemctl daemon-reload
  sudo systemctl enable "${SERVICE_NAME}"
else
  echo "systemd not detected; skipping systemd service creation."
fi

echo ""
echo "=========================================="
echo "✅ Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Clone your repo into ${APP_DIR}:"
echo "   cd ${APP_DIR}"
echo "   git clone https://github.com/YOUR_REPO.git ."
echo ""
echo "2. Create .env.production file:"
echo "   cp .env.production.example .env.production"
echo "   nano .env.production  # Fill in your values"
echo ""
echo "3. Start the service:"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo ""
echo "NOTE: Log out and log back in (or reboot) for Docker group permissions to take effect."
echo ""
