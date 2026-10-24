# Step 9 validation

Date: 2026-10-22. Assessments, scoring, required exploration, and resumable learner outcomes are implemented. See [authoring and completion guide](ASSESSMENTS-AND-COMPLETION.md).

## Delivered scope

Five formats: multiple choice, multiple response, fill in the blank, matching, and sorting. Authored rules include feedback, correct-answer keys, case sensitivity, graded/practice status, weighted points, required status, submitted/correct completion, finite/unlimited attempts, and course passing threshold. Questions participate in normal save, recovery, undo/redo, duplication, preview, and HTML publishing.

Required item exploration is available for accordion, tabs, flashcards, process, and labeled graphic. Unique visits update gates without rebuilding disclosure DOM. Completion and assessment success are independent, including complete-but-failed outcomes. Partial responses, attempts, best/last responses, and unique visits resume separately from authored data.

Portable v3 supports non-destructive v1/v2 imports and unchanged legacy save acknowledgement replay. Learner snapshot v2 can normalize older snapshot v1 progress; database migration 2 remains current.

## Final automated checks

- `npm run licenses`: pass; no new npm dependency.
- `npm run schema:check`: current v3 structural artifact matches runtime shape; v1/v2 schemas and original starter fixtures are retained.
- `npm run build`: browser entries, shared player, dependency notices, and server compile/build pass.
- `npm test`: **48 pass**, covering exact grading for every format, all-or-nothing choices/matching/sorting, fill-in normalization/case sensitivity, retries/exhaustion, weighted threshold comparisons, completion versus success, question/interaction gate enforcement, partial response and attempt restore, malformed/hidden state, v1/v2 file migration, draft publication readiness, unique visits/reset, and the existing safety/persistence logic.
- `npm run test:integration`: **23 pass** against real PostgreSQL, including v2 acknowledgement replay after v3 upgrade, private question/answer-key/rule persistence, independent duplicate IDs, rejection of invalid answer references without changing the saved revision, and existing ownership/atomicity/conflict/media checks.
- Chromium suite: **27 pass**. Five new flows exercise every authoring format/settings, feedback focus, failed/correct attempts, retry limits, reset, required-correct and exploration gates, keyboard sorting/matching/tabs/disclosures, all-item callbacks, preview source isolation, real downloaded standalone output, partial response/attempt resume, completed-but-failed state, improving a score after completion, narrow reflow, and accessibility scans.

Total: **98 automated checks pass**, with no failures in the final full run. The new browser fixtures seed only synthetic owner-scoped data and preserve production API rate limits. Existing account/library, core editor, media, archive, recovery, multi-tab, and export flows also pass.

Axe WCAG A/AA scans report no violations on tested assessment editor, preview, and narrow exported states. Responsive screenshots were inspected. This is automated evidence, not a full accessibility conformance claim.

## Preview and runtime evidence

Browser verification exposed that preview's sandbox prevented native assessment form events and confirmation dialogs. Trusted form events are now permitted, while the player's content policy still forbids actual form navigation. Preview resets only its transient state without a dialog; exported courses retain confirmation before deleting local progress. Passing preview tests verify learner actions never change server course revisions or authored documents.

The managed-cloud Docker image builds with TLS verification and the build-only session CA. Its actual export route packages the assessed v3 course and runtime/notices. With the authoring service stopped, Chromium serves that publication from an independent static server and exercises all five question formats, failure/resume/retry, a passing score, gate release, lesson completion, and reload. Runtime requests stay within the static origin, and database volumes remain intact. A Vite development smoke check also passes API readiness, assessment submission/feedback in preview, 768 px device sizing, return to source, and HTML download without JavaScript errors. The development app is left running.

## Boundaries

Manual screen reader and non-Chromium testing remain pending. Client-side answers, scores, and local storage are not secure examination data or central reporting; public publications contain answer keys. Unlimited mode has a defensive 10,000-submission bound per question. Finite attempts with a required correct answer may require a whole-course progress reset after exhaustion; the authoring panel and guide explain this.

No media-playback completion requirement, automatic grading service, AI, narration generation, SCORM/LMS reporting, PDF publishing/tagging, or production deployment is claimed. Print output supplies static question/choice representations rather than configurable answer-key publishing. Cloud development remains sufficient; no local-computer move or new setup review is required.
