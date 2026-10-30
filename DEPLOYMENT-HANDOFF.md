# OpenScroll security draft deployment handoff

This is preparation for review, not a deployment authorization or a new release.
The database-privilege draft is based on renderer-isolation PR #6 at
`3a0e43c7143e6e058b418896ca4f1595649483e7`, following the dependency and
owner-approval changes. Record the final reviewed head and its own terminal CI
before considering any deployment. Existing alpha tags, release archives and
checksums describe their original commits; do not move or replace them and do
not treat the former alpha.3 handoff as evidence for this draft.

No production inspection, role provisioning, account promotion, migration, mail
send, Hostinger change or deployment is implied by this file. Public sample
courses remain deferred. Other products and existing host services are outside
this change.

## What must travel together

Retain an app and renderer image built from the same reviewed source commit.
The app uses Node 24.22.2 and the restricted `openscroll_app` database login.
The credential-free renderer communicates through the private Unix socket,
without a database connection or network access. Its process/resource boundaries
remain required; there is no in-process PDF fallback.

The database now has three credential tiers:

| Tier | Service purpose |
| --- | --- |
| Existing `openscroll` bootstrap administrator | Dedicated provisioning and trusted backup/restore only; existing `POSTGRES_PASSWORD` retained |
| `openscroll_migrator` / `ADMIN_DATABASE_URL` | Migrations and separate maintenance account/admin commands |
| `openscroll_app` / app-only `DATABASE_URL` | Reviewed runtime table/column operations; no privileged memberships, ownership, DDL or migration/audit rewriting |

This changes privileges and object ownership, not application rows or the current
schema version **5**. It does not delete accounts/course data or reassign the
OpenScroll owner account. Read [database privileges](docs/DATABASE-PRIVILEGES.md),
[instance-owner activation](docs/INSTANCE-ACCESS.md) and
[renderer isolation](docs/RENDERER-ISOLATION.md) before preparing a live cutover.

Before release, record privately or in appropriate non-secret release evidence:

- Final source commit and terminal exact-head CI links, including failures or
  unrun checks; do not reuse the alpha importer's historical test totals.
- App and renderer image IDs/digests, build source and full inventories for both
  images. A single application image is no longer a complete installation.
- Reviewed database role/column policy and negative privilege checks, plus
  renderer credential/network/deadline checks and PDF quality regressions.
- Compatible retained rollback image pair, actual PostgreSQL version/image and
  HBA policy, protected configuration location, fresh database backup/checksum
  and successful isolated restore evidence.
- Remaining native vulnerabilities and the accepted browser patch path. Debian's
  currently available Chromium `.73` remains below the upstream `.79` security
  release; isolation and a passing fix-availability scan gate do not install
  those fixes. Optional alternative browser-provider work is a separate review
  and terms decision, not an approved dependency of this handoff.

## Inspect the actual installation before approval

The deployment owner must identify the real OpenScroll project, current image
pair, protected configuration, PostgreSQL cluster/volume, public hostname,
private app port, proxy route, actual PostgreSQL version/image, current schema
version and host capacity. Check existing service health before changing anything. Do not guess the live state,
create a parallel installation by assumption, take over ports 80/443 or replace
an existing reverse proxy.

Use a dedicated PostgreSQL cluster for this OpenScroll instance. PostgreSQL roles
are cluster-wide; this provisioning workflow must not be pointed at another
product's cluster. If unexpected application objects, conflicting designated
roles or unsupported schema customizations are found, preserve them and stop for
review. The code deliberately avoids `REASSIGN OWNED` or automatic deletion.

The reviewed database image is PostgreSQL **17.11-bookworm**, pinned by digest
`839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`.
Do not reintroduce the old 17.7 pin or downgrade a newer observed installation
merely to match a checkout. Production also adopts an explicit read-only
`deploy/pg_hba.conf` bind mount: the ordered SCRAM rules restrict app/migrator TCP
logins to the `openscroll` database. The bootstrap operator's trusted local
socket remains inside the database container, without an app/renderer mount.
The public HBA file must be a regular readable **0644** file without group/world
write access, while protected environment and password-input files stay **0600**.
The operator commands preflight this policy file; do not resolve a failure by
making secrets readable or applying blanket recursive permissions.

Review this concrete installation/cutover/rollback plan and obtain the required
production authorization before executing it. Engineering draft authorization
does not authorize live credential, role, configuration or account changes.

## Backup-first cutover plan

1. Record the exact current installation, app/renderer and database image/version,
   configuration/HBA identities and health. Privately identify the intended existing owner by actual account UUID
   and matching verified email. Preserve that account, password hash and authored
   data; do not guess an ID or select the first public signup.
2. Take a fresh consistent database backup; verify its checksum, successful
   restoration into an isolated empty target and encrypted off-host availability.
   Retain the protected configuration and compatible app/renderer image pair.
   Keep the current installation/volumes intact. Do not use `down --volumes`.
3. Build or transfer the reviewed replacement image pair and verify its recorded
   identities. Preserve normal CA/TLS verification. Do not substitute a mutable
   `latest` tag or infer provenance from a successful source-only test.
