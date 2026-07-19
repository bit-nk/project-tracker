# Deploying Helm to AWS Lightsail (~$5/month)

Everything runs on **one** Lightsail instance: nginx + the Fastify API + PostgreSQL,
in Docker. TLS is Let's Encrypt. Backups are Lightsail automatic snapshots plus a
nightly `pg_dump`.

```
Browser ──HTTPS──▶ nginx ──/──▶ static frontend
                        └─/api─▶ Fastify ──▶ PostgreSQL (localhost)
```

## Prerequisites (one time, on your machine)
1. A **domain** you control (to create an A record).
2. **AWS CLI** installed and configured with your credentials — they never leave your machine:
   ```bash
   aws configure
   ```
3. Your public IP for SSH access:
   ```bash
   curl -s https://checkip.amazonaws.com
   ```

## Deploy
From the `deploy/` directory:

```bash
DOMAIN=app.example.com \
EMAIL=you@example.com \
SSH_CIDR=$(curl -s https://checkip.amazonaws.com)/32 \
./deploy.sh
```

Optional overrides: `AWS_REGION` (default `us-east-1`), `INSTANCE_NAME` (`helm`),
`BUNDLE` (`micro_2_0` = 1 GB), `REPO_URL`, `HOSTED_ZONE_ID` (auto-creates the
Route 53 A record if set).

The script:
1. Creates the Lightsail instance (1 GB, Ubuntu 24.04) with `launch-script.sh` as first-boot user-data.
2. Opens the firewall — 443 + 80 public, 22 restricted to your IP.
3. Allocates and attaches a static IP.
4. Enables automatic snapshots.
5. Prints the IP and next steps.

## After it runs
1. **Point DNS**: create an `A` record `app.example.com → <STATIC_IP>` (skipped if you passed `HOSTED_ZONE_ID`).
2. **First boot** (a few minutes) installs Docker, builds the frontend, obtains the
   TLS certificate, and starts the stack. Watch it:
   ```bash
   ssh ubuntu@<STATIC_IP>
   sudo tail -f /var/log/helm-launch.log
   ```
3. Visit **https://app.example.com**. Health check: `https://app.example.com/api/health`.

> DNS must resolve to the IP **before** the cert step succeeds. If you point DNS
> after first boot, re-run the cert step: `sudo bash -c 'cd /opt/helm && bash deploy/launch-script.sh'`
> is heavy — instead just re-run steps 6–7 (see the file), or reboot the instance.

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

TLS (Let's Encrypt) and DNS (if you use Lightsail's) are free. Drop snapshots to
sit at ~$5.

## Tear down
```bash
aws lightsail delete-instance --instance-name helm
aws lightsail release-static-ip --static-ip-name helm-ip
```

## Note: wiring the frontend to the API
This deploy serves the current frontend, which still reads its **in-memory demo
data** (`src/data/repo.ts`). To make the UI use the live API, swap that data seam
to `fetch()` calls against `/api/*` (login, then the CRUD endpoints). The backend
and all endpoints are ready; that frontend change is the remaining step.
