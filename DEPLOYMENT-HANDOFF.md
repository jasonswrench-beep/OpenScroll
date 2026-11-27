# OpenScroll deployment record

How the project's own OpenScroll instance runs, as of 2026-11-27. General instructions for installing, backing up
and upgrading OpenScroll on any server are in [self-hosting](docs/SELF-HOSTING.md); this file records the choices
made for this instance. Private values stay out of the repository: the server's address, its settings files,
passwords, mail credentials and account listings.

This file replaces the October 2026 security-draft handoff. That text remains in the repository history, including
at tag `v0.2.0-alpha.1`.

## What runs

- **Release:** [v0.2.0-alpha.2](docs/releases/v0.2.0-alpha.2.md) (commit `b904d38`), live at
  <https://openscroll.openstageauthor.com> since 2026-11-27, 12:25 UTC.
- **Images:** the app and `renderer-chrome` images were built on the server from an exact copy of the tag. The
  v0.2.0-alpha.1 pair (commit `e64d932`) is kept for rollback.
- **Database:** PostgreSQL 17.11 as pinned in `deploy/compose.yaml`, at database migration 5. The app connects with
  the restricted runtime login, and migrations run with the separate migrator login
  ([database privileges](docs/DATABASE-PRIVILEGES.md)).
- **Settings:** the studio is on (`OPENSCROLL_STUDIO=on`), so signing in opens it. Registration is closed
  (`REGISTRATION_ENABLED=false`). The size limits are the defaults, embedded video is on (the default), and mail goes
  through the hosting provider's SMTP service.

## Server layout

- **Host:** a shared VPS running Docker and Compose. A Traefik proxy shared by every site on the host owns ports 80
  and 443 and obtains the certificates. OpenScroll doesn't use the bundled Caddy edge. Upgrades touch only
  the `openscroll-production` Compose project, never the proxy or the other sites' containers.
- **Network:** the app publishes only `127.0.0.1:3100`, for health checks on the server. Traefik reaches it over the
  `openscroll-production_application` network. The database, provisioning, migration and maintenance services stay on
  the internal `openscroll-production_database` network. The renderer has no network.
- **Release directories:** each release has its own directory under `/opt/openscroll/release-prep/`, and
  `/opt/openscroll/current` links to the one that is running. Each release directory holds:
  - `source/`: an exact copy of the tag, unpacked with LF line endings;
  - `production/`: that release's settings file (mode 600) and its Compose overlay.
- **Overlay:** it adds the Traefik route for the hostname, using the `websecure` entry point and the proxy's
  Let's Encrypt resolver, with container port 3000. It maps the Compose file's `internal` and `edge` networks to the
  two existing networks above. It also marks the database volume `openscroll-production_database` as external, so no
  release can replace it.
- **Old release directories stay.** The database container mounts `deploy/pg_hba.conf` from the release it was
  created in (v0.2.0-alpha.1). The v0.2.0-alpha.2 files name their own copy, which is identical. The next time the
  database service is brought up from newer files, Compose will recreate the container: a short cold restart, with
  the volume untouched.

## Making a release

1. Merge into `main` locally and push. Tag the release commit with an annotated tag before building anything.
2. Pack the tag with `git -c core.autocrlf=false -c core.eol=lf archive --format=tar <tag>`. A plain archive made on
   Windows converts the shell scripts to CRLF line endings, and they then fail on Linux. Compare the unpacked files
   with `git ls-tree -r <tag>`; the v0.2.0-alpha.2 pack matched all 711 files.
3. Upload it as the new release's `source/` and remove group and world write permission from it.
4. Build both images on the server with `--pull`: `--target runtime` for the app and `--target renderer-chrome`
   (with `--build-arg ACCEPT_GOOGLE_CHROME_TERMS=true`) for the renderer. Tag them with the version and commit, for
   example `openscroll:app-v0.2.0-alpha.2-b904d382`.
5. Switch to the new images (below), check the site, then push the tag and publish the release notes from
   `docs/releases/` as a GitHub pre-release.

