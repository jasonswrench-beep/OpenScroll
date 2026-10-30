# Database privileges and operator credentials

OpenScroll uses three PostgreSQL login roles. The long-running web app receives
only its restricted runtime connection. Provisioning, migrations and operator
account commands run separately with the credentials appropriate to that work.
The PDF renderer receives none of these database connections or passwords.

These PostgreSQL roles are different from an OpenScroll account's `owner` or
`author` role. A verified, approved instance owner can manage access through the
web app; that account does not become a PostgreSQL administrator. Each self-hosted
installation controls its own accounts and database. There is no central owner,
global approval service or connection to another installation.

## Role and service boundaries

| Login | Connection/configuration | Allowed purpose |
| --- | --- | --- |
| Existing `openscroll` bootstrap administrator | `PROVISION_DATABASE_URL`; existing `POSTGRES_PASSWORD` retained | Dedicated provisioning service and trusted database backup/restore operations |
| `openscroll_migrator` | `ADMIN_DATABASE_URL`, derived from `MIGRATOR_DB_PASSWORD` | Schema migrations and the maintenance account/admin CLI |
| `openscroll_app` | App-only `DATABASE_URL`, derived from `RUNTIME_DB_PASSWORD` | The running web app's reviewed table and column operations |

The new login passwords are distinct, generated values. The production helper
uses 64 hexadecimal characters for each. The existing bootstrap password is not
changed by adding these credentials. Prefer the helper's URL-safe hexadecimal
values; when constructing a connection URL manually, percent-encode password
delimiters rather than pasting them raw. Do not point the runtime `DATABASE_URL` at
the bootstrap or migrator login to work around a startup error.

Before an existing installation's cutover, verify that its bootstrap login supports
SCRAM authentication. PostgreSQL 17's provided image uses SCRAM by default, but a
customized older MD5 verifier will not work through the new SCRAM-only TCP rules.
Do not rewrite that credential automatically; retain protected local-socket
recovery and review any required conversion separately.

The migrator is a login with no superuser, database-creation, role-creation,
replication or RLS-bypass authority, and no role memberships. It owns only the
reviewed application tables and their known identity sequence. It receives
`USAGE`/`CREATE` on the application `public` schema, not ownership of the database.
It can perform the application's required migrations and trusted account
maintenance without becoming the cluster administrator.

The runtime login also has no privileged role attributes or memberships. It owns
no database objects and has no schema creation, temporary-table, large-object
creation or DDL authority.
It can read `schema_migrations` to verify compatibility, but cannot change it.
Account insertion/update is column-restricted: public account requests cannot
insert an owner role or write protected operator fields. Runtime audit insertion
is allowed; changing or deleting existing audit records is not. Direct sequence
reset/access is not granted. The reviewed table/column contract is maintained in
[`database-policy.ts`](../src/server/database-policy.ts); new tables receive no
automatic runtime grant.

This is a reduction in database authority, not per-user database isolation or a
complete protection against application compromise. The runtime can still read
and change account/course data required by the app and insert audit events.
Server-side authentication, approval, ownership checks, CSRF protection, safe SQL,
resource limits and incident response remain necessary. A trusted migrator or
host operator can change the owned application schema/data and must be protected.

## Dedicated cluster and safe adoption

Use a dedicated PostgreSQL cluster for each OpenScroll instance. PostgreSQL login
roles are cluster-wide; this workflow is not intended to provision roles into a
shared cluster used by another product. The provided Compose project has its own
database container and volume. A unique app port alone does not make an external
shared database safe for this procedure.

Provisioning validates the dedicated database's application-object inventory and
the designated roles before making transactional changes. Existing reviewed
tables are transferred explicitly to the migrator; the workflow does not use
`REASSIGN OWNED`, adopt arbitrary objects, drop unexpected objects or rewrite
application rows. Unreviewed objects, unsupported schema customizations or
conflicting/unsafe designated roles cause a failure that requires investigation.
Do not delete unknown data or grant broader permissions to force it through.

