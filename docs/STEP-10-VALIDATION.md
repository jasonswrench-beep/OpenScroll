# Step 10 validation

Date: 2026-10-22. SCORM publishing implementation and local validation are complete. **The real LMS gate remains open for Brightspace**, selected by the user. The agent has no direct Brightspace access. Subsequent user testing reported SCORM 1.2 working and supplied a SCORM 2004 launch-read failure screenshot; see the follow-up below. Tenant release and engine settings remain unknown.

## Delivered

Both authoring workspaces export SCORM 1.2 and SCORM 2004 **4th Edition** ZIPs through bounded transient project routes. Each includes the actual shared player, relative assets, notices, publication fingerprint and root single-SCO manifest. Publication validation rejects incomplete questions and media accessibility omissions, just as HTML does. Portable schema 3 and database migration 2 remain unchanged.

The adapter handles API discovery, initialization, checked Get/Set/Commit, aggregate score/status, bookmark, session time, suspend/normal exit, review/browse read-only mode, and termination. Checkpoints preserve Unicode drafts, submitted attempts, best responses, visits and lesson flow. Edition limits are enforced before writes; invalid or incompatible checkpoints are never silently replaced. Errors stay visible with save retry and recovery JSON download. Explicit exit keeps the session open on a failed save. SCORM does not use browser local storage or write learner activity to the authoring database.

## Automated evidence

- Build/typecheck, dependency license policy and portable schema check: pass. No npm dependency added.
- Unit/package suite: **66 pass**, including 18 new SCORM checks for both editions: checkpoint round trips, Unicode/drafts/retries, malformed/fingerprint rejection, score/status mapping, pass before completion, completed-but-failed and ungraded outcomes, session timing, idempotent successful termination, failed commit/retry, review without writes, oversize rejection without partial writes, API discovery cycles/opener traversal and actual ZIP inventory.
- Real PostgreSQL integration suite: **23 pass**; all existing account isolation, save concurrency, legacy acknowledgement, course/assessment/media persistence checks remain green.
- Chromium suite: **31 pass**, including four new SCORM cases. Actual generated ZIP contents are served from an independent static HTTP origin and launched in a parent LMS API harness. Both editions initialize, restore failed attempts and partial answer drafts after termination/relaunch, retain interaction on a failed commit/exit, retry a successful save, avoid local storage, and terminate read-only review without altering CMI data. Missing API blocks untracked interaction with an actionable message. The real export endpoints accept validated projects and reject malformed ones.

Total: **120 automated checks pass**. The harness is an original local test double; it is not a complete SCORM conformance test or Brightspace emulator. Existing HTML, preview, authoring, media and accessibility checks also run in the regression suite.

## Manifest and packaging evidence

Both sample ZIP manifests parsed successfully with lxml, with all listed resources present. SCORM 2004 also validated against the official ADL SampleRTE content-packaging, ADL extension and IMS sequencing XSDs, resolved locally without network XML loading. The reference source was `https://github.com/adlnet/SCORM-2004-4ed-SampleRTE`, consulted under `/tmp`; none of its runtime code, schema files or restricted-license sample content was copied into OpenScroll or exported packages. SCORM 1.2 received XML/reference checks, not official XSD or conformance-suite validation. There is no SCORM certification claim.

The managed-cloud production Docker image builds successfully using the session's build-only CA and normal TLS verification. Chromium opened its real portable workspace and downloaded both editions through the production container API. Both downloaded manifests parsed and included their runtime/course/assets; the export workspace fits a 375 px viewport. The container app was stopped afterward, leaving PostgreSQL volumes intact. The development app is running on port 5173 with its API on port 3000; `/api/health` reports ready/database connected.

## Pending external validation

Brightspace: **partially tested by the user**. SCORM 1.2 was reported working (interaction felt cumbersome); detailed score/resume/retake evidence is not yet available. The initial SCORM 2004 package failed before course rendering with “The LMS checkpoint could not be read.” Follow [the Brightspace checklist](SCORM-PUBLISHING.md) and record exact tenant release, SCORM engine, import/grade settings, launch method, browser, pass/fail/resume/retake results and limitations before declaring support. A course shell is needed for this gate. Other LMSs, manual screen readers and non-Chromium browsers are untested.

SCORM 1.2 combines completion and success into one status; 2004 reports them independently. Limited suspend capacity can prevent saving large state; the learner is warned and can download recovery JSON, but automatic recovery-file import is not available. Unload saves and close warnings are best effort. SetValue/Commit are not atomic, and client-side answers/reporting are not secure assessment results. LMS attempt policy controls retakes and retained grades. See the publishing guide for these operational limits.

PDF publishing and production VPS deployment remain later steps. No local-computer move or setup-configuration review was required.


## Brightspace launch follow-up

