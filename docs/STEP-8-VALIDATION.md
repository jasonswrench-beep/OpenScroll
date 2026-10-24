# Step 8 validation

Date: 2026-10-22. Media and interactive composition is implemented. See [authoring and compatibility guide](MEDIA-AND-INTERACTIONS.md).

## Delivered scope

Eleven additional block families: gallery, audio, video, attachment, link button, accordion, tabs, flashcards, process, timeline, and labeled graphic. Each has validated portable content, original defaults, editable text/settings, shared learner rendering, responsive behavior, keyboard controls, HTML packaging, and a documented static print mapping. Structured item ordering and deletion use native controls; block-level undo/redo and recovery apply to the new types and assets.

Portable schema 2 is current. Version 1 is migrated on a copy; original bytes/IDs/content/assets/narration remain intact. Reads do not rewrite stored rows. Exact legacy pending acknowledgements remain replayable without an extra revision; changed or stale payloads still conflict. Database migration 2 remains current.

## Final automated results

- `npm run licenses`: pass; no new npm dependency.
- `npm run schema:check`: v2 artifact matches structural validation; frozen v1 schema remains available.
- `npm run build`: authoring, player, generated notices, and server compile/build pass.
- `npm test`: **39 pass**. New checks cover non-destructive v1 migration, all new portable blocks, nested duplication/reference remapping, media type mismatch, unsafe links, invalid marker/caption data, WebVTT timing and inert Unicode output, nested field protections, publication transcript/caption requirements, and retained legacy pending payloads.
- `npm run test:integration`: **21 pass** against PostgreSQL. Includes read-only v1 normalization, exact pre-upgrade acknowledgement replay, explicit v2 commit, complete media/interaction persistence, private independent duplicates, byte-preserving downloads, and existing isolation/conflict/atomicity checks.
- Chromium suite: **22 pass**. Four new flows cover nested editing/order, gallery and marker settings, rejected/accepted uploads, transcript/caption authoring, unsafe link rejection, reopen/download, native audio/video playback, loaded timed caption cues, keyboard behavior, unchanged author revisions, actual independent HTML output, attachment download bytes, collapsed content flattened in print, mobile reflow, Continue review/completion/resume, and uploaded-media recovery after failure/reload.

Total: **82 automated checks pass**. New browser fixture setup seeds only its synthetic owner's courses/assets directly to avoid exhausting the application's real import rate limit; API media imports are exercised by PostgreSQL integration tests. Production rate limits remain unchanged.

Axe WCAG A/AA scans report no violations in the tested editor, interaction preview, desktop export, and 375 px export states. Existing account, outline, recovery, multi-tab, schema, archive, and core-block browser checks also pass. Responsive screenshots were inspected.

## Container and independent runtime evidence

The managed-cloud container image builds with TLS verification and the build-only CA secret. Its real HTML export route packages the media-rich v2 project, native player, runtime notices, and original asset bytes. With the authoring service stopped, Chromium loads the publication from an independent static server, plays video, loads timed captions, operates tabs and review gates, completes the course, and resumes after reload. Requests stay within that static origin. The database volume is preserved. A development smoke check also passes through Vite: healthy API proxy, media preview with loaded caption cues, 768 px tablet viewport, return to editing, and HTML download, with no JavaScript errors. The development app is left running.

Original checked-in fixtures use a synthesized tone, solid-color H.264/AAC video, and plain text. Tests do not require a codec generation service or FFmpeg at runtime.

## Limits and follow-up

Manual NVDA/VoiceOver and Firefox/Safari playback remain unverified. Tested MP4 is H.264/AAC; accepting an MP4 container does not guarantee support for every codec. Uploaded media playback is implemented; generated narration and automatic transcription/captioning are not. Transcripts/caption quality still require author review.

Continue rules record explicit review acknowledgement, not proof of comprehension, full playback, or visiting every panel. Interaction disclosure/playback state is transient; review and lesson completion resume independently. Assessment/scoring rules are Step 9.

Static print mappings cover rendered blocks, not a full-course PDF beyond unopened gates. PDF generation/tagging, SCORM, VPS deployment, real SMTP, backups, and release accessibility validation remain their later steps. No production deployment or full WCAG conformance claim is made. Existing startup commands and published environment configuration remain sufficient; no further configuration review is required for this step.
