# Production and self-hosting

Step 13 supplies a tested independent Docker installation, operator controls, consistent database backups and a restore workflow. Deployment to Jason's Hostinger VPS is pending hostname, live access and workload inspection. The files below are ready for review; they have not been installed on that VPS.

## Intended Hostinger installation

Jason confirmed that OpenScroll will share the existing VPS with the book-publishing site and other applications. Keep the product name OpenScroll; the public subdomain will be selected and pointed at the app later. Inspect existing workloads and proxy routes before installing anything. Do not take over ports 80/443 or replace the existing proxy. Plan a private localhost port and a separate database volume until the hostname is chosen. The current managed session reports no attached VPS credentials, Hostinger tools, VPN or TCP destination grants; live inspection is pending connection setup.

## Requirements and boundaries

Use a Linux host with Docker Engine and Compose **2.24.4 or newer**, Python 3, a shell and `sha256sum`. The development source needs Node 24.19.0 and npm only when building outside Docker or running development checks. Runtime containers include the server, built player, official icon, runtime dependencies, Chromium and fonts. No Vite/development server is needed.

Plan for at least 2 CPU cores, 4 GiB RAM (8 GiB recommended for shared hosting/PDF workloads), and sufficient free disk for PostgreSQL, application images, builds and backups. The app has a 2 GiB container limit and a single file-processing slot. These are starting settings, not a VPS sizing certification; inspect existing services and measure representative courses before accepting users. Allow several extra GiB during image builds. Do not prune someone else's containers, images or volumes to make room.

The production Compose file is **deploy/compose.yaml**, independent of the development Compose stack. PostgreSQL has no published port. The app binds only to `127.0.0.1:3100` by default. Persistent database and certificate volumes belong to the Compose project `openscroll-production`. For another independent installation, set a unique `COMPOSE_PROJECT_NAME` and an unused `APP_PORT`.

## First installation

1. Check the host's workloads, listeners, disk/memory, Docker version, firewall and existing reverse proxy before allocating ports or directories. Reserve a dedicated checkout such as `/opt/openscroll`. Keep this checkout and its configuration restricted to trusted operators; Docker access is effectively host administrator access.
2. Build and retain a versioned application image, for example `docker build -t openscroll:release-13 .`. On a normal VPS public CA trust is sufficient. In this managed development cloud, use its documented proxy CA build-secret command instead. A registry transfer or `docker save`/`docker load` can move the exact image without installing Node on the VPS.
3. Run `deploy/ops.sh init`. It exclusively creates `deploy/.env.production` with mode 600 and a fresh 64-character URL-safe hex database password; it refuses to replace an existing file. Set `OPENSCROLL_IMAGE` to the retained image tag/digest, `OPENSCROLL_HOST`, matching HTTPS `APP_ORIGIN`, certificate contact email and SMTP sender/credentials. Use single-quoted dotenv values for passwords containing `$`, `#` or spaces. Keep the generated database password unchanged after initialization; changing the environment alone does not rotate a running PostgreSQL user's password.
4. Run `deploy/ops.sh config` to validate without printing credentials, then `deploy/ops.sh start`. This starts PostgreSQL, applies migrations through **4**, and waits for the production app to become healthy. Registration defaults to closed; email verification is required for public signups. No development credentials or outbox mode are permitted in this deployment.
5. Configure HTTPS using one of the choices below. Test `https://HOST/api/health`; expect `status: ready`. Check the served app, icon, login, and one real course publication before inviting authors.
6. Run `deploy/ops.sh mail-check`. It checks SMTP connection, TLS and configured authentication without sending email. Separately exercise real verification and password-reset delivery with your own test account, including spam-folder checks. A successful SMTP handshake does not prove delivery. Configure the sending domain's SPF/DKIM/DMARC with the chosen mail provider.
7. Bootstrap a known author with the operator command below, or deliberately enable verified registration, create/verify the first account, and close it again. Confirm sign-in and sign-out over HTTPS.
8. Take a backup and restore it into a separate isolated project before treating the installation as ready. Configure daily backup scheduling, encrypted off-host copying and monitoring as described below.

