# Deployment

Plain **Node 22 + PostgreSQL 16 on one Linux server**. No Docker, no
container runtime, no orchestrator — the stack the project was specified
with. Everything below has been run end to end except the parts that need a
real host (TLS issuance, DNS, the cron install).

The deployable artefact is `.next/standalone/` — a self-contained server
directory of about 110 MB, against ~980 MB of `node_modules`. You copy a
directory and restart a service.

---

## 0. What you need first

| Thing | Why |
|---|---|
| A Linux server, 2 vCPU / 4 GB RAM / 40 GB disk | Comfortable for one institute. The app is not memory-hungry; Postgres and backups want the disk. |
| A domain pointed at it | TLS and the `APP_URL` on printed receipts. |
| Ubuntu 24.04 LTS (or Debian 12) | The commands below assume `apt` and `systemd`. |

Sizing note: the demo database is a few MB. An institute with 1,500
students and five years of fee history is still well under a gigabyte. Disk
goes to backups, not data.

---

## 1. Install the runtime

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg git nginx postgresql-16 postgresql-client-16

# Node 22 from NodeSource — Ubuntu's own package is older.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v    # expect v22.x
psql --version
```

## 2. Create the service user and the database

```bash
sudo adduser --system --group --home /srv/bellcell bellcell
sudo mkdir -p /srv/bellcell/{app,backups}
sudo chown -R bellcell:bellcell /srv/bellcell

# A password you generate, not one from this document.
DB_PASSWORD="$(openssl rand -base64 24)"
echo "database password: $DB_PASSWORD"   # put it in a password manager now

sudo -u postgres psql <<SQL
CREATE USER bellcell WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE bellcell OWNER bellcell;
SQL
```

Postgres listens on localhost only by default on Ubuntu. Leave it that way:
the app connects over the loopback, and the database should never be
reachable from the network.

## 3. Get the code and configure it

```bash
sudo -u bellcell git clone https://github.com/AdpediaGitOfficial/bellcell-app.git /srv/bellcell/app
cd /srv/bellcell/app
sudo -u bellcell cp .env.example .env
sudo -u bellcell nano .env
```

Set at least:

```ini
DATABASE_URL="postgresql://bellcell:THE_PASSWORD_FROM_STEP_2@localhost:5432/bellcell?schema=public"
APP_URL="https://erp.bellcell.example"
INSTITUTE_NAME="Bell Cell Group of Institutions"
SESSION_TTL_HOURS="12"
PORT="3000"
HOSTNAME="127.0.0.1"
```

```bash
sudo chmod 600 .env
sudo chown bellcell:bellcell .env
```

There is **no session secret to set**. The cookie carries an opaque random
token; the server stores only its SHA-256. `.env.example` explains why, and
an earlier version of that file asked for a `SESSION_SECRET` that no code
ever read — if you are working from an old copy, drop it.

## 4. Build

```bash
cd /srv/bellcell/app
sudo -u bellcell npm ci
sudo -u bellcell npx prisma generate
sudo -u bellcell npx prisma migrate deploy
sudo -u bellcell npm run build
```

`migrate deploy` applies the committed migrations and nothing else. Never
run `prisma migrate dev` or `db push` against this database — both can
rewrite the schema.

`npm run build` ends by running `scripts/assemble-standalone.mjs`, which
copies `.next/static` and `public` into the standalone directory. Without
that step the app boots and serves HTML with no CSS or JavaScript, which
looks like a broken deployment rather than a missing copy. It is wired as
`postbuild`, so it cannot be forgotten, and CI asserts the result exists.

**Seed data.** `npm run db:seed` writes the demo institute — two branches,
fictional students, demo logins with a published password. Run it on a
staging box to have something to click. **Never on production.**

## 5. Run it as a service

```bash
sudo cp deploy/bellcell.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bellcell
systemctl status bellcell
curl -s localhost:3000/api/health      # {"status":"ok","database":"ok","latencyMs":2}
```

## 6. Put nginx in front and issue TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/bellcell
sudo nano /etc/nginx/sites-available/bellcell        # set your real server_name
sudo ln -s /etc/nginx/sites-available/bellcell /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.bellcell.example
```

nginx overwrites `X-Forwarded-For` with the real peer address rather than
appending to it. That matters: the login throttle counts failures per
address, and a client-supplied header would let an attacker pick a fresh
"address" per request. It is only trustworthy because the Node process
binds `127.0.0.1` and cannot be reached directly.

## 7. Create the first administrator

The seed's demo logins must not exist on production. Create one real
Super Admin, then make every other account from the Employees screen.

