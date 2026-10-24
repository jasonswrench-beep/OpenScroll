# Step 6 validation

Date: 2026-10-22. Core block composition is implemented in the stored-course editor. See [block editor guide](BLOCK-EDITOR.md).

## Evidence

- `npm run licenses`: locked licenses match the policy; no new dependency.
- `npm run schema:check`: portable version 1 artifact remains unchanged.
- `npm run build`: browser and server TypeScript/build pass.
- `npm test`: 26 checks pass, including all template defaults/archive round trips, compatible variants, independent duplication, bounded/grouped history, rejected undo, and image inventory retention.
- `npm run test:integration`: 19 checks pass against real PostgreSQL, including authored image/text blocks, appearance, narration, and asset bytes surviving save/download, plus existing ownership, migration, conflict, and atomicity checks.
- Chromium browser coverage: all 14 checks pass across the suite and a targeted rerun of the all-template test after correcting its asset-path fixture. Existing 10 flows pass; four new flows cover insertion, inert pasted markup, in-place text, variant preservation, appearance, narration, move/duplicate/delete, keyboard history, image/list controls, download/reopen, recovery, conflicting tabs, all templates, per-lesson history, Escape/focus, and 375 px reflow.
- Axe WCAG A/AA scans report no violations on all core templates and on desktop/mobile settings and library states. Screenshots were inspected for responsive composition.
- Managed-cloud Docker image builds with TLS verification and the build-only CA secret. The container readiness check and authored block/asset restart round trip are exercised; this is local container evidence, not a VPS deployment.

An initial browser check exposed ambiguous settings-select labeling; explicit accessible names fixed it. An all-template test fixture initially used a display filename instead of the canonical asset path; the fixture now uses `assetPath`, matching the actual editor and archive contract.

## Boundaries

Text is plain text. Narration scripts and Continue rules persist but audio generation and learner gating are not part of Step 6. Block history is session-local and assets are retained for valid redo/references. Manual screen reader and non-Chromium testing remain pending. Learner preview and standalone HTML publishing are Step 7; SCORM and PDF are later steps. No VPS or real SMTP delivery was tested.