Secrets are ignored by Git and excluded from Docker build context. Do not publish `docker compose config` output, `.env.production`, raw database dumps, private mail or administrator listings. `ops.sh config` uses `--quiet`.

## HTTPS on a shared VPS

If another OpenStage product already owns ports 80/443, keep that proxy. Add a hostname route to `http://127.0.0.1:3100` (or chosen app port), preserve the original host, allow a **90 MiB** request body and provide a suitable request timeout (at least 60 seconds). Configure that proxy to replace untrusted forwarding headers. The app trusts exactly one proxy hop (`TRUST_PROXY=1`), so client-based rate limits distinguish users behind it. Do not expose the app port publicly or trust arbitrary forwarding chains. If the proxy runs in a container, its loopback is not the host's loopback: use a deliberately configured shared network/route after inspecting that installation.

On a dedicated host with ports 80/443 available, point the hostname's A/AAAA records to the server and run `deploy/ops.sh edge`. The optional pinned Caddy service obtains/renews certificates, redirects HTTP to HTTPS, applies compression and one-year HSTS, and proxies to the private app. Caddy's data volume contains certificate keys; retain it privately. DNS, firewall and public ACME connectivity must work. Do not enable the edge profile on a host with a conflicting proxy. HSTS applies only to the selected hostname, without preloading or all-subdomain policy.

The local test uses Caddy's internal issuer and a specifically trusted test root. It verifies TLS rather than disabling certificate validation; it is not proof that public ACME issuance succeeds on the final domain.

## Operator controls

These commands run inside the production image with database access. There is no browser-accessible administrator endpoint or automatic privileged author role.

- `deploy/ops.sh admin list`: author IDs, verification/suspension state and names/emails. Treat the output as private.
- `deploy/ops.sh admin usage`: course count, actual active asset bytes, and saved reusable/snapshot bytes per author.
- `deploy/ops.sh admin suspend UUID`: block future authenticated requests/logins and revoke sessions and recovery tokens. Courses remain intact. Already executing requests may finish.
- `deploy/ops.sh admin enable UUID`: enable the account and revoke any remaining sessions/tokens; a fresh login is required.
- `deploy/ops.sh admin revoke-sessions UUID` or `all`: revoke sessions and recovery tokens after an incident or restoration.
- `deploy/ops.sh admin create-author EMAIL 'Display name'`: supply a 15–128 character password on standard input. This provisions a verified author for closed registration; the operator must establish ownership of that address first. Never put the password in command arguments or shell history. In Bash, use `read -r -s -p 'Initial password: ' initial_password`, then `printf '%s\n' "$initial_password" | deploy/ops.sh admin create-author EMAIL 'Display name'`, then `unset initial_password`. Provide the password through a private channel or have the author request a reset once SMTP is tested.

State-changing operator commands create database audit records in `admin_events` containing operation, target ID and time, with no password/token. Host access logs identify the actual operator; the application does not invent an identity for a shared shell. Audit records are part of database backups.

Registration is controlled by `REGISTRATION_ENABLED`. Active course assets are capped at **1 GiB per author**, configurable with `AUTHOR_ASSET_LIMIT_MIB` (1–65536); the server serializes imports and saves per owner and rejects over-budget writes before changing content. Current document limits, 100 courses/author, 100 reusable items/author, 10 snapshots/course and 256 MiB encoded saved-content/snapshot budget also apply. The asset quota excludes document JSON, snapshots and reusable packets. Existing accounts above a lowered limit must remove assets or receive a higher limit before saving. Quotas are limits, not reserved disk capacity; keep registration closed until overall host capacity is established.

## Backups and disaster recovery

`deploy/ops.sh backup` runs a consistent custom-format `pg_dump`, validates its table of contents, and writes a mode-600 dump and SHA-256 sidecar under the mode-700 `backups/` directory (override with `OPENSCROLL_BACKUP_DIR`). An interrupted dump remains a partial file and is not announced as a backup. The dump contains authors, password hashes, course documents, binary assets, reusable items, snapshots and operator audit records. It does not include `.env.production`, SMTP credentials, image binaries or Caddy certificate keys: retain those separately and securely.