```bash
cd /srv/bellcell/app
sudo -u bellcell --preserve-env=DATABASE_URL node -e '
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const db = new PrismaClient();
(async () => {
  const email = process.argv[1];
  const password = require("crypto").randomBytes(9).toString("base64url");
  await db.user.create({
    data: {
      email,
      fullName: process.argv[2],
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
    },
  });
  console.log("created " + email + " with one-time password: " + password);
  await db.$disconnect();
})();
' principal@bellcell.in "Anjali Menon"
```

The account is created with `mustChangePassword`, so the first sign-in goes
straight to the change-password screen and nowhere else.

You also need at least one **branch** before anything branch-scoped works.
Create it from Settings, or insert it directly if the UI is not reachable
yet.

## 8. Backups, before anyone types real data

```bash
sudo cp deploy/backup.sh deploy/restore-drill.sh /srv/bellcell/app/deploy/
sudo -u postgres crontab -e
# 15 1 * * *  /srv/bellcell/app/deploy/backup.sh >> /var/log/bellcell-backup.log 2>&1
```

`backup.sh` writes a compressed `pg_dump`, refuses a suspiciously small
file, verifies the archive is readable, and prunes beyond 30 days. It ends
with a commented `rclone` line: **fill that in.** A backup that never
leaves the server does not survive the server.

Once a quarter, prove the backups work:

```bash
sudo -u postgres /srv/bellcell/app/deploy/restore-drill.sh
```

It restores the newest dump into a scratch database, counts students,
payments, ledger entries, payslips and users, prints the ledger's net
position, and drops the scratch database. A restore that produces an empty
schema "succeeds" — that is what the counts are for.

---

## Upgrading

```bash
cd /srv/bellcell/app
sudo -u postgres /srv/bellcell/app/deploy/backup.sh     # always, first
sudo -u bellcell git pull
sudo -u bellcell npm ci
sudo -u bellcell npx prisma migrate deploy
sudo -u bellcell npm run build
sudo systemctl restart bellcell
curl -s localhost:3000/api/health
```

There is a few-second gap at the restart. For an office system that is
fine; do it outside office hours anyway. Zero-downtime would mean two
processes behind nginx, which also means moving the login throttle out of
process memory — see the note in `src/lib/auth/throttle.ts`.

**Rolling back** is a `git checkout` of the previous tag, rebuild, restart.
Rolling back a *migration* is not automatic: restore the backup. This is
why step one is a backup.

---

## Operating it

```bash
systemctl status bellcell            # is it up
journalctl -u bellcell -f            # live logs
journalctl -u bellcell --since today -p err
curl -s localhost:3000/api/health    # is the database reachable
```

`/api/health` returns `200` when the app can query Postgres and `503` when
it cannot, and recovers on its own once the database comes back — no
restart needed. Point an uptime check at it. It is deliberately
unauthenticated and deliberately says nothing about versions or schema.

### Security posture as deployed

| Control | Where |
|---|---|
| TLS, HSTS | nginx (`deploy/nginx.conf`) |
| CSP with a per-request nonce | `src/middleware.ts` |
| `X-Frame-Options`, `nosniff`, `Referrer-Policy` | `next.config.ts` |
| Session: opaque token, SHA-256 at rest, httpOnly + secure | `src/lib/auth/session.ts` |
| Per-account lockout — 5 failures, 15 minutes | `src/app/login/actions.ts` |
| Per-address throttle — 15 failures in 10 minutes | `src/lib/auth/throttle.ts` |
| Permission check on every page | `src/lib/auth/guard.ts`, enforced by a test |
| Append-only audit trail | `src/lib/audit.ts` |
| Database not reachable from the network | Postgres default on Ubuntu |

---

## Still missing before a real go-live

These are not code; they are decisions and setup only the institute can do.

1. **No error monitoring.** Crashes land in `journalctl` and nowhere else.
   Sentry or equivalent is roughly an hour's work and worth it.
2. **Backups are not off-site** until the `rclone` line in `backup.sh` is
   filled in.
3. **No SMS or email gateway** (open question #6). DLT sender-ID and
   template registration must be in Bell Cell's own name and takes weeks —
   start it before you need it.
4. **No data migration** from whatever the institute uses today (open
   question #7). Usually the single biggest schedule risk.
5. **The statutory and academic rules are assumptions** — open questions
   #2 (fee structure), #4 and #4b (PF/ESI, leave entitlements), #4a
   (attendance thresholds), #10 (exam grading). Nothing statutory deducts
   until someone switches it on, so this costs nothing today, but going
   live on guesses is how an institute ends up owing the EPFO money.
6. **One process, one server.** No redundancy. If the box dies, the
   recovery path is a new box plus step 1–8 plus the latest backup —
   worth rehearsing once rather than discovering under pressure.
