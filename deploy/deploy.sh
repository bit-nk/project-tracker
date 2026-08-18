#!/usr/bin/env bash
# One-command provision of the whole app on AWS Lightsail.
# Run from your OWN machine after `aws configure`. Your credentials stay local.
#
#   No domain (self-signed TLS, reach by IP):
#     SSH_CIDR=1.2.3.4/32 ./deploy.sh
#   With a domain (Let's Encrypt TLS):
#     DOMAIN=app.example.com EMAIL=you@example.com SSH_CIDR=1.2.3.4/32 ./deploy.sh
#
# Required env: SSH_CIDR (your IP for SSH access).
# Optional env: DOMAIN + EMAIL (omit for self-signed/IP mode), AWS_REGION,
#               INSTANCE_NAME, BUNDLE, BLUEPRINT, REPO_URL, HOSTED_ZONE_ID
set -euo pipefail

: "${SSH_CIDR:?set SSH_CIDR (your IP, e.g. 1.2.3.4/32) — run: curl -s https://checkip.amazonaws.com}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
# A domain needs an email for Let's Encrypt; without a domain the box self-signs.
if [ -n "${DOMAIN}" ] && [ -z "${EMAIL}" ]; then
  echo "EMAIL is required when DOMAIN is set (Let's Encrypt registration)." >&2
  exit 1
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_NAME="${INSTANCE_NAME:-helm}"
BUNDLE="${BUNDLE:-micro_2_0}"          # 1 GB RAM, ~$5/mo flat
BLUEPRINT="${BLUEPRINT:-ubuntu_24_04}"
REPO_URL="${REPO_URL:-https://github.com/bit-nk/project-tracker.git}"
STATIC_IP_NAME="${INSTANCE_NAME}-ip"
AZ="${AWS_REGION}a"

here="$(cd "$(dirname "$0")" && pwd)"
aws() { command aws --region "${AWS_REGION}" "$@"; }

echo "== Building user-data from launch-script.sh =="
USERDATA="$(mktemp)"
trap 'rm -f "${USERDATA}"' EXIT
sed -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__EMAIL__|${EMAIL}|g" \
    -e "s|__REPO_URL__|${REPO_URL}|g" \
    "${here}/launch-script.sh" > "${USERDATA}"

echo "== Creating Lightsail instance ${INSTANCE_NAME} (${BUNDLE}, ${BLUEPRINT}) in ${AWS_REGION} =="
aws lightsail create-instances \
  --instance-names "${INSTANCE_NAME}" \
  --availability-zone "${AZ}" \
  --blueprint-id "${BLUEPRINT}" \
  --bundle-id "${BUNDLE}" \
  --user-data "$(cat "${USERDATA}")" >/dev/null

echo "== Waiting for instance to be running =="
until [ "$(aws lightsail get-instance-state --instance-name "${INSTANCE_NAME}" \
        --query 'state.name' --output text 2>/dev/null)" = "running" ]; do
  sleep 5; printf '.'
done
echo " running"

echo "== Configuring firewall (443/80 public, 22 -> ${SSH_CIDR}) =="
aws lightsail put-instance-public-ports \
  --instance-name "${INSTANCE_NAME}" \
  --port-infos \
    "fromPort=443,toPort=443,protocol=TCP,cidrs=0.0.0.0/0" \
    "fromPort=80,toPort=80,protocol=TCP,cidrs=0.0.0.0/0" \
    "fromPort=22,toPort=22,protocol=TCP,cidrs=${SSH_CIDR}" >/dev/null

echo "== Allocating + attaching a static IP =="
aws lightsail allocate-static-ip --static-ip-name "${STATIC_IP_NAME}" >/dev/null 2>&1 || true
aws lightsail attach-static-ip --static-ip-name "${STATIC_IP_NAME}" --instance-name "${INSTANCE_NAME}" >/dev/null
IP="$(aws lightsail get-static-ip --static-ip-name "${STATIC_IP_NAME}" --query 'staticIp.ipAddress' --output text)"

echo "== Enabling automatic snapshots (AWS-native backup) =="
aws lightsail enable-add-on \
  --resource-name "${INSTANCE_NAME}" \
  --add-on-request addOnType=AutoSnapshot >/dev/null 2>&1 || true

# Optional: point Route 53 at the instance if a domain + hosted zone are given.
if [ -n "${HOSTED_ZONE_ID:-}" ] && [ -n "${DOMAIN}" ]; then
  echo "== Upserting Route 53 A record ${DOMAIN} -> ${IP} =="
  command aws route53 change-resource-record-sets --hosted-zone-id "${HOSTED_ZONE_ID}" \
    --change-batch "{\"Changes\":[{\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"${DOMAIN}\",\"Type\":\"A\",\"TTL\":300,\"ResourceRecords\":[{\"Value\":\"${IP}\"}]}}]}" >/dev/null
fi

if [ -n "${DOMAIN}" ]; then
  cat <<EOF

============================================================
  Instance is up. Static IP: ${IP}
------------------------------------------------------------
  1) Point DNS: create an A record  ${DOMAIN} -> ${IP}
     (skip if you set HOSTED_ZONE_ID — done above)
  2) First boot installs Docker, builds the app, gets a
     Let's Encrypt cert once DNS resolves, then starts.
        ssh ubuntu@${IP}  ->  sudo tail -f /var/log/helm-launch.log
  3) When it finishes:  https://${DOMAIN}
============================================================
EOF
else
  cat <<EOF

============================================================
  Instance is up. Static IP: ${IP}
------------------------------------------------------------
  No domain: TLS is self-signed and the app is reached by IP.
  No DNS needed. First boot installs Docker, builds the app,
  and starts (a few minutes). Watch it:
     ssh ubuntu@${IP}  ->  sudo tail -f /var/log/helm-launch.log
  Then open:  https://${IP}/
  Your browser warns once about the self-signed cert —
  choose Advanced -> proceed. Anyone with the IP can reach it.
============================================================
EOF
fi