Local backup files contain private data and are **not encrypted by this script**. Copy them to encrypted off-host storage with restricted access. Choose retention after an off-host copy is verified; no automatic eviction hides an unsuccessful transfer. Monitor backup age, capacity and failed jobs. A VPS snapshot or a course snapshot alone is insufficient.

Optional systemd examples are in `deploy/openscroll-backup.service` and `.timer`. They assume `/opt/openscroll`, run daily with a randomized delay in the server's timezone, and use the private configuration. Adapt paths, install them as an operator and enable the timer only after the manual backup/restore drill succeeds. Add your chosen encrypted off-host transfer and failure alerting before production use. These files have not been installed on the user's VPS.

To restore safely:

1. Prepare a **separate Compose project** and unused port with a fresh private environment file. Preserve the damaged/current installation and its volumes. Set `COMPOSE_PROJECT_NAME`, `OPENSCROLL_ENV_FILE` and, if needed, `OPENSCROLL_BACKUP_DIR` for every command on the recovery target. Disable its public proxy route while recovering.
2. Run `deploy/ops.sh restore /absolute/path/backup.dump`. Its sidecar must match. The command refuses a running target app or any public-schema table in the target database, starts only that target database, then restores in a single transaction. It cannot overwrite a populated database. Historical sessions and recovery links are revoked after restoration.
3. Run `deploy/ops.sh start` to apply the current compatible migrations and check health. Sign in afresh; compare course revisions, download/reopen assets, inspect snapshots and reusable content, and publish a representative PDF/HTML/SCORM course.
4. Check email and capacity. Switch the proxy only after accepting the recovered instance. Preserve the prior installation until recovery is accepted. Never use `docker compose down --volumes` on a live installation; that permanently removes database volumes.

The test harness `npx tsx tools/deployment-smoke.ts` automates fresh install, restart, backup, empty-target restoration, session revocation and HTTPS checks using unique disposable projects and synthetic accounts. It deletes only its own test volumes afterward. It requires the built `openscroll:production` image (or `OPENSCROLL_TEST_IMAGE`) and the pinned Caddy/PostgreSQL images; it does not contact a live VPS.

## Upgrades and rollback

Retain the currently running image and a pre-upgrade backup. Build/pull and test a separately named new image, update `OPENSCROLL_IMAGE` in the protected configuration, then run `deploy/ops.sh upgrade`. It takes a backup, stops the app, runs the new migration process, then starts the new app and checks health. A failed migration leaves the app stopped for inspection rather than silently running incompatible code. Do not run upgrades concurrently with backup/restore or other operator maintenance.

Migrations are transactional, serialized and forward-only; startup refuses an older schema or a database newer than its code. Restarting the app does not discard its database. To roll back after a schema change, restore the pre-upgrade backup into a separate project using its retained compatible image and verify before switching traffic. Do not assume pointing an old binary at a migrated database is safe.

## Health, logs and release gate

`deploy/ops.sh status` and `logs` show container health and bounded log history. `/api/health` checks PostgreSQL; startup also checks schema version. Runtime HTTP logs include request ID, method, route template, status and elapsed time; they omit raw URLs/query strings, bodies, cookies, IPs, email addresses and tokens. Successful health probes are omitted. Migration and SMTP errors use generic messages. Logs rotate at 10 MiB with three files per container. The app runs as an unprivileged user, with a read-only root filesystem, bounded writable temporary storage, dropped capabilities and a graceful stop interval.

Configure external HTTPS availability alerts, backup-age/failure alerts, disk alerts (before 80% usage), container restarts/OOM monitoring and certificate expiry checks. Review real course load and revise resource limits before a pilot. This step is production preparation; final VPS deployment, public DNS/certificates, real mail, encrypted off-host backup acceptance and broader/manual accessibility checks remain gates for live release.