The provisioning transaction is repeatable for the supported inventory. It
applies the runtime/migrator passwords from protected configuration and removes
unneeded public/default authority. It does not rotate the bootstrap password or
delete accounts, courses, assets, reusable items, snapshots or audit history.
Migrations run as the migrator and reapply the explicit runtime grants within
the migration transaction, including a fresh installation's newly created tables.
The application schema remains version **5**; privilege setup is a separate
operator step, not a new course schema or row migration.

## PostgreSQL image and connection policy

The reviewed database image is pinned to
`postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`.
The older 17.7 pin must not be reintroduced by copying a historical Compose file.
Before any approved change, inspect the actual running PostgreSQL version and
image. Do not infer live state from this repository or downgrade a newer running
server to match a pin. A major-version change needs its own reviewed data
upgrade/recovery procedure.

Production mounts [`deploy/pg_hba.conf`](../deploy/pg_hba.conf) read-only into the
database container and explicitly starts PostgreSQL with that `hba_file`. Its
ordered TCP rules permit `openscroll_app` and `openscroll_migrator` to connect
only to the `openscroll` database using SCRAM, rejecting those logins for other
database names before the bootstrap fallback. SQL role/grant checks remain
necessary; HBA does not replace them. Trusted bootstrap maintenance clients
retain SCRAM TCP access. Operator backup/restore also uses the trusted local
socket inside the database container; that socket is not mounted into the app
or renderer. The template's local trust rule is for this dedicated container,
not a host-wide PostgreSQL configuration or a socket shared with other services.

The HBA template is public policy, contains no password and must remain a regular,
readable file at mode **0644**, without group/world write permission. The
PostgreSQL container user must be able to read its bind mount. Keep the protected
deployment environment and password-input files at **0600** instead; do not make
secrets public or recursively apply one permission mode to the whole directory.
`ops.sh config`, `provision`, `start`, `upgrade` and `restore` check the HBA file
before starting/reconfiguring the database and fail closed on unsafe permissions.
This preflight checks the policy file, not live acceptance of every HBA rule;
retain actual cross-database TCP-denial checks as release evidence.

Adopting the image, HBA mount and PostgreSQL command is a planned database
restart: Compose recreates the database container when that service definition
changes. The existing `database` volume and bootstrap password are retained;
there is no new empty replacement volume or automatic data-directory deletion.
Take the verified backup first and stop the app/renderer before applying it.
Do not treat the new HBA file as an online reload or accept traffic through a
partially converted installation.

## Production configuration and cutover

The commands below are operator instructions for an approved deployment. Merely
preparing the draft does not authorize executing them against a live installation.
First identify the actual project, protected environment file and database volume.
Preserve the existing configuration and every unrelated service.

For a new installation, `deploy/ops.sh init` creates a private configuration
without replacing an existing file. For an existing protected configuration:

```sh
deploy/ops.sh db-credentials
deploy/ops.sh config
```

`db-credentials` adds missing `MIGRATOR_DB_PASSWORD` and `RUNTIME_DB_PASSWORD`
values to that protected configuration. It preserves existing values and the
existing `POSTGRES_PASSWORD`; it does not connect to PostgreSQL or change a live
role by itself. Keep the file mode 600, store it securely and never publish it or
expanded Compose configuration. Do not run `init` over an existing installation.

Before applying role changes, take a fresh consistent database backup, verify its
checksum and restore readiness, and ensure the encrypted off-host copy and
retained compatible image pair are available. Stop the app for provisioning and
migration. The normal `deploy/ops.sh upgrade` workflow checks the HBA file, takes
a backup, stops the app/renderer, reapplies the reviewed database image/HBA service configuration,
waits for database health, provisions the roles, migrates as the migrator, then
starts the app and renderer. `start` follows provisioning → migration → app for a
fresh or stopped installation. Use `upgrade` for a running installation instead of treating
`start` as an online privilege conversion.

`deploy/ops.sh provision` is the explicit privileged one-shot step for a stopped
app. It is not a running web service or a public API. `deploy/ops.sh admin ...`
runs the separate `maintenance` service (`operations` profile) with
`ADMIN_DATABASE_URL`; the app service is not temporarily given migrator access
for account commands.