A tag that has been pushed never moves. If a build has to change after that, it gets a new version and a new tag.

## Switching images only

Use this when a release changes only the app and renderer: the same database definition, no new migration and no
new settings. v0.2.0-alpha.2 was this kind of release.

1. Copy the running release's settings file and overlay into the new release's `production/` directory, changing
   only `OPENSCROLL_IMAGE` and `OPENSCROLL_RENDERER_IMAGE` to the new image IDs.
2. Validate the copy with `OPENSCROLL_ENV_FILE=<new settings> python3 source/deploy/configure.py --check-hba` and
   `docker compose ... config --quiet`.
3. Check that the database service is unchanged. Compare `docker compose ... config --format json db` for the old
   and new release, looking only at `services.db` with the release directory path normalized. Top-level fields such
   as `x-image` always change. If the database definition differs, do a full upgrade instead.
4. Recreate only the renderer and the app. The database keeps running:

   ```bash
   docker compose -p openscroll-production \
     --env-file production/.env.<version> \
     -f source/deploy/compose.yaml \
     -f production/overlay-<version>.yaml \
     up -d --no-build --no-deps --wait renderer app
   ```

   The site is offline for about 15 seconds (12 seconds for v0.2.0-alpha.2).
5. Check `/api/health` on the server and at the public address, and check the renderer log for "PDF renderer ready".
   Check that the other sites on the host still answer.
6. Point `/opt/openscroll/current` at the new release, and point the backup service's `OPENSCROLL_ENV_FILE` at the
   new settings file.

## Full upgrade

A release that changes the database definition, the database roles or the migrations follows the backup-first
`deploy/ops.sh upgrade` workflow in [self-hosting](docs/SELF-HOSTING.md#upgrades-and-rollback). It takes a fresh
backup, stops the app and renderer, brings the database up under the new definition (a short cold restart),
provisions the roles, migrates, and starts the new pair. The move from the October 2026 installation to
v0.2.0-alpha.1 was done this way, with 20 seconds offline. Before that switch, a copy of the live data was upgraded
in a separate Compose project. All of its courses opened, sign-in, SCORM 2004 and 1.2 export and PDF publishing
worked, and the rollback was tested; the copy was then removed.

## Rollback

Each release directory keeps its own settings, overlay and image IDs, so going back means recreating the renderer
and app from the previous release's directory with the same command as above, then pointing `current` and the backup
service back at it. v0.2.0-alpha.1 and v0.2.0-alpha.2 use the same database, so either can run against it.

After a release that migrates the database, an older image can't be pointed at the migrated data. Restore the
pre-upgrade backup into a separate Compose project instead, as described in
[self-hosting](docs/SELF-HOSTING.md#upgrades-and-rollback).

## Backups

- **Daily dumps:** a systemd timer (`openscroll-backup.timer`) runs `deploy/ops.sh backup` from the current release
  every day at about 08:30 UTC, with up to 15 minutes' random delay. Each run writes a checked dump and its SHA-256
  file to `/opt/openscroll/backups`, and the last 14 days of daily dumps are kept. The first unattended run, on
  2026-11-27, succeeded.
- **Pre-upgrade dumps:** the dumps taken by hand before each switch are kept indefinitely, with a copy off the server.
- **Not done yet:** the backups are not encrypted, and there is no automatic copy off the server. Until there is,
  losing the server would lose every backup newer than the last manual copy.

## Open items

- **Large uploads through the proxy:** Traefik sets no request size limit by default, but its default read timeout
  of 60 seconds is shorter than the 8 minutes that [self-hosting](docs/SELF-HOSTING.md#https-on-a-shared-vps) asks
  for. A full-size course saved over a slow connection may be cut off. Raising it is a change to the shared proxy,
  so it waits for the owner's decision.
- **Encrypted off-host backups:** the destination is still to be chosen.
- **Checks that follow the alpha:** a scored quiz and a SCORM 1.2 package in Brightspace, the screen reader session
  and the usability session ([release checklist](docs/RELEASE-0.2-CHECKLIST.md)).
