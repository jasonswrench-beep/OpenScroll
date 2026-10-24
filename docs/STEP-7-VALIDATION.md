# Step 7 validation

Date: 2026-10-22. Shared learner preview and standalone HTML ZIP publishing are implemented. See [publishing guide](HTML-PUBLISHING.md).

## Automated checks

- `npm run licenses` and `npm run schema:check` pass. No dependency or portable-schema change is required.
- `npm run build` passes for authoring/player entries and server, generates the player manifest and dependency notices, and retains the publication content security policy.
- `npm test`: 32 checks pass. New checks exercise Continue rules and review acknowledgement, hidden-content boundaries, sequential/free navigation, empty lessons/courses, progress/reset/resume validation, immutable authored data, publication dependency selection, relative paths, asset/license inclusion, fingerprints, invalid requests, missing builds, and unsafe runtime paths.
- `npm run test:integration`: 19 real PostgreSQL checks pass, retaining account, ownership, migration, conflict, atomic save, block, and asset coverage.
- Chromium suite: all 18 browser flows pass. New player flows cover actual preview widths, gates, completion, navigation focus, restart/return, source preservation, matching all-template rendering, failed exports, independently hosted downloaded output, nested relative paths, real image decoding, literal malicious-looking text, resume/reset, storage failure, and empty lessons. Existing authoring, recovery, multi-tab, library, and portable-file checks pass.
- Axe WCAG A/AA scans report no violations on tested player/template, preview, and narrow exported layouts. Screenshots were inspected. Manual assistive technology and non-Chromium testing remain pending.

The complete automated total is 69 checks (32 unit, 19 PostgreSQL, 18 browser), with no failures in the final full run.

## Runtime independence and containers

The managed-cloud Docker build succeeds with TLS verification and a build-only session CA secret. The runtime image contains the player manifest, player files, OpenScroll license/notice, and generated dependency notices.

A real HTTP request to the container produced a ZIP containing every core template and its original image bytes. After stopping the authoring container and confirming its health endpoint was unavailable, an independent static server served that ZIP's entries to Chromium. The player rendered its blocks, decoded the 480 px image, completed a lesson, and restored progress after reload. Its requests stayed within the static origin. No OpenScroll API, author account, or database was used by the learner page. Database volumes were preserved, and only synthetic test accounts/data were cleaned up.

Development preview uses Vite's own style/HMR behavior; a serve-only transform removes the publication meta policy in development. Built HTML retains the strict policy. This avoids weakening published output to accommodate development injection. A separate development smoke check passed through Vite: healthy API proxy, styled player, actual 768 px tablet viewport, return to source, and HTML download, with no JavaScript errors. The development app was left running.

## Limits

Continue review records acknowledgement, not comprehension or assessment success. Local progress is browser data, not LMS reporting. Narration scripts are preserved but no audio is generated or played. SCORM, PDF, advanced media/interactions, and assessments remain later steps. Direct file execution, real SMTP, production VPS deployment, manual screen reader review, and Firefox/Safari support have not been verified. Step 7's HTML ZIP is learner output, not an editable project archive.
