# OpenScroll implementation checklist

Status: Steps 1–9 complete. Steps 10–14 are planned and unimplemented. Checkboxes record evidence, not intent.

## 1. Specification and build checklist

- [x] Record confirmed authoring/export/account/hosting scope.
- [x] Document reference sources, recommendations, and unresolved decisions.
- [x] Define screens, content hierarchy, accessibility criteria, and output expectations.
- [x] Save architecture baseline and ordered implementation gates.

Evidence: PRODUCT-SPEC.md and ARCHITECTURE.md. Documentation only; no application readiness claim.

## 2. Application foundation

- [x] Choose and pin framework/tool versions; review licenses.
- [x] Create TypeScript web/server foundation and PostgreSQL integration.
- [x] Add development startup, automated checks, and initial UI shell.
- [x] Define supported browsers and baseline accessibility checks.
- [x] Add repeatable container/development configuration.

Gate: documented startup works and the application connects to its database.

Evidence: [development instructions](DEVELOPMENT.md), [dependency review](DEPENDENCIES.md), and [Step 2 validation](STEP-2-VALIDATION.md). Browser support is a target; only Chromium has been exercised so far.

## 3. Portable course files

- [x] Define schema, package structure, extension, validation, and migrations.
- [x] Implement asset references and sample course.
- [x] Implement editable project download/import with archive protections.
- [x] Test round trips and unsupported/corrupt input without data loss.

Gate: a sample course saves, downloads, imports, and reopens with assets intact.

Evidence: [format specification](FORMAT-SPEC.md), [Step 3 validation](STEP-3-VALIDATION.md), shared schema, archive implementation, starter package, and browser workspace. Version 1 is the initial format; no fabricated legacy migration is claimed. Title editing is a temporary round-trip exercise, not the Step 5 outline editor.

## 4. Accounts and course library

- [x] Decide registration, email, verification, and retention defaults.
- [x] Implement account sessions, reset flow, and configurable registration.
- [x] Implement library CRUD, duplication, search, sorting, and views.
- [x] Test course and asset isolation between two accounts.

Gate: authors manage private courses without cross-account access.

Evidence: [accounts and library](ACCOUNTS-AND-LIBRARY.md), [Step 4 validation](STEP-4-VALIDATION.md), transactional migrations, isolated PostgreSQL tests, and browser flows. External SMTP delivery and production operations remain explicitly unverified.

## 5. Course organization

- [x] Edit metadata, cover, sections, and lessons.
- [x] Implement ordering, duplication, deletion, and lesson navigation.
- [x] Add autosave states, failure recovery, and multi-tab conflict handling.

Gate: a complete outline persists correctly across reopen and recoverable save failures.

Evidence: [course organization](COURSE-ORGANIZATION.md), [Step 5 validation](STEP-5-VALIDATION.md), migration 2, save-controller tests, PostgreSQL conflict/atomicity checks, and multi-tab browser tests. Step 6 subsequently adds core block composition.

## 6. Core block editor

- [x] Implement scrolling canvas, visual library, shortcuts, insertion points.
- [x] Add core composition blocks listed in the product specification.
- [x] Add in-place editing and structured settings panels.
- [x] Implement move, duplicate, delete, appearance, and compatible variant changes.
- [x] Add original starter content and undo/redo.
- [x] Verify keyboard controls, focus behavior, and screen reader labeling through automated accessibility-tree checks (manual AT testing remains pending).

Gate: an author builds a polished lesson with all core operations accessible.

Evidence: [core block editor](BLOCK-EDITOR.md), [Step 6 validation](STEP-6-VALIDATION.md), shared catalog/renderer, bounded lesson history, PostgreSQL persistence and Chromium authoring/recovery checks.

## 7. Player and HTML export

- [x] Implement shared rendering and isolated preview state.
- [x] Add device previews, navigation, progress, and Continue behavior.
- [x] Bundle player and assets into a standalone HTML ZIP.
- [x] Serve and test the export independently of the authoring server.

Gate: preview and independently hosted output agree and require no OpenScroll service.

Evidence: [preview and HTML publishing](HTML-PUBLISHING.md), [Step 7 validation](STEP-7-VALIDATION.md), shared player/state engine, validated bundle packaging, and independent static-host browser checks. Local progress is not LMS reporting.

## 8. Media and interactions

- [x] Add galleries, audio/transcripts, video/captions, attachments, and buttons.
- [x] Add accordion, tabs, flashcards, process, timeline, and labeled graphics.
- [x] Define accessible keyboard behavior and export/print mapping for each.

Gate: a media-rich course works in preview and HTML output.

Evidence: [media and interactions](MEDIA-AND-INTERACTIONS.md), [Step 8 validation](STEP-8-VALIDATION.md), portable v1-to-v2 migration, shared media/interaction rendering, independent HTML playback/captions/download/print checks, and owned media persistence/recovery. Manual assistive technology and broader codec/browser coverage remain pending.

