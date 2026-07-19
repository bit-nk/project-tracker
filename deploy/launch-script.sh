#!/usr/bin/env bash
# Runs ONCE as root on the Lightsail instance's first boot (passed as --user-data).
# deploy.sh substitutes __DOMAIN__, __EMAIL__ and __REPO_URL__ before upload.
set -euo pipefail
exec > /var/log/helm-launch.log 2>&1   # everything below is logged here

DOMAIN="__DOMAIN__"
EMAIL="__EMAIL__"
REPO_URL="__REPO_URL__"
APP_DIR="/opt/helm"

echo "== Helm bootstrap for ${DOMAIN} =="

# 1. System packages + Docker.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Fetch the source.
rm -rf "${APP_DIR}"
git clone --depth 1 "${REPO_URL}" "${APP_DIR}"
cd "${APP_DIR}"

# 3. Generate secrets and the backend env (never leaves this box).
gen() { openssl rand -hex 32; }
ADMIN_DB_PASSWORD="$(gen)"
APP_DB_PASSWORD="$(gen)"
JWT_SECRET="$(gen)"
cat > deploy/.env <<EOF
NODE_ENV=production
PORT=8080
CORS_ORIGIN=https://${DOMAIN}
JWT_SECRET=${JWT_SECRET}
ADMIN_DB_PASSWORD=${ADMIN_DB_PASSWORD}
APP_DB_PASSWORD=${APP_DB_PASSWORD}
DATABASE_URL=postgres://helm_app:${APP_DB_PASSWORD}@db:5432/helm
DATABASE_ADMIN_URL=postgres://postgres:${ADMIN_DB_PASSWORD}@db:5432/helm
EOF
chmod 600 deploy/.env

# 4. Build the frontend (served statically by nginx). base=/ since we serve at the domain root.
docker run --rm -v "${APP_DIR}":/app -w /app node:22-slim \
  sh -c "npm ci && npm run build -- --base=/"

# 5. Point nginx at this domain.
sed -i "s/__DOMAIN__/${DOMAIN}/g" deploy/nginx.conf

# 6. Obtain the TLS certificate (standalone; port 80 is still free here).
mkdir -p /var/www/certbot
docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot \
  certonly --standalone --non-interactive --agree-tos \
  --email "${EMAIL}" -d "${DOMAIN}"

# 7. Start everything.
cd deploy
docker compose --env-file .env up -d --build

# 8. Cert auto-renewal (daily) + nginx reload.
cat > /etc/cron.daily/helm-certbot-renew <<EOF
#!/usr/bin/env bash
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/www/certbot:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot --quiet
cd ${APP_DIR}/deploy && docker compose exec -T web nginx -s reload || true
EOF
chmod +x /etc/cron.daily/helm-certbot-renew

# 9. Nightly database backup (local; keeps 7 days). See deploy/backup.sh for S3.
install -m 700 "${APP_DIR}/deploy/backup.sh" /usr/local/bin/helm-backup
cat > /etc/cron.daily/helm-backup <<EOF
#!/usr/bin/env bash
APP_DIR=${APP_DIR} /usr/local/bin/helm-backup
EOF
chmod +x /etc/cron.daily/helm-backup

echo "== Helm bootstrap complete: https://${DOMAIN} =="
