# OpenScroll alpha.3 deployment handoff

Release identity: proposed private prerelease **v0.1.0-alpha.3**. The published release notes and annotated Git tag identify the exact source commit and its successful CI run; verify both before deploying. This handoff accompanies the spreadsheet-assessment importer. It is not evidence that a live VPS deployment has occurred.

## Change and validation

The lesson toolbar now offers **Import questions**, downloadable CSV/Excel templates, validated previews, and one-step batch insertion/undo. Original OpenStage CSV files remain supported. The supplied 20-question CSV and an independent `.xlsx` copy are checked for every prompt, choice, answer key and feedback. The nine-question template, including true/false, is also checked.

Board Category/Value are displayed during preview but do not become assessment content or scores. Default points are 1, author-adjustable; optional Points supplies a per-row integer from 1 to 100. No database or portable schema migration is introduced: database migration 4 and portable schema 3 remain current.

Local validation: 91 unit, 38 PostgreSQL integration and 46 Chromium browser tests pass (175 total). The production image imports the 20-question Excel file and generates the six-question template with networking disabled and a read-only root. Hosted CI must pass for the exact release commit before publication/deployment. See `docs/QUESTION-IMPORT.md` and `docs/QUESTION-IMPORT-VALIDATION.md`.

## Existing VPS and coordination

Jason's VPS also hosts the book-publishing site and other services. The Hostinger conversation owns inspection of the actual account/VPS and must provide current-state evidence and the required resource/account-specific confirmation before any VPS mutation. This cloud workspace has no verified VPS address, live service/project identity or remote deployment credentials. Its GitHub deployment-record query was refused by the integration; no conclusion about live VPS state can be drawn from that denial. Do not install connectors or change permissions as a workaround.

Read the live containers/projects, current OpenScroll image, Compose/project name, protected configuration location, database volume, port/proxy route, health and host capacity first. Preserve the book-publishing site and every unrelated service. Do not guess a subdomain or take over ports 80/443. If OpenScroll is already installed, update that verified installation; do not create a parallel instance by assumption.

## Safe upgrade procedure for the deployment owner

1. Record the current OpenScroll image tag/digest, project/configuration and health. Check the book-publishing site and other identified existing service health before the change. Do not print secrets.
2. Take a consistent OpenScroll database backup, verify its checksum/restore readiness and retain the previous image/configuration for rollback. Use the existing installation's protected environment/project identity. Do not touch the book-publishing site volumes or databases, and never use `down --volumes` on the live installation.
3. Download the source/deployment archive and matching checksum using the immutable links in the release notes, or fetch the exact annotated tag. Verify the checksum and that the tag points to the green source commit. Build a uniquely named image, e.g. `openscroll:v0.1.0-alpha.3`, including the locked new server XML dependency. Preserve normal proxy/CA trust and TLS verification if that host needs a proxy.
4. Update only the verified OpenScroll image setting, retaining its credentials, ports, registration policy, origin, quotas, SMTP and volume names. Use the documented backup-first `deploy/ops.sh upgrade` workflow when it matches the inspected installation. Do not run `init` over an existing configuration. This feature has no new secrets, ports or services.
5. Verify the deployed importer below before accepting the change. On failed health/import checks, restore the previous compatible image/configuration; database schema is unchanged. If data recovery is necessary, use the separate empty-target restore workflow in `docs/SELF-HOSTING.md`, not an overwrite of the live database.
6. Recheck the book-publishing site and the other identified service endpoints. Record the actual deployed image, exact commit, backup location/checksum, checks and rollback outcome privately. Claim deployment only after that evidence exists.

## Deployed acceptance checks

Use a controlled test account/course rather than existing authored content. The repository includes `tests/fixtures/question-import/ai-basics-20.csv`, its genuine `.xlsx` copy and `openstage-template.csv`.

- Confirm the actual route serves the new toolbar and `/api/health` is ready.
- Download both in-app templates; the Excel response must be a valid XLSX file and both templates must preview six examples.
- Upload the 20-question CSV and independently generated XLSX in separate test lessons. Preview must identify all 20 without changing the course. Add the batch, save and reload; verify every question/choice/key/feedback against the supplied rows and assessment points (1 by default, never the board Value).
- Preview a question, choose Alan Turing for the first AI item, submit, and confirm its supplied correct feedback. Verify Undo/Redo of an imported batch and portable download/reopen.
- Try an invalid answer key/type and cancel a preview. Neither may change the saved lesson. Remove only the controlled test data afterward according to the existing operator workflow.
- Recheck representative publication/export and unchanged host services. Record actual results; local tests do not substitute for these deployed checks.

The release is for source evaluation and deployment preparation. Existing public DNS/TLS, real mail, encrypted off-host backup, broader-browser/manual accessibility and production acceptance requirements still apply. Read `docs/SELF-HOSTING.md` for operational details.
