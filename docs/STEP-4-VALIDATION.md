# Step 4 validation

Validated on 2026-10-22 in the managed Linux development environment.

## Implemented

Author registration/sign-in/sign-out; configurable registration and email verification; password reset and verification delivery adapters; database migrations; private course create/open/rename/duplicate/delete; literal search, sorting, and grid/list presentation; durable import and portable download; owner-protected asset retrieval.

## Checks

- 14 unit/API/archive tests passed, including new password/configuration and independent-duplication checks.
- 11 PostgreSQL integration outcomes passed (including the parent account test): password/session hashing, CSRF and Origin checks, two-author course and asset isolation, permanent deletion, independent asset copies, password reset and session revocation, single-use/expired tokens, verification, closed registration, secure host-only cookies, rate limiting, local email delivery, and the existing database round trip.
- 6 Chromium browser tests passed: registration/sign-in, persistent library CRUD/search/sort/grid/list, two browser accounts, portable project saving, reset through the local email outbox, original project round trips, mobile reflow, keyboard focus, and axe checks.
- Production build/type checking, dependency license policy, generated format schema consistency, and zero known production dependency vulnerabilities at check time.
- Database migration ran twice successfully without changing existing records.
- Updated Docker image built with TLS verification. Compose ran the migration service before declaring the application healthy. Container checks verified registration, imported course/asset storage, private email outbox delivery, session/course persistence through an application restart, and a portable download with the original asset bytes.
- The synthetic container author and its data were removed after verification; the application test container was stopped. PostgreSQL remains available for development.

The CI workflow is updated but has not run on GitHub. The database tests use an isolated schema and drop only that schema. Browser tests create unique synthetic authors and remove their own records and test emails. They do not send external email.

## Boundaries

SMTP transport is configurable with TLS verification but actual provider delivery has not been tested. No Hostinger deployment was performed. Automated Chromium/axe checks do not establish full browser or screen reader conformance. Full course organization and autosave remain Step 5; the workspace's title edits are explicitly local until downloaded or saved as a copy.