Production Compose maps credentials explicitly per service. It must not pass the
entire protected environment file into the app or renderer using `env_file` or a
shared environment mapping. The app must not receive `ADMIN_DATABASE_URL`,
`PROVISION_DATABASE_URL`, `POSTGRES_PASSWORD`, `MIGRATOR_DB_PASSWORD`,
`RUNTIME_DB_PASSWORD` or the other services' secret values. The runtime password
is already carried in its one required connection URL, not a second shared
provisioning input. The renderer receives no database values at all.

After the cutover, verify runtime identity/restrictions, schema readiness, fresh
owner sign-in, existing owner courses, access-request approval/revocation, stored
course edits and a representative publication. Test denial of unauthorized API
access as well. Functional success alone is not evidence that the runtime login
lacks administrative privileges; retain the negative privilege-check evidence.

## Direct CLI and development

The provisioning CLI's default input is a strict UTF-8 JSON document on standard
input, at most 4096 bytes, with exactly `runtimePassword` and `migratorPassword`
string fields. It accepts two different generated printable-ASCII passwords of
32–256 characters. Keep such a source file private, mode 600, and supply it
through input redirection rather than command arguments or shell history:

```sh
node dist/server/src/server/provision.js < /protected/path/role-passwords.json
```

That process separately needs its protected `PROVISION_DATABASE_URL`. The
explicit `--from-env` mode reads only the named runtime/migrator password inputs
and is used by the dedicated provisioning service. For disposable local
development, the equivalent source command is:

```sh
node --env-file-if-exists=.env --import tsx src/server/provision.ts --from-env
```

`npm run db:provision` supplies that explicit mode. `npm run db:migrate` uses
`ADMIN_DATABASE_URL`; the running app uses `DATABASE_URL`. There is no fallback
from a missing admin/provision connection to the runtime connection or vice
versa. Keep test databases and generated test credentials separate from every
real installation.

Use `npm start`/`npm run dev` for direct local startup. Their trusted launcher
loads local configuration and removes privileged database URL/password and `PG*`
connection settings from the app child (and the Vite child in development). The
app rejects privileged database settings if passed directly. A raw
`node dist/server/src/server/index.js` command therefore needs an explicitly
runtime-only environment; loading a shared `.env` directly into it is not the
supported shortcut.

The launcher itself remains a trusted host process and can temporarily hold the
local configuration. Filtering its child environment does not remove credentials
from the operator's host or protect an already-compromised launcher. The local
`.env.example` is for trusted, disposable development; production uses explicit
Compose service mappings. Never copy local example credentials into a hosted
deployment. See [development setup](DEVELOPMENT.md).

## Backup, restore and rollback

Database dumps use the trusted bootstrap connection with `--no-owner --no-acl`.
Keep bootstrap authority out of the web app; do not grant broad runtime
permissions merely to make backup commands work. The dump contains private
accounts/password hashes and authored data, so a local mode-600 file is not a
substitute for verified encrypted off-host storage.

Restore only to a separate, empty target after verifying the checksum and
stopping its app. Preserve the current installation and its volumes. Restore as
the bootstrap administrator without replaying old owners/ACLs, revoke historical
sessions and account tokens, then provision the dedicated roles and run current
compatible migrations/grants before starting the target app. Use the normal
`start` procedure for that last sequence. A restored bootstrap-owned schema must
not be exposed by temporarily using the bootstrap connection in the app.

Retain the matched app and renderer images, source commit, protected
configuration, database image/version and HBA policy, and pre-change backup. If
privilege setup or migration fails, leave the app stopped and investigate. Do not silently revert its database URL
to the superuser. For data/schema rollback, restore the retained backup into an
empty isolated target with the compatible image pair and role setup, verify it,
and only then consider switching traffic. Do not roll back by pointing an older
PostgreSQL binary at the current volume, restoring the obsolete 17.7 pin, or
loosening HBA rules. An older dump is not permission to downgrade the target
server; select and verify a compatible recovery version explicitly. See
[self-hosting](SELF-HOSTING.md) and
the [deployment handoff](../DEPLOYMENT-HANDOFF.md).

Database role separation does not repair the remaining upstream Chromium/native
vulnerabilities. Browser patch availability, both final-image scans, renderer
isolation, exact-head CI, production host inspection, HTTPS, real mail and
backup/recovery acceptance remain independent release prerequisites. No live
database or deployment change is implied by this guide.
