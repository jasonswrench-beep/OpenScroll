# Accounts and private course library

Step 4 implements author accounts and durable private course storage. These accounts do not enroll learners or turn OpenScroll into an LMS.

## Local workflow

From the repository root, preserve an existing `.env`; copy `.env.example` only when starting fresh. Then run:

```sh
npm ci
npm run db:up
npm run db:migrate
npm run dev
```

Open the development app through your local tooling. Create an author account, then sign in. Passwords are 15–128 characters and may contain spaces. Registration is enabled locally and local authors do not need email verification unless configured.

Use the library to create blank courses, open them, rename, duplicate, search, sort, and switch between grid/list layouts. A course opened from the library now appears in the Step 5 outline editor. Save an imported or starter project with **Save a copy to library**. This always makes a new library record. The portable-file workspace remains separate and local until downloaded or saved as a copy. Stored library courses use the outline editor with autosave; see [course organization](COURSE-ORGANIZATION.md). Library rename/deletion include the listed revision so stale listings cannot overwrite or delete a changed course.

The present limit is 100 courses per author, so the library can show the entire result set. Search is a literal, case-insensitive title substring, including characters such as `%`. Sorting supports updated time, creation time, and title. Storage quotas and wider library pagination can evolve with production operations.

## Configuration decisions

| Setting | Local default | Production behavior |
| --- | --- | --- |
| `APP_ORIGIN` | `http://127.0.0.1:5173` | Explicit HTTPS origin required |
| `REGISTRATION_ENABLED` | `true` | Configurable; false blocks registration server-side |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Defaults true |
| `MAIL_MODE` | `outbox` | SMTP required |
| `MAIL_OUTBOX_DIR` | `.local/mail` | Development only |
| `SMTP_HOST` | Unset | Required for SMTP |
| `SMTP_PORT` | `465` | Port 465 uses implicit TLS; other ports require STARTTLS |
| `MAIL_FROM` | Local no-reply identity | Explicit sender required for SMTP |
| `SMTP_USER`, `SMTP_PASSWORD` | Unset | Configure together if the provider requires authentication |

The example Compose application explicitly opts into local HTTP on loopback with `ALLOW_INSECURE_LOCAL_HTTP=true`. This override is rejected for non-loopback hostnames. It is for local container validation, not VPS deployment. Production certificate validation stays enabled. SMTP credentials belong in secure runtime configuration, never the repository, a project file, or browser storage.

Production email verification is the recommended default. An operator may deliberately disable it for a controlled instance; doing so does not change verification flags on existing accounts. A verified author can still sign in when new registrations are disabled.

## Reset and verification emails

The local outbox writes one JSON email per file with mode 0600, in an ignored directory. These files contain private reset/verification links. Open the relevant development email locally to follow its link; do not publish or share its contents. Docker uses a private named `local_mail` volume at `/app/local-mail` owned by the application user. A local operator can read it from the application container. The app does not expose an HTTP outbox viewer.

The browser test runner uses a separate `.local/test-mail` outbox and removes messages for its own test authors. Integration tests use isolated schemas and an injected email capture. No external provider was used for validation.

Reset and verification links expire after 30 minutes. They put the token in the URL fragment, which is not sent in HTTP requests; the browser removes it from the address bar before submitting it. Raw tokens are sent only in the email and submitted action, not stored in the database or logged. Responses to reset/resend requests do not disclose account existence. Email delivery failure produces a generic operator log and invalidates that token; request another email after correcting delivery configuration.

Successful reset changes the password and invalidates all sessions and outstanding reset links for that author. It does not bypass email verification. Verification links are also single-use. There is no automatic sign-in after either action.

## Session and request protections

- Passwords use native asynchronous scrypt with random salts, N=32768, r=8, p=3, and 64-byte output. Concurrent password derivations are bounded.
- Session cookies contain random 256-bit opaque tokens. Only SHA-256 token hashes are stored. Sessions have a seven-day absolute lifetime.
- Cookies are HttpOnly and SameSite=Lax. HTTPS instances use Secure and the `__Host-` prefix with no Domain attribute.
- Sign-in rotates the browser session; sign-out revokes it in the database. Password reset revokes all author sessions. Expired sessions/tokens are cleaned at startup and hourly.
- Authenticated mutations require a session CSRF token. All account/library mutations also require a custom request header and reject an incompatible Origin. CORS is not enabled.
- Authentication and recovery routes are rate limited by client IP in process memory. Reverse-proxy identity and multi-instance rate-limit storage remain deployment work; the app does not blindly trust forwarded headers.
- Built output uses a restrictive Content Security Policy. All responses add no-sniff, no-referrer, and frame-denial headers. Vite development omits CSP so its development tooling can function.

## Ownership, duplication, and assets

Every course query includes the authenticated owner. Asset access joins through that owned course. Another author's resource ID produces the same 404 as a missing resource. Downloads are attachments with no-store caching; assets are not served inline as executable content.

PostgreSQL stores the validated document as JSONB and the course's assets as binary rows. Imports and duplication are transactional. Duplication allocates fresh internal course IDs and fresh portable content/asset IDs, remaps references, and independently copies assets. Deleting the original cannot break the copy.

Opening a portable file remains a stateless validation operation. It does not create a stored course until the author explicitly saves a copy. Imported project IDs never establish ownership.

## Deletion and retention

Course deletion requires a browser confirmation and permanently removes its active database record and asset rows. There is no trash or undo in this step. Recommend downloading an editable copy before deletion. Files previously downloaded by the author are unchanged. Operator backups, once configured, follow the operator's backup-retention policy.

Authors and their courses remain stored until explicitly removed. Self-service account deletion and administrator lifecycle tools are not implemented in this step; define the production privacy/retention policy before public launch. No automatic purge of inactive accounts is enabled.

## Migrations and operation

`npm run db:migrate` applies versioned SQL changes transactionally under a database advisory lock and is safe to rerun. It refuses a newer schema. Startup checks schema compatibility and tells the operator to migrate rather than silently applying changes. Use a dedicated application database. Back up before future upgrades; destructive downgrade scripts are not provided.

The Compose application override runs a one-shot migration service before starting the app. Existing database volumes are retained. User data and assets survive application restarts. VPS HTTPS, SMTP provider delivery, backups, administrative tools, and a production security review remain Step 13 work.

## Step 12 reusable content and snapshots

Database migration 3 stores owner-private reusable project packets and per-course immutable snapshots, including their own encoded asset bytes. Account-row locking serializes quota checks and creation across both tables; stable request IDs make exact retries idempotent. Restoration creates a safety snapshot and uses the existing revision-checked course save path. Normal course-asset pruning cannot remove historical snapshot bytes. Course deletion cascades snapshots while independent reusable items remain. See [themes and reuse](THEMES-AND-REUSE.md) for limits, deletion and backup behavior.

## Step 13 operator controls

Migration 4 adds suspension state and operator audit records. Suspended authors cannot log in or use existing sessions; enabling requires fresh login. Actual active course asset bytes are limited per author (default 1 GiB, `AUTHOR_ASSET_LIMIT_MIB`), with owner-serialized checks on imports, duplication and revisioned saves. Existing project/count and saved-content limits remain independent. Private CLI provisioning, usage reports and session revocation are documented in the [operator guide](SELF-HOSTING.md); there is no public administrator API.
