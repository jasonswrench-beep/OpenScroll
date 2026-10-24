#!/bin/sh
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${OPENSCROLL_ENV_FILE:-"$root/deploy/.env.production"}
backup_dir=${OPENSCROLL_BACKUP_DIR:-"$root/backups"}
compose() { docker compose --env-file "$env_file" -f "$root/deploy/compose.yaml" "$@"; }
command=${1:-help}
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
 init) exec python3 "$root/deploy/configure.py" ;;
 config) compose config --quiet ;;
 start) compose up -d --no-build --wait db migrate app ;;
 upgrade)
  "$0" backup
  compose stop app
  compose run --rm --no-deps migrate
  compose up -d --no-build --wait db migrate app
  ;;
 edge) compose --profile edge up -d --no-build --wait ;;
 stop) compose --profile edge stop ;;
 status) compose --profile edge ps ;;
 logs) compose logs --tail 100 app migrate ;;
 mail-check) compose run --rm --no-deps -T app node dist/server/src/server/mail-check.js ;;
 admin) compose run --rm --no-deps -T app node dist/server/src/server/admin.js "$@" ;;
 backup)
  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"
  file="$backup_dir/openscroll-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
  trap 'rm -f "$file.partial"' EXIT HUP INT TERM
  compose exec -T db pg_dump -U openscroll -d openscroll --format=custom --no-owner --no-acl > "$file.partial"
  test -s "$file.partial"
  compose exec -T db pg_restore --list < "$file.partial" >/dev/null
  mv "$file.partial" "$file"
  (cd "$backup_dir" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
  printf 'Backup written: %s\n' "$file"
  ;;
 restore)
  [ "$#" -eq 1 ] || { echo 'Usage: ops.sh restore /absolute/path/backup.dump' >&2; exit 1; }
  file=$1
  case "$file" in /*) ;; *) echo 'Use an absolute backup path.' >&2; exit 1;; esac
  test -r "$file" && test -r "$file.sha256"
  # Only accept a sidecar containing this file's checksum, never arbitrary paths.
  expected=$(sha256sum "$file" | cut -d ' ' -f1)
  recorded=$(cut -d ' ' -f1 "$file.sha256")
  [ "$expected" = "$recorded" ] || { echo 'Backup checksum mismatch.' >&2; exit 1; }
  [ -z "$(compose ps --status running -q app)" ] || { echo 'Restore requires the target app to be stopped.' >&2; exit 1; }
  compose up -d --wait db
  count=$(compose exec -T db psql -U openscroll -d openscroll -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
  [ "$count" = 0 ] || { echo 'Restore refused: target database is not empty. Use a separate Compose project.' >&2; exit 1; }
  compose exec -T db pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U openscroll -d openscroll < "$file"
  # An old backup must not reactivate historical sessions or recovery links.
  compose exec -T db psql -v ON_ERROR_STOP=1 -U openscroll -d openscroll -c 'TRUNCATE author_sessions, account_tokens' >/dev/null
  echo 'Restored to empty target; historical sessions and recovery links revoked. Run start to migrate and check health.'
  ;;
 *) echo 'Usage: deploy/ops.sh init|config|start|edge|upgrade|stop|status|logs|mail-check|backup|restore FILE|admin COMMAND [ARGS]' >&2; exit 1 ;;
esac
