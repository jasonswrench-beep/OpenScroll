# Development foundation

## Requirements

Node.js 24.22.2 (the pinned baseline), npm 11, Docker Engine, and Docker Compose v2. PostgreSQL 17 is supplied by Compose. No hosted credentials or email provider are needed for the foundation.

Use the existing checkout in a cloud task. Tasks are already isolated; do not create another Git worktree unless requested.

## First run

Run from the repository root:

```sh
npm ci
cp .env.example .env # only if .env does not already exist
npm run db:up
npm run db:migrate
npm run dev
```

The development browser server listens on port 5173 and proxies `/api` to the API on port 3000. Both bind to loopback. The API verifies its database connection and migration version before accepting requests. Vite reloads browser edits; restart `npm run dev` after server edits. Ctrl+C stops both application processes. `npm run db:down` stops PostgreSQL without deleting its data volume.

The example password is exclusively for the local database. Do not use this Compose configuration as an Internet-facing deployment. Preserve existing `.env` files and do not commit credentials.

## Checks

```sh
npm run licenses
npm run schema:check
npm run build
npm test
npm run test:integration
npx playwright install chromium
npm run test:browser
```

Browser tests launch the built application themselves, so build first and stop any service using port 3000. Integration tests require PostgreSQL and DATABASE_URL. They use a temporary table inside a rolled-back transaction and do not create an application schema prematurely.

If a compatible Chromium is already installed, select it for browser checks:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

This cloud environment blocks the Playwright download domain; its installed Chromium was used successfully. No network broadening is needed for that route. Linux browser library prerequisites may be installed through Playwright's documented `install --with-deps` on other machines.

## Built application

```sh
npm run build
npm run db:migrate
npm start
```

The API serves the built browser assets on port 3000. `/api/health` returns HTTP 200 only after a PostgreSQL query succeeds, otherwise 503 without internal connection details. It is a readiness check, not an authentication or security audit.

## Containerized application

```sh
docker compose -f compose.yaml -f compose.app.yaml up -d --build --wait
```

This optional override runs both application and database in containers. Stop the host application first to avoid port conflicts. Containers use the Compose database hostname rather than localhost. The application runs as a non-root user. Database data stays in the named volume. Do not use `down -v` unless intentionally deleting local data.

Managed cloud builds need the session CA for npm while keeping verification enabled:

```sh
BUILDX_CONFIG=/workspace/.cache/buildx docker build \
  --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t openscroll:foundation .
```

After that managed-cloud image build, start the tested image without rebuilding:

```sh
docker compose -f compose.yaml -f compose.app.yaml up -d --no-build --wait
```

The CA mount is build-only; it is not copied into image layers. Ordinary machines with public CA trust can build without this secret. Docker's platform-managed proxy configuration must remain intact. Production HTTPS, real credentials, email, backups, and VPS deployment are Step 13 work.

## Browser and accessibility baseline

Target the latest two stable releases of Chrome, Edge, Firefox, and Safari, including current iOS Safari and Android Chrome for responsive layouts. Step 2 automated coverage is Chromium only. Broader browser verification remains pending.

Use semantic landmarks, a skip link, visible focus, accessible status updates, real buttons, mobile reflow, and reduced-motion support. Automated axe checks and keyboard skip-navigation checks pass for the shell. These do not establish full WCAG conformance. Manual NVDA/Firefox and VoiceOver/Safari testing is required as authoring features arrive and before release.

## Implemented boundary

The shell includes author accounts, a private stored course library, and the editable-project workspace. Open a starter or `.openscroll` file, edit its title, and download/reopen it or explicitly save a new library copy. Library records and assets persist in PostgreSQL. Unsaved portable workspace edits live in tab memory. Stored courses now open in the outline editor with autosave and IndexedDB recovery. Stored lessons have a core block editor with plain-text fields, image uploads, layout settings, and session-local undo/redo. The shared learner player supports preview and standalone HTML ZIP publishing. SCORM and PDF publishing are implemented; see their guides below.

See [format specification](FORMAT-SPEC.md) for the archive contract, limits, validation rules, CLI, and migration policy. `npm run schema:check` detects structural schema drift. `examples/welcome.openscroll` is an original sample, not learner data.

## Accounts and library

Step 4 adds durable author accounts and private courses. Read [accounts and library](ACCOUNTS-AND-LIBRARY.md) for registration, email delivery, session protections, retention, and migrations. Configure APP_ORIGIN to match the browser origin: port 5173 for Vite or port 3000 when serving the built application. The Playwright runner sets the built-server origin and a separate local test mail directory. SMTP delivery to a real provider remains untested.

## Outline editing

Read [course organization and autosave](COURSE-ORGANIZATION.md) for revision checks, recovery choices, and browser storage limits. Migration 2 is required. Browser tests exercise real multi-tab conflicts and lost responses using a synthetic account; database tests verify transaction atomicity and an existing-course migration. No new external service or secret is required for Step 5.

## Block editing

Read [core block editor](BLOCK-EDITOR.md) and [Step 6 validation](STEP-6-VALIDATION.md). No new services, dependencies, migrations, or secrets are required. Step 6 kept portable schema 1; Step 8 now adds schema 2 with v1 import support. The catalog, semantic renderer, and history are in `src/shared`; the editor chrome and plain-text bindings are in `src/client`. Browser tests cover block edits, keyboard history, image/list settings, all template rendering, recovery, multi-tab conflicts, and narrow layouts. Their synthetic accounts are removed after checks. Session history is not durable recovery; do not merge those concepts or remove referenced assets during undo.