The user's screenshot confirms JavaScript and the LMS API initialized far enough to reach a CMI read error. It does not identify the failing field or numeric LMS error. A regression test reproduced the failure with SCORM 2004's valid error 403 (Data Model Element Value Not Initialized) on an empty `cmi.suspend_data`. The adapter now treats that specific response as no checkpoint. It still rejects unsupported fields, other read errors, and nonempty data accompanied by an error. Failed initialization now names the CMI field/error code, stops the misleading loading message, and disables controls requiring a session. Cleanup failures do not mask the original error. Callable API adapters are also discoverable.

Follow-up verification: build passes; **69 unit/package checks** and **4 targeted SCORM browser checks** pass. The 2004 browser harness now returns 403 on first-launch suspend reads. Full database and unrelated browser suites were not repeated after this focused fix; the earlier 120-check baseline above is historical. Revision 3 test packages are under `artifacts/brightspace-test-r3`; original packages are preserved. Their ZIP integrity and manifest references validate. The revised two-lesson fixture passes both lessons at 100%, fits a 673-character SCORM 1.2 checkpoint, and removes the introduction's extra review acknowledgement. Brightspace retesting of revision 3 is pending; error 403 is a reproduced compatibility defect, not yet a confirmed tenant error code.


## Learner usability follow-up from two Brightspace recordings

The user supplied two recordings (132 seconds for SCORM 2004; 46 seconds for SCORM 1.2). The revised 2004 course now renders, tabs and lesson navigation work, and questions accept responses/produce feedback. The recordings expose duplicate matching selections being rejected with generic wording, redundant terminal Continue/completion/next actions, and unclear completion blockers. They do not establish LMS gradebook reporting, exit/relaunch resume, or a completed pass/fail run; those gates remain pending.

The shared player now combines terminal Continue/completion/next, offers optional bulk question submission, identifies unmet requirements with focus links, swaps occupied matching assignments with live feedback, removes inert per-question Submit buttons after submission, and clarifies exhausted-attempt completion rules. This changes preview, HTML and both SCORM editions consistently. Interior gates, exact scoring, retry limits, required-correct rules, and the portable/suspend schemas remain intact.

Revision 4 exports are under `artifacts/brightspace-test-r4`. The supplied test instructions describe the shorter path. Earlier test exports remain available for comparison; a fresh Brightspace test activity avoids mixing publication fingerprints.

Final usability verification: build/typecheck passes; **70 unit/package checks and all 34 Chromium checks pass** after the changes. The new browser cases exercise swap feedback, validation before bulk grading (including a gated optional question), removal of inactive Submit controls, single-action lesson advance, exact LMS pass/completion reporting, and completed-course relaunch/resume in both edition harnesses. Existing accessibility scans remain green. The previous 23-check database baseline was not repeated for this player-only change.

The actual generated revision 4 SCORM 2004 ZIP also passes an independent embedded-browser smoke check in a 650 px frame with first-launch 403 behavior: two lessons, matching swap, bulk submission, 100% score, passed/completed CMI values and canonical package assets. This is harness evidence, not a claim that revision 4 has already been retested in Brightspace.

The final export also compacts the header when the embedded viewport is at most 800 px tall and wraps LMS controls, so the course overview consumes less of a typical Brightspace frame. The regenerated revision 4 packages use that final build.

## Version identification follow-up

A subsequent 18-second user recording still displays the earlier generic matching-validation message, an inactive Submit button after feedback, and the separate terminal Continue control. Those controls differ from revision 4. The recording alone cannot establish whether an earlier activity, download, or cached package was opened. Earlier exports reused filenames, making this difficult to distinguish.

The test-course generator now accepts an optional revision argument: `npx tsx tools/brightspace-test-course.ts artifacts/brightspace-r4-labeled r4`. These packages have `r4` in their filenames and **Revision 4** in their course/manifest title, plus instructions to import a new activity and verify that title. Their ZIP integrity, resource references, revision title, updated runtime controls, and TypeScript check pass. Runtime behavior is unchanged from the revision 4 build validated above. The newly labeled package still needs Brightspace confirmation.


## User confirmation of labeled Revision 4 packages

After importing the clearly labeled Revision 4 activities, the user reported: “both worked as anticipated this time.” Record this as successful user acceptance of both SCORM 1.2 and SCORM 2004 4th Edition in the tested Brightspace environment, including the revised player interactions. The earlier reports concerned activities without the Revision 4 course title.

The agent did not access the tenant. The user did not separately supply gradebook values, a detailed exit/relaunch resume trace, retake policy results, or exact Brightspace release/engine settings. Those remain unverified particulars, rather than blockers to accepting the reported interaction fix. This result is specific to the user-tested packages and environment, not SCORM certification or universal LMS support.
