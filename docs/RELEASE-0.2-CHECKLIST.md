# Release checklist: v0.2.0 (schema 4 and OpenScroll Studio)

Stage 9 of the [block build plan](BLOCK-BUILD-PLAN.md). The work was built on the `feature/schema-4` branch and
squash-merged into `main` (pull request #11). The owner decided on 2026-11-26 to release this alpha once it runs on
the production server, with the screen reader, usability and remaining Brightspace checks to follow. The tag goes
on the commit that is running there after the cutover checks pass.

**Status, 2026-11-27:** both alphas are deployed and tagged. [v0.2.0-alpha.1](releases/v0.2.0-alpha.1.md)
(commit `e64d932`) went live on the production server, and its tag was pushed once the cutover checks passed.
[v0.2.0-alpha.2](releases/v0.2.0-alpha.2.md) (commit `b904d38`), which opens the studio after sign-in, replaced it
the same day by switching images only. The [deployment record](../DEPLOYMENT-HANDOFF.md) describes the running
installation. The open items below follow the alpha.

## Done in the repository

- [x] Compatibility fixtures: `tests/fixtures/welcome-v1.openscroll`, `welcome-v2` and `welcome-v3` (the
  original starters) and `every-block-v4.openscroll` (every block template and every course resource, generated
  by `tools/every-block-fixture.ts`). `tests/compatibility.test.ts` opens each old version as version 4, checks
  the version 4 file re-exports byte for byte, passes Checks, builds a PDF, and keeps a learner's answers through
  SCORM resume in both editions.
- [x] Migration rehearsal tool: `npm run db:rehearse` opens every stored course, snapshot and reusable item inside
  a read-only transaction and reports counts by schema version and failures by row id only.
- [x] Quick Start for studio authors: [QUICK-START.md](QUICK-START.md).
- [x] Release notes: [releases/v0.2.0-alpha.1.md](releases/v0.2.0-alpha.1.md).
- [x] Browser checks with axe (WCAG 2.2 A and AA) on every studio page, dialog, inspector tab and new player,
  run locally against the in-memory test server.

## Owner decisions (answered 2026-11-26)

| Decision | Answer | In this build |
| --- | --- | --- |
| Embedded YouTube and Vimeo video | Allow it | On by default; `OPENSCROLL_EXTERNAL_VIDEO=off` keeps exports self-contained |
| Character art for scenarios | Reuse OpenStage Author's packs | Both packs ship in `public/character-packs`; Choose from the library for people and scene backgrounds ([Scenarios](SCENARIOS.md)) |
| SCORM default for written responses | Default to SCORM 2004 | Export lists SCORM 2004 first and marks it recommended for courses with written responses; 1.2 stays available |
| Size limits | Raise them, with a way to raise them further | 64 MiB per file and 160 MiB per course by default; `OPENSCROLL_MAX_FILE_MIB` (to 256) and `OPENSCROLL_MAX_COURSE_MIB` (to 320) raise them ([Self-hosting](SELF-HOSTING.md)) |
| Preview frames (security review L1) | Accept the risk for this alpha | Previews keep `allow-scripts allow-same-origin`; see below |
| Email-verified passwords (closed pull request #10) | Include them | Merged into this release with its failing browser test fixed |
| Order of release | Release once it runs on the production server | Screen reader, usability and remaining Brightspace checks follow the alpha |

## Before merging

- [x] Push `feature/schema-4` and open a pull request (#11).
- [x] CI passes: unit tests, PostgreSQL integration tests, the Chromium browser suite (`tests/browser/`), the
  final-image tests and the production rehearsal. Locally, the 13 unit failures that need PostgreSQL, the PDF
  renderer or POSIX permissions match the baseline from before the branch.
- [x] `npm audit --omit=dev` reports no vulnerabilities: `@fastify/static` 10.1.11 brings fixed `glob` and
  `minimatch`, and `fast-xml-parser` is 5.12.1.
- [x] `npm run licenses` passes in CI with `@openstage/bank` 0.1.0 listed in the third-party notices.
- [x] Preview frames (security review of 2026-11-26, L1; first review, L4): the studio and classic previews load
  `/player.html` with `allow-scripts allow-same-origin`. Dropping `allow-same-origin` makes the frame's origin
  opaque, so its module scripts would need CORS headers and the preview messages a `*` target. The reviewer
  found no way in, since course content reaches the page only as built elements. The owner accepted the risk for
  this alpha on 2026-11-26; revisit it before a non-alpha release.

## Before tagging

- [x] Brightspace with a copy of a real course imported from Rise, SCORM 2004: launch, progress, leave and resume,
  checked by the owner with a student account.
- [ ] Brightspace with scored questions and SCORM 1.2: check the gradebook score and pass or fail, and that each
  question appears under the attempt's interactions with its result. Record the Brightspace release, browser and
  import options. Checked so far in a stand-in LMS for both editions (see the release notes); follows the alpha.
- [x] Written response larger than SCORM 1.2 can hold: the learner is told it is kept on this device (stand-in LMS).
- [x] Recreate at least one Rise course from its import, then export and check it.
- [x] On the release images with the default limits: two authors save a course near the 160 MiB limit at the same
  moment, and one exports it as SCORM while the other saves. `tools/large-save-check.ts`, run by the production
  rehearsal in CI, checks that the app stays up (no restart, no out-of-memory), that the overlapping request is
  asked to try again, and that every save lands. It reports the container's memory limit and peak.
- [x] Keyboard only, automated: library, course page, lesson editor, block picker and learner course with every
  block type; no traps, visible focus at every stop, and the main tasks by keyboard.
- [ ] Screen reader session: NVDA with Firefox or Chrome, and VoiceOver with Safari, through the library, the lesson
  editor and the learner course, including a scenario, the glossary term links and interactive video. Follows the
  alpha.
- [ ] Usability session: at least two authors build a short lesson from the Quick Start without help. Record where
  they stopped. Follows the alpha.
- [x] Bump `package.json` to `0.2.0-alpha.1` and finish the release notes.
- [x] After the cutover checks pass, tag the commit running on the server and push the tag. A pushed tag never
  moves: a later fix takes a new version. Done for `v0.2.0-alpha.1` (`e64d932`) and `v0.2.0-alpha.2` (`b904d38`),
  each with a GitHub pre-release page.

## Cutover (done 2026-11-27)

The owner approved the backup-first plan, and the production server moved from its October 2026 installation to
v0.2.0-alpha.1 through the `deploy/ops.sh upgrade` steps, with 20 seconds offline. The
[deployment record](../DEPLOYMENT-HANDOFF.md) has the details.

- [x] A fresh backup was restored into a separate Compose project and upgraded there first. The course check behind
  `npm run db:rehearse` opened every stored course, snapshot and reusable item. A test author signed in, made a
  course and exported SCORM 2004, SCORM 1.2 and PDF. Rolling the copy back was tested, and the copy was then
  removed.
- [x] There is no new course migration in this release. Stored courses stay at their schema version until an
  author saves them. A course saved by the new version cannot be opened by an older one, so a rollback after
  authors have saved means restoring the backup. The server already had database migration 5, so no accounts were
  reset.
- [x] Production runs with the studio on (`OPENSCROLL_STUDIO=on`); the classic workspace stays one link away.
  Embedded video is on by default (approved by the owner), and the size limits are the defaults of 64 MiB per file
  and 160 MiB per course.
- [x] The other sites on the server were rechecked after each switch and still answer.
- [ ] The shared proxy's request timeout is still at its 60-second default, below the 8 minutes that
  [self-hosting](SELF-HOSTING.md#https-on-a-shared-vps) asks for. Changing it affects every site on the server, so
  it waits for the owner's decision.
- [ ] Daily backups run on the server, but they are not encrypted, and there is no automatic copy off the server
  yet.
