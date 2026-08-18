# Deploying Helm to AWS Lightsail (~$5/month)

Everything runs on **one** Lightsail instance: nginx + the Fastify API + PostgreSQL,
in Docker. TLS is **self-signed** (no domain — reach it by IP) or **Let's Encrypt**
(if you give it a domain). Backups are Lightsail automatic snapshots plus a nightly
`pg_dump`.

```
Browser ──HTTPS──▶ nginx ──/──▶ static frontend
                        └─/api─▶ Fastify ──▶ PostgreSQL (localhost)
```

## Prerequisites (one time, on your machine)
1. **AWS CLI** installed and configured — credentials never leave your machine:
   ```bash
   aws configure          # verify with: aws sts get-caller-identity
   ```
2. Your public IP for SSH access:
   ```bash
   curl -s https://checkip.amazonaws.com
   ```
3. *(Domain mode only)* a domain you can point an `A` record at.

## Deploy — from the `deploy/` directory

**No domain (self-signed TLS, reach by IP):**
```bash
SSH_CIDR=$(curl -s https://checkip.amazonaws.com)/32 ./deploy.sh
```

**With a domain (Let's Encrypt TLS):**
```bash
DOMAIN=app.example.com EMAIL=you@example.com \
SSH_CIDR=$(curl -s https://checkip.amazonaws.com)/32 ./deploy.sh
```

Optional overrides: `AWS_REGION` (default `us-east-1`), `INSTANCE_NAME` (`helm`),
`BUNDLE` (`micro_2_0` = 1 GB), `REPO_URL`, `HOSTED_ZONE_ID` (domain mode only —
auto-creates the Route 53 A record).

The script creates the instance (1 GB, Ubuntu 24.04) with `launch-script.sh` as
first-boot user-data, opens the firewall (443 + 80 public — **anyone with the
address can reach it**; 22 restricted to your IP), attaches a static IP, enables
automatic snapshots, and prints the IP + next steps.

## After it runs

**No-domain mode** — no DNS needed. First boot (a few minutes) installs Docker,
builds the app, generates a self-signed cert, and starts. Then open
**`https://<STATIC_IP>/`** — your browser warns once about the self-signed cert
(Advanced → proceed). Health check: `https://<STATIC_IP>/api/health`.

**Domain mode** — create an `A` record `app.example.com → <STATIC_IP>` (skipped if
you passed `HOSTED_ZONE_ID`). The box waits for DNS, then grabs a Let's Encrypt
cert and starts; it retries every 15 min, so point DNS whenever. Then open
**`https://app.example.com`**.

Watch first boot either way:
```bash
ssh ubuntu@<STATIC_IP>
sudo tail -f /var/log/helm-launch.log
```

## Redeploying new code
```bash
ssh ubuntu@<STATIC_IP>
cd /opt/helm && sudo git pull
sudo docker run --rm -v /opt/helm:/app -w /app node:22-slim sh -c "npm ci && npm run build -- --base=/"
cd deploy && sudo docker compose --env-file .env up -d --build
```

## Backups
- **Automatic snapshots** — enabled by `deploy.sh`; whole-disk, AWS-native, restorable in the console.
- **Nightly `pg_dump`** — `deploy/backup.sh` runs via `/etc/cron.daily`, keeps 7 days in
  `/var/backups/helm`. To copy off-box, set `S3_BUCKET` (needs an IAM user with
  `s3:PutObject` and its keys on the instance).

Restore a dump:
```bash
gunzip -c /var/backups/helm/helm-YYYYMMDD-HHMMSS.sql.gz \
  | sudo docker compose -f /opt/helm/deploy/docker-compose.yml exec -T db psql -U postgres helm
```

## Costs
| Item | ~Monthly |
|---|---|
| Lightsail `micro_2_0` (1 GB, static IP, 40 GB SSD, 2 TB transfer) | ~$5.00 |
| Automatic snapshots (~40 GB) | ~$2.00 |
| **Total** | **~$7/mo** |

Self-signed TLS is free; Let's Encrypt is free. Drop snapshots to sit at ~$5.

## Tear down
```bash
aws lightsail delete-instance --instance-name helm
aws lightsail release-static-ip --static-ip-name helm-ip
```

## Note: the frontend is not yet wired to the API
Demo data has been removed, so the deployed UI **starts empty** (empty states
everywhere). It still reads its in-memory store, not the live API — a reload
won't persist yet. To make the UI use the API, swap the data seam
(`src/data/repo.ts`) to `fetch()` the `/api/*` endpoints (login, then CRUD). The
backend and all endpoints are ready and running; that frontend change is the
remaining step (BACKEND_TODO R8).
