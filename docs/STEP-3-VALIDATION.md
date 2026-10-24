# Step 3 validation

Validated on 2026-10-22 in the managed Linux development environment.

## Passed checks

- Production build and strict TypeScript checks.
- 11 unit/API/archive tests, including content/asset round trips, source preservation, unsupported versions, unknown fields/types, duplicate IDs, missing references, asset hash/type/encoding errors, path traversal, symlinks, duplicate entries, encryption, CRC corruption, malformed JSON, bounded sizes/inventory, concurrency limiting, and starter fixture consistency.
- 1 real PostgreSQL integration test; existing storage readiness remains working.
- 4 Chromium browser tests: original shell checks plus sample open, title editing, real file download/reimport after reload, keyboard focus, mobile reflow, no axe violations, and preservation of an open project after a failed import. Text resembling HTML is not inserted as markup.
- Generated JSON Schema consistency, dependency license checks, and zero known production npm vulnerabilities at check time.
- CLI inspect and repack to a fresh destination; original starter preserved.

The updated Docker image built successfully with TLS verification enabled. Compose reported the application/database healthy; a real browser opened the starter through the container API and displayed the imported course. The test container was then stopped. CI configuration is updated but has not run on GitHub.

## Implemented

- Version 1 course model and generated JSON Schema, including references, narration, appearance, and core block contracts.
- `.openscroll` ZIP import/export, integrity checks, bounded streaming, and file type restrictions.
- Original starter package with a bundled PNG fixture.
- Browser workspace to open a starter or file, change its title, download it, and reopen it.
- Stateless server processing and a CLI that preserves existing output files.

## Scope limits

Only the course title is editable in this temporary workspace. There is no account saving, full outline/block editor, learner renderer, or publishing export. Download the project before closing the tab. Projects transit the server but are not retained. No old format exists to migrate; unsupported versions are rejected unchanged.

Browser accessibility checks cover the current workspace in Chromium, not complete WCAG conformance or a screen reader audit. Asset signatures and hashes are not malware certification. Hosted authentication, quotas, storage, and production security remain later steps.
