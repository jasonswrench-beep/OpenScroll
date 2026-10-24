# Step 13 validation

Date: 2026-10-23 (America/New_York).

## Implemented preparation

- Independent production Compose project with private PostgreSQL, migration service, unprivileged production image, localhost app binding, resource limits, read-only app filesystem, graceful stopping, restart policies and bounded logs.
- Optional pinned Caddy HTTPS service, plus guidance for sharing an existing reverse proxy without taking its ports.
- Exclusive mode-600 configuration initialization, generated URL-safe database secret, SMTP/TLS connectivity check and closed registration by default.
- Database migration 4: reversible account access through suspension/enable, session/token revocation and private operator audit records. No public administrator endpoint.
- Server-enforced active asset quota (default 1 GiB/author), serialized with course creation/saves. Existing course/reuse/snapshot/project limits remain.
- Atomic backup-file publication, custom-format PostgreSQL dumps, integrity sidecars and empty-target-only transactional restoration. Restoration revokes historical sessions/recovery links.
- Backup-first upgrade command, daily scheduler examples, capacity/alerting and encrypted off-host backup guidance.

See [self-hosting and recovery guide](SELF-HOSTING.md), [production configuration](../deploy/compose.yaml), [operator script](../deploy/ops.sh), and [deployment test](../tools/deployment-smoke.ts).

## Automated checks

- `npm run build`: passes for client/player/server, including the official icon and compiled operator tools.
- `npm test`: **81 pass**, including bounded proxy-trust configuration and asset quota configuration validation.
- `npm run test:integration`: **37 pass**. New operator cases verify migration 4 preserving existing course/asset data, closed-registration provisioning and auditing, concurrent quota enforcement, rollback of rejected saves, suspension, fresh-login requirements after enabling and session revocation. The migration case was strengthened and its five-case suite rerun successfully.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`: **42 pass**, including authoring/recovery, reusable content, themes, HTML/PDF and both SCORM harnesses.
- `npm run licenses`, `npm run schema:check`, shell syntax and TypeScript checks pass. No dependency or portable schema version change.
- The production Caddyfile validates with its pinned runtime, including the 90 MiB upload limit. The initializer was checked for mode-600 generated secrets and refusal to overwrite an existing configuration. Systemd units are examples only: this cloud has no `docker.service` or `/opt/openscroll` installation, so host timer activation remains untested.
- Production image builds from the Dockerfile with the managed proxy and CA build secret. Disposable build cache was cleared as needed without deleting database volumes.

## Production installation and recovery drill

`npx tsx tools/deployment-smoke.ts` passes using the actual production image and separate empty PostgreSQL volumes. The drill provisions a synthetic author under closed registration, imports a real asset-bearing project, creates a snapshot and reusable group, publishes a validated backup, restarts the app, and restores into another independent project. Full editable project bytes and revisions match afterward; snapshots/reusable records survive and historical sessions are rejected. The final rerun also verifies backup-first upgrade/migration rerun and rejects a mismatched checksum before restoration. It rejects restoration over a populated database, generates a PDF inside the read-only/capability-restricted runtime, and checks logs for fixture password/token/email leakage.

The optional pinned Caddy proxy passes an HTTPS health request using its local issuer with the explicit test root trusted; TLS verification remains enabled. The first proxy run revealed inherited proxy settings routing internal app traffic incorrectly. The production edge service now preserves outbound proxy settings while adding private service names to `NO_PROXY`, and the rerun passes. Each drill removes only its own uniquely named containers/volumes; the development database remains intact.

## External gates

The Hostinger MCP tools are unavailable in this session, and no hostname/VPS identifier, current workload inventory or live access has been supplied. No VPS, DNS, firewall, existing proxy, public certificate or live account has been changed. The hostname question was sent while independent work continued.

Public ACME issuance, real SMTP verification/reset delivery, encrypted off-host backup destination/retention, host capacity and alerting must be accepted on the selected VPS before a live pilot. No claim of public deployment, real mail delivery, multi-node operation, browser-wide accessibility or PDF/UA certification is made. The single app instance is intentional: in-memory processing/rate-limit coordination is not a distributed deployment design.
