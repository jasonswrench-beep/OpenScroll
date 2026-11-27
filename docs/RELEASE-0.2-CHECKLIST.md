# Release checklist: v0.2.0-alpha.1 (schema 4 and OpenScroll Studio)

Stage 9 of the [block build plan](BLOCK-BUILD-PLAN.md). The work was built on the `feature/schema-4` branch and
squash-merged into `main` (pull request #11). The owner decided on 2026-11-26 to release this alpha once it runs on
the production server, with the screen reader, usability and remaining Brightspace checks to follow. The tag goes
on the commit that is running there after the cutover checks pass.

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
- [ ] After the cutover checks pass, tag the commit running on the server and push the tag. A pushed tag never
  moves: a later fix takes a new version.

## Cutover (needs the owner's go-ahead and VPS access)

Follow the backup-first plan in `DEPLOYMENT-HANDOFF.md`, with these additions:

1. After the backup is restored into an isolated database for verification, run `npm run db:rehearse` against
   that copy. Every row must open (`"ok": true`); a failure names the row id to investigate before going on.
2. There is no new course migration in this release. Stored courses stay at their schema version until an author
   saves them, so rolling back to the previous image pair keeps working for unsaved courses. A course saved by
   the new version cannot be opened by the old one: if rollback is needed after authors have saved, restore the
   backup. A server that predates database migration 5 also gets the owner-approval migration from the October
   security work, which keeps all data but signs everyone out and leaves accounts pending until the owner is named.
3. Deploy with `OPENSCROLL_STUDIO=off` first. Check the classic workspace and existing courses, then turn the
   studio on and restart. Embedded video is on by default (approved by the owner); the size limits start at 64 MiB
   per file and 160 MiB per course, and the edge proxy now allows requests up to 440 MiB.
4. Recheck the other services on the VPS, as the handoff requires.
