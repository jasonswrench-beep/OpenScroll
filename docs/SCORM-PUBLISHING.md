# SCORM publishing

Export SCORM 1.2 ZIP or SCORM 2004 ZIP from either the library editor or portable workspace. The latter is **SCORM 2004 4th Edition**. Keep the editable `.openscroll` project separately. Build before exporting from development. Import the entire ZIP into the LMS as SCORM content; do not unzip and upload individual files. One package contains one SCO, with internal lesson navigation.

The trusted built player, canonical course/assets, license notices, root `imsmanifest.xml`, and publication metadata are self-contained. The same readiness and archive limits as HTML apply. The export endpoints are `/api/projects/scorm-12` and `/api/projects/scorm-2004`. Publishing does not save or alter the author's course. No new dependencies, database migration, service, or setup configuration is required.

## Tracking

The adapter discovers the selected edition's API in the launch window, ancestors or opener, with bounded traversal and cross-origin exceptions. Missing API, initialization or resume-read failures show an error; they never launch an untracked course. Preview remains isolated. SCORM learner state never enters author records or browser local storage.

Writes include aggregate percentage score (min 0/max 100, plus scaled score in 2004), completion/success, lesson bookmark, suspend data, elapsed session time, and exit intention. There is no per-question `cmi.interactions` report. No learner identity is needed. Outcomes use the same grading engine as preview and HTML. Score precision is seven decimal places; passing uses the authored threshold and exact earned/possible comparison.

SCORM 2004 reports completion and success separately, and progress as a fraction of lessons completed. Single-SCO delivery controls make completion/objective status content-owned. Success remains unknown until all graded questions have a submitted answer. Ungraded courses do not invent a passing score.

SCORM 1.2 has a single lesson status. It stays incomplete until all lessons are completed. It then reports passed/failed when all graded questions have been answered, otherwise completed. This cannot express completion and success independently. A passing quiz before lesson completion still reports incomplete. No manifest mastery score is supplied to trigger implicit LMS overrides.

Session time is elapsed wall time in this launch, including idle/background time, rather than active learning time. Every save reports the cumulative session duration, never writes total time, and uses the edition's time syntax. Normal exit is used only after completion with a pass or no graded questions; otherwise exit is suspend to allow continuation. LMS attempt/retake policy ultimately controls subsequent launches. Reset progress resets SCO state within the current attempt; it does not create a new LMS attempt or necessarily erase an LMS's retained grade.

## Save and resume

Changes save after a short debounce, every 30 seconds, on hidden visibility, and on page exit. Use **Save LMS progress** before **Exit course**. An explicit exit terminates only after a successful save; success disables the player. The LMS controls closing or returning to its course interface. Browser back/forward cache restoration reloads to establish a fresh session.

Checkpoints bind to the full publication fingerprint and retain drafts, attempts, best/last answers, interaction visits, gates, lesson completion and bookmark. They use indexed IDs in an ASCII/base64 envelope, then restore through authored rules. A changed publication, malformed or impossible checkpoint produces an error and preserves the LMS data. Start a new LMS attempt after republishing changed content. Review/browse launches read existing state but make no SetValue/Commit calls.

The adapter enforces **4096 ASCII characters for SCORM 1.2** and **64000 for SCORM 2004 4th Edition** before any save writes. It never truncates answers or drops state to fit. Large courses or long responses can exceed either capacity. Prefer 2004 for larger courses. A capacity/connection/commit error is visible, keeps the latest progress in memory, and can be retried with Save LMS progress. Download recovery progress preserves a JSON copy for support; automatic recovery-file import is not implemented. Keep the page open until the save succeeds. Closing/reloading after an unsaved failure can lose newer work. Browser close warnings and unload saves are best effort, especially on mobile. LMS SetValue operations are not transactional: a failed commit may leave partial LMS values; retry sends the full current checkpoint/report again.

All grading runs client-side and published answer keys are available in course data. This is not secure examination or tamper-proof reporting.

## Brightspace validation checklist

Brightspace was selected by the user. The user reports SCORM 1.2 working and an initial SCORM 2004 launch-read failure. After the suspend-data fix and interaction improvements, the user confirmed that both labeled Revision 4 packages worked as anticipated in Brightspace. Detailed gradebook/resume/retake results remain unrecorded. The agent has no direct tenant access; release/version and detailed grading/resume results are still needed. Record the Brightspace release, browser/version, legacy/new SCORM engine if selectable, launch frame/window settings, import options and gradebook mapping. Local harness results do not establish Brightspace support or SCORM certification.

1. Import each edition as a separate test activity. Confirm manifest acceptance, all assets, and title/description. Capture import warnings.
2. Launch with free and sequential courses, Continue gates, required exploration, media and all five assessment formats. Verify keyboard use and narrow layout.
3. Leave a partial draft and failed attempt; save and exit. Relaunch as the same learner/current attempt. Verify exact answer draft, attempt count, visits, gates, lesson position and score. Repeat with a popup launch if offered.
4. Finish one graded course below threshold and one above it. Check LMS completion, success and gradebook percentage independently, including passing before lesson completion and completed-but-failed outcomes. Verify an ungraded course completes without a fabricated quiz score.
5. Retry wrong answers within authored limits. Verify LMS retake/new-attempt versus continue policies, grade retention, and review/browse behavior. Record differences rather than assuming the platform resets grades.
6. Test SCORM 1.2 near/over 4096 characters and 2004 larger checkpoints, connection failure/retry, course update with incompatible fingerprint, and explicit versus browser-close exit. Confirm visible errors and retained last successful resume state.
7. Record measured session/total time and multiple launches. Repeat in target browsers. Preserve evidence and exact settings in the validation matrix before distributing courses.