4. In the verified existing protected configuration, run the additive
   `deploy/ops.sh db-credentials` step when approved. It generates only missing
   runtime/migrator password values and preserves the existing bootstrap password
   and existing configuration values. Do not run `init` over an existing file.
   Set the retained `OPENSCROLL_IMAGE` and `OPENSCROLL_RENDERER_IMAGE`; preserve
   unrelated origin, mail, quota, port, volume and registration settings.
5. Validate with `deploy/ops.sh config`, which avoids printing expanded secrets.
   Use the approved `deploy/ops.sh upgrade` workflow: HBA preflight, backup, stop
   app/renderer, reapply the reviewed database image/HBA service configuration and
   wait for database health, provision the dedicated roles, migrate/reapply runtime
   grants, then start the app/renderer and check health. The changed image, HBA
   bind mount and PostgreSQL command require planned database-container
   recreation/restart; this is a cold database change, not merely an online HBA
   reload. Compose retains the existing database volume and bootstrap password.
   Do not create a fresh volume, remove data or rotate that password implicitly.
   The privileged provisioning service is one-shot;
   migrations/admin commands use only the migrator connection. The long-running
   app must receive no bootstrap/migrator credential. Leave it stopped if any
   provisioning or migration precondition fails.
6. If the previous schema predates migration 5, that migration preserves all
   account/course data while invalidating old sessions/tokens and making legacy
   accounts pending. Keep authoring unavailable, privately review unexpected
   accounts and explicitly bootstrap only the intended existing verified owner
   with its UUID plus matching email. If schema 5 was already applied, the role
   cutover does not reset approvals or repeat account demotion; confirm existing
   owner access without changing account rows unnecessarily.
7. Sign in afresh, verify the existing owner's course inventory and run the
   controlled acceptance checks below. Unexpected accounts remain pending with
   their data preserved. Verification/password reset do not grant approval.
   Request-notification recipient and owner login remain separate private values;
   no new SMTP credential or real email is created by the database draft.
8. Recheck all identified existing host services. Record actual image/role/schema
   identities, backup evidence and acceptance results privately. Claim deployment
   only after those checks and the production authorization are complete.

For a fresh installation, use the separate first-install procedure in
[SELF-HOSTING](docs/SELF-HOSTING.md). New independent self-hosters choose their own
owner and notification recipient; no personal/global owner authority is built in.

## Controlled acceptance checks

Use a designated synthetic test account/course and remove only that test data
through the established operator workflow. Inspect existing owner data without
altering it merely to run a test.

- Verify HTTPS/proxy behavior, `/api/health`, schema compatibility and the actual
  served assets. Confirm the runtime connects as `openscroll_app` and cannot use
  privileged membership, schema/table/temporary-object creation, owner-role
  writes, migration-history writes or audit update/delete. Use the reviewed
  negative-check harness; also verify TCP denial when app/migrator logins target
  another database. Do not grant a missing permission or loosen HBA to make it
  green.
- Confirm fresh intended-owner login and preserved existing courses/assets.
  Anonymous, unverified, pending and revoked access must fail closed. Exercise a
  controlled request → verification → pending → approval → fresh login flow;
  revoke it and verify old sessions stop working. No public signup becomes owner.
- Exercise stored-course editing/reload, portable import/download/reopen,
  spreadsheet preview/cancel/import/undo and representative HTML/SCORM export.
  Author content, answers and feedback must remain intact; use controlled test
  data rather than mutating real courses for acceptance.
- Produce a real authorized PDF containing Latin/CJK text with embedded fonts.
  Verify the renderer's actual process identity, private mounts, absent synthetic
  app credentials, denied network access and timeout/crash cleanup separately
  from browser JavaScript policy. A working PDF alone does not prove isolation.
- Perform the approved mail/backup/monitoring checks. SMTP handshake/acceptance
  is not proof of human delivery, and app health is not a complete security or
  renderer readiness check. Real mail testing remains a separately authorized
  production acceptance action.

## Failure and rollback

A failed provision/migration must leave the app stopped. Preserve the error and
inventory for review without exposing passwords, dumps or account listings.
Never solve it by restoring the bootstrap URL to the app, making roles superuser,
adding role memberships, accepting unknown objects or disabling the privilege
checks. A renderer failure must not trigger in-process PDF rendering or a broader
network/host mount.

Retain a matched compatible image pair and configuration for rollback. Ownership
and grants can differ from an older release, even when the application schema
number is still 5; do not assume an arbitrary older binary/URL is a safe rollback.
Retain the database version and HBA policy too. Do not blindly restore a
historical Compose definition that downgrades PostgreSQL to 17.7, start an older
binary against the current volume or relax cross-database HBA restrictions. A
major-version or otherwise incompatible database recovery needs its own reviewed
procedure.

For data/schema recovery, use a separate empty target and the verified backup,
restore with no owners/ACLs, revoke restored sessions/tokens, then provision the
roles and run compatible migrations/grants before starting it. Verify owner/data
and the acceptance checks before any approved traffic switch. Keep the previous
installation until recovery is accepted; never overwrite its live database.

Full residual review, a supported patched browser, verified encrypted off-host
backup/recovery, production host/capacity inspection, DNS/TLS, real mail and
manual/broader-browser accessibility acceptance remain release prerequisites.
Draft CI and local disposable tests do not substitute for those live checks.
