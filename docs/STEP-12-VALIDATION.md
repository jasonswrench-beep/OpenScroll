# Step 12 validation

Date: 2026-10-22 (America/New_York; checks completed 2026-10-23 UTC).

Implemented: theme controls in both authoring workspaces; three original course templates; three composed learning layouts; private saved course templates, multi-block groups and reusable assets; filename/type/name search; independent insertion with history; named asset-owning snapshots and revision-checked restoration with a safety copy. [Guide](THEMES-AND-REUSE.md) and [output matrix](BLOCK-COMPATIBILITY.md).

## Automated evidence

- `npm run build`: TypeScript/client/player/server build passes.
- `npm test`: 79 pass, including four new pure reuse/theme tests. Template/layout packets round-trip through the actual archive validator; fresh IDs, nested asset remapping, exact-byte deduplication, historical bytes, active identity and PDF theme markup are checked.
- `npm run test:integration`: 32 pass against isolated PostgreSQL schemas. New cases cover v2-to-v3 database migration preserving an existing course, private ownership, CSRF, exact-request replay, filename/type search, invalid media rejection, asset pruning independence, revision conflicts, snapshot cap, concurrent retention budgets and deletion cascades.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`: all **42 pass**, including HTML, PDF and both SCORM harnesses. Targeted Chromium reuse suite: five pass. Theme persistence and portable downloads, preview font/color accessibility, composed layouts/groups with undo/redo, searchable assets, independent original/private templates, historical restoration with newer asset retention, safety-copy download and stale-tab refusal are exercised through the UI.
- `npm run licenses` and `npm run schema:check`: pass. No new package or portable schema version.

- Production Docker image builds. Its Node 24.19.0 runtime generated a 48,137-byte themed PDF in a read-only container with networking disabled. Container startup and database migration/health smoke checks also pass.

## Reviewable output

`artifacts/step12` contains three independently editable `.openscroll` template examples and `guided-workshop-plum.pdf`. Regenerate with `npx tsx tools/step12-examples.ts` after installing the documented PDF runtime. The four-page themed PDF is tagged A4 output with no JavaScript. Its cover was rendered and visually inspected for the plum accent, serif typography, readable text and page numbering. This is not PDF/UA certification.

## Limits

Chromium automation and axe scans do not substitute for manual screen-reader or cross-browser release testing. The existing Brightspace acceptance applies to the previously tested SCORM editions; this step does not claim a new tenant test. Snapshots are authored project copies in the same database, not learner-state storage or independent disaster recovery. Production VPS deployment remains Step 13.

The first full browser/container attempt exhausted the workspace disk because disposable Docker build cache accumulated. Clearing the cache preserved database volumes and source files; interrupted checks were rerun afterward.