## 9. Assessment and completion

- [x] Add multiple choice/response, fill in the blank, matching, and sorting.
- [x] Add feedback, retries, scoring, and required interaction gates.
- [x] Separate completion from success and define persistable learner state.
- [x] Test passing, failing, retrying, gating, and state restoration.

Gate: representative assessment behavior is consistent and meaningfully tested.

Evidence: [assessments and completion](ASSESSMENTS-AND-COMPLETION.md), [Step 9 validation](STEP-9-VALIDATION.md), pure grading/state checks, authored question persistence and legacy acknowledgement replay, and browser preview/independent HTML cases covering pass/fail/retry/restore and required exploration. Client-side outcomes are not secure examination or LMS reporting.

## 10. SCORM publishing

- [x] Implement SCORM 1.2 launch, manifest, score/status, time, bookmark, resume, and termination.
- [x] Address status and suspend-data limits without silent state loss.
- [x] Implement SCORM 2004 4th Edition.
- [x] Test the local LMS harness and record actual results.
- [x] User acceptance of both labeled Revision 4 editions in Brightspace: both reported working as anticipated.
- [ ] Record detailed Brightspace gradebook, exit/relaunch resume and retake results, plus release/engine settings.

Implementation, local harness checks, and user acceptance of both Revision 4 editions in Brightspace pass. Detailed gradebook/resume/retake evidence and tenant release/engine settings remain unrecorded. See [SCORM guide](SCORM-PUBLISHING.md) and [Step 10 evidence](STEP-10-VALIDATION.md). No certification or Brightspace compatibility claim is made from harness results.

## 11. PDF publishing

- [x] Select an engine after testing tagging/reading-order capability.
- [x] Implement cover, linked contents, headings, page numbers, and print layout.
- [x] Map every block to meaningful static content; add answer inclusion option.
- [x] Verify representative output visually and with PDF structural/logical-text inspection.

Gate: complete, legible tagged output with documented evidence and limits. Chromium capability/output checks verify tags, language, heading structure, image alt text, bookmarks and reading content. Screen-reader and desktop PDF/UA checker results and PDF/UA certification are not claimed. See [PDF guide](PDF-PUBLISHING.md) and [Step 11 validation](STEP-11-VALIDATION.md).

## 12. Themes and reusable content

- [x] Add theme settings, original course templates, and saved block groups.
- [x] Add searchable reusable assets and richer composed layouts.
- [x] Add snapshots/restoration with safe asset retention.
- [x] Maintain a block compatibility matrix for all output formats.

Gate: authors reuse consistent content and restore an earlier version safely.

Evidence: [themes and reuse](THEMES-AND-REUSE.md), [block compatibility matrix](BLOCK-COMPATIBILITY.md), and [Step 12 validation](STEP-12-VALIDATION.md). Portable schema 3 is unchanged; database migration 3 adds private immutable reusable packets and asset-owning snapshots.

## 13. Production and self-hosting preparation

- [ ] Inspect VPS resources and workloads once access is available.
- [x] Prepare production containers, migrations, HTTPS, email, quotas, and administrator controls (activation on the VPS remains pending).
- [x] Prepare health checks, useful logs, backup/restore/upgrade commands and scheduler examples.
- [x] Test backup restoration and restart persistence in isolated production projects.
- [x] Document and test a fresh independent installation.
- [ ] Deploy only with appropriate access and authorization.

Gate: tested deployment and recovery; no dependence on live development processes. Local production preparation is implemented; live VPS inspection, DNS/TLS, real email and off-host backup acceptance remain pending. See [self-hosting guide](SELF-HOSTING.md) and [Step 13 evidence](STEP-13-VALIDATION.md).

## 14. Pilot and release

- [ ] Exercise text-heavy, media-rich, assessed, and long courses.
- [ ] Review save recovery, portability, isolation, upload security, and browser support.
- [ ] Complete manual keyboard/screen reader and output checks.
- [ ] Resolve release-blocking issues; document remaining limitations.
- [ ] Deliver author guide, installation guide, sample courses, and release package.

Gate: documented release evidence for authoring, all promised outputs, and self-hosting.

## Later backlog

AI assistance/text import, question banks, stakeholder review/comments, co-authoring, localization, suite integration, and sandboxed custom code. No implementation commitment until each has defined scope and acceptance checks.

## Progress recording

For each completed step record implementation links, commands/checks run, outcomes, known defects, and external blockers. Do not mark real LMS, screen reader, PDF accessibility, or deployment checks complete based solely on mocks or automated scans. Ask for missing decisions or access at the point they block useful work; continue independent tasks when possible.
