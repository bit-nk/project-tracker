#!/usr/bin/env bash
# Runs ONCE as root on the Lightsail instance's first boot (passed as --user-data).
# deploy.sh substitutes __DOMAIN__, __EMAIL__ and __REPO_URL__ before upload.
# Safe to re-run over SSH for recovery: secrets and the database survive.
set -euo pipefail
exec > /var/log/helm-launch.log 2>&1   # everything below is logged here

DOMAIN="__DOMAIN__"
EMAIL="__EMAIL__"
REPO_URL="__REPO_URL__"
APP_DIR="/opt/helm"
ENV_STASH="/root/helm.env"

echo "== Helm bootstrap for ${DOMAIN} =="

# 0. Swap. Lightsail images ship none; `npm ci` + a Vite build peak near 1 GB
#    and would be OOM-killed (aborting the bootstrap), and postgres/node need
#    runtime headroom. Idempotent so a re-run is a no-op.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-helm-swap.conf
fi

# 1. System packages + Docker.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Preserve secrets across re-runs. Postgres only honors POSTGRES_PASSWORD on
#    the FIRST initdb, so regenerating passwords would lock the app out of the
#    existing pgdata volume. Stash the current .env before wiping the tree.
if [ -f "${APP_DIR}/deploy/.env" ]; then
  cp -p "${APP_DIR}/deploy/.env" "${ENV_STASH}"
fi

# 3. Fetch source.
rm -rf "${APP_DIR}"
git clone --depth 1 "${REPO_URL}" "${APP_DIR}"
cd "${APP_DIR}"

# 4. Restore or generate the backend env (never leaves this box).
umask 077
if [ -f "${ENV_STASH}" ]; then
  install -m 600 "${ENV_STASH}" deploy/.env
else
  ADMIN_DB_PASSWORD="$(openssl rand -hex 32)"
  APP_DB_PASSWORD="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
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
  cp -p deploy/.env "${ENV_STASH}"
fi
umask 022

# 5. Build the frontend (served statically by nginx). base=/ since served at root.
docker run --rm -v "${APP_DIR}":/app -w /app node:22-slim \
  sh -c "npm ci && npm run build -- --base=/"

# 6. Point nginx at this domain, and build the api image once.
sed -i "s/__DOMAIN__/${DOMAIN}/g" deploy/nginx.conf
cd "${APP_DIR}/deploy"
docker compose --env-file .env build

# 7. Crons — installed UNCONDITIONALLY (before TLS) so a cert hiccup never
#    silently drops backups or renewal.
install -m 700 "${APP_DIR}/deploy/backup.sh" /usr/local/bin/helm-backup
cat > /etc/cron.daily/helm-backup <<EOF
#!/usr/bin/env bash
APP_DIR=${APP_DIR} /usr/local/bin/helm-backup
EOF
chmod +x /etc/cron.daily/helm-backup

cat > /etc/cron.daily/helm-certbot-renew <<EOF
#!/usr/bin/env bash
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/www/certbot:/var/www/certbot \\
  certbot/certbot renew --webroot -w /var/www/certbot --quiet
cd ${APP_DIR}/deploy && docker compose exec -T web nginx -s reload || true
EOF
chmod +x /etc/cron.daily/helm-certbot-renew

# 8. TLS + bring-up helper. Waits until DNS points at THIS box before asking
#    Let's Encrypt (so we never burn the failed-validation limit), gets a cert if
#    missing, then starts the stack. Idempotent, so it doubles as a watchdog.
mkdir -p /var/www/certbot
cat > /usr/local/bin/helm-bringup <<EOF
#!/usr/bin/env bash
set -uo pipefail
DOMAIN="${DOMAIN}"
EMAIL="${EMAIL}"
APP_DIR="${APP_DIR}"
if [ ! -d "/etc/letsencrypt/live/\${DOMAIN}" ]; then
  MYIP="\$(curl -fsS https://checkip.amazonaws.com || true)"
  RES="\$(getent hosts "\${DOMAIN}" | awk '{print \$1; exit}')"
  if [ -z "\${MYIP}" ] || [ "\${RES}" != "\${MYIP}" ]; then
    echo "helm-bringup: DNS \${DOMAIN} (\${RES:-none}) != this box (\${MYIP:-none}); waiting"
    exit 1
  fi
  docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot \\
    certonly --standalone --non-interactive --agree-tos --email "\${EMAIL}" -d "\${DOMAIN}" || exit 1
fi
cd "\${APP_DIR}/deploy" && docker compose --env-file .env up -d
EOF
chmod +x /usr/local/bin/helm-bringup

# Try once. If DNS isn't pointed yet (default path: the user creates the A record
# after deploy.sh prints the IP), keep retrying every 15 min until it succeeds —
# no more silent dead box, no manual SSH surgery.
if flock -n /tmp/helm-bringup.lock /usr/local/bin/helm-bringup; then
  echo "== Helm is up: https://${DOMAIN} =="
else
  echo "== DNS/cert not ready; installing retry cron (every 15 min) =="
  cat > /etc/cron.d/helm-bringup <<EOF
*/15 * * * * root flock -n /tmp/helm-bringup.lock /usr/local/bin/helm-bringup >> /var/log/helm-bringup.log 2>&1
EOF
fi

echo "== Helm bootstrap complete =="