## Player and HTML publishing

Read [preview and HTML publishing](HTML-PUBLISHING.md) and [Step 7 validation](STEP-7-VALIDATION.md). `npm run build` now emits both HTML entries, a Vite manifest, and player dependency notices. Run a current build before exporting in development; the API packages those trusted artifacts from `dist/client`. No additional service, dependency, database migration, or secret is required. The container includes license notices and supports the same export route. Preview progress is memory-only; static output optionally resumes from browser local storage, independent of author recovery drafts or library revisions.

## Media and interactions

Step 8 adds the [media and interaction blocks](MEDIA-AND-INTERACTIONS.md). Step 8 introduced portable schema 2; Step 9 now writes schema 3 with v1/v2 imports. `schema/course-v1.schema.json` and the v1 starter fixture are retained, while `npm run schema:check` verifies the current v3 artifact. Database migration 2 and startup commands are unchanged. No new npm dependency, service, secret, or environment-configuration review is required. Browser media tests use checked-in original WAV/H.264/AAC fixtures, not FFmpeg at test/runtime. Their setup inserts only their own synthetic account/course fixtures directly into PostgreSQL to avoid exhausting the real import rate limit; integration tests exercise media imports through the actual API. Do not weaken production limits for test setup.

See [Step 8 validation](STEP-8-VALIDATION.md). A restored v1 pending save must retain its exact mutation ID and payload; the server supports legacy acknowledgement digests. Never rewrite pending requests during format migration or bypass revision conflicts.

## Assessments and completion

Step 9 adds [assessment authoring and learner outcomes](ASSESSMENTS-AND-COMPLETION.md). Portable schema 3 is current, with v1/v2 imports and frozen schemas/fixtures. Database migration 2 and setup/start commands remain unchanged. No local-computer move, extra service, dependency, secret, or environment-configuration review is required. The existing published startup instructions still apply; use this guide and the implementation checklist for current product scope.

Run the normal build, unit, PostgreSQL, and Chromium checks. `tests/assessments.test.ts` exercises pure grading/state, and `tests/browser/assessments.spec.ts` seeds only its synthetic author/course fixtures to preserve real API rate limits. Standalone tests serve downloaded publications from an independent static origin, block the author API, and verify partial response/attempt resume. Preview permits trusted form events, but content policy prevents form navigation. Never include learner state in the authored schema or rewrite an exact legacy pending request during migration.

## SCORM publishing

Step 10 adds SCORM 1.2 and SCORM 2004 4th Edition. See [publishing and Brightspace checklist](SCORM-PUBLISHING.md) and [validation evidence](STEP-10-VALIDATION.md). Build first so exports use the current player. `tests/scorm.test.ts` verifies the adapter and packages; `tests/browser/scorm.spec.ts` launches actual ZIP contents from an independent static server in an LMS API harness. There is no new dependency, migration, secret or configuration review. Brightspace is the selected real LMS, with tenant testing still pending access.

## PDF publishing

Step 11 adds [PDF export](PDF-PUBLISHING.md) and [validation evidence](STEP-11-VALIDATION.md). `npm ci` now retains exact `playwright-core` for runtime printing. The cloud workspace already has `/usr/bin/chromium`, Poppler and pypdf; no new cloud configuration review is needed for its existing startup commands. For another installation, install the documented browser/fonts and PDF inspection tools. The Dockerfile includes runtime Chromium/fonts and CI installs its browser before PDF unit checks. No new secret, schema or database migration is required.

`tests/pdf-export.test.ts` checks every block family, answer-key separation, inert HTML, network isolation and actual tagged PDFs. Browser cases test both authoring entry points, download/source isolation, dialog options and keyboard/error recovery. The CLI is `npx tsx tools/pdf.ts INPUT OUTPUT [--answers] [--letter]`. Inspect a sample in `artifacts/pdf-publishing`; do not describe structural tests as PDF/UA or screen-reader certification.

## Themes and reuse

Step 12 adds [themes, templates, reusable assets and snapshots](THEMES-AND-REUSE.md). Apply database migration 3 with `npm run db:migrate`; the existing startup commands are unchanged. Portable schema 3 remains current. No new dependency, service or secret is required. Browser reuse tests cover copied templates/groups, undo, asset search, themes, restoration and stale-tab protection; PostgreSQL tests cover ownership, idempotency, historical bytes, quotas and migration. See [Step 12 evidence](STEP-12-VALIDATION.md).

## Production preparation

Step 13 adds the independent `deploy/compose.yaml` stack and [self-hosting guide](SELF-HOSTING.md). Apply migration **4** to the development database before restarting the current server. No new npm package or cloud configuration review is required. `AUTHOR_ASSET_LIMIT_MIB` defaults to 1024; local development keeps proxy trust disabled. Production deliberately trusts one private reverse-proxy hop. Operator commands compile into the runtime image; deployment smoke tests create only isolated disposable projects. See [validation evidence](STEP-13-VALIDATION.md).

## Question spreadsheet import

See [author guide and validation](QUESTION-IMPORT.md). Exact `fast-xml-parser` is a new server-only MIT dependency; run `npm ci` after updating. Existing yauzl/yazl implement bounded XLSX ZIP reading/template writing. No new service, secret, schema migration or cloud configuration review is required. Unit cases use the supplied CSVs and a genuine independent XLSX fixture; browser cases seed only their own synthetic library account/course and retain all real import/assessment behaviors. No new release or deployment is implied by this feature.
