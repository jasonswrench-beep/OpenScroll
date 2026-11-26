# Release checklist: v0.2.0-alpha.1 (schema 4 and OpenScroll Studio)

Stage 9 of the [block build plan](BLOCK-BUILD-PLAN.md). Everything below that can be done inside the repository is
done on the `feature/schema-4` branch. The rest needs the owner, an LMS, real people or the live server, and is
listed in the order it should happen. Nothing here has been pushed, tagged or deployed.

## Done in the repository

- [x] Compatibility fixtures: `tests/fixtures/welcome-v1.openscroll`, `welcome-v2` and `welcome-v3` (the
  original starters) and `every-block-v4.openscroll` (every block template and every course resource, generated
  by `tools/every-block-fixture.ts`). `tests/compatibility.test.ts` opens each old version as version 4, checks
  the version 4 file re-exports byte for byte, passes Checks, builds a PDF, and keeps a learner's answers through
  SCORM resume in both editions.
- [x] Migration rehearsal tool: `npm run db:rehearse` opens every stored course, snapshot and reusable item inside
  a read-only transaction and reports counts by schema version and failures by row id only.
- [x] Quick Start for studio authors: [QUICK-START.md](QUICK-START.md).
- [x] Draft release notes: [releases/v0.2.0-alpha.1.md](releases/v0.2.0-alpha.1.md).
- [x] Browser checks with axe (WCAG 2.2 A and AA) on every studio page, dialog, inspector tab and new player,
  run locally against the in-memory test server.

## Owner decisions (answered 2026-11-26)

| Decision | Answer | In this build |
| --- | --- | --- |
| Embedded YouTube and Vimeo video | Allow it | On by default; `OPENSCROLL_EXTERNAL_VIDEO=off` keeps exports self-contained |
| Character art for scenarios | Reuse OpenStage Author's packs | Both packs ship in `public/character-packs`; Choose from the library for people and scene backgrounds ([Scenarios](SCENARIOS.md)) |
| SCORM default for written responses | Default to SCORM 2004 | Export lists SCORM 2004 first and marks it recommended for courses with written responses; 1.2 stays available |
| Size limits | Raise them, with a way to raise them further | 64 MiB per file and 160 MiB per course by default; `OPENSCROLL_MAX_FILE_MIB` (to 256) and `OPENSCROLL_MAX_COURSE_MIB` (to 320) raise them ([Self-hosting](SELF-HOSTING.md)) |

## Before merging

- [ ] Push `feature/schema-4` and open a pull request (needs the owner's go-ahead).
- [ ] CI passes: unit tests, PostgreSQL integration tests and the Chromium browser suite (`tests/browser/`),
  which need PostgreSQL and the PDF renderer and cannot run on the development laptop. The 13 local failures are
  all of this kind and match the baseline from before the branch.
- [ ] Review `npm audit`: the advisories for `@fastify/static`, `glob`, `minimatch` and `fast-xml-parser` were
  present before this branch. Update where a fixed version exists and record the rest.
- [ ] `npm run licenses` passes with `@openstage/bank` 0.1.0 listed in the third-party notices.

## Before tagging

- [ ] Brightspace, both SCORM editions, with a copy of a real course: launch, answer every question type, leave
  and resume, check the gradebook score and pass or fail, and check that each question appears under the
  attempt's interactions with its result. Test a written response larger than SCORM 1.2 can hold and confirm the
  learner is told it is kept on this device. Record the Brightspace release, browser and import options.
- [ ] Recreate at least one of the five Rise courses in the studio from its import, then export and check it.
- [ ] Accessibility session: keyboard only and with a screen reader (NVDA with Firefox or Chrome, and VoiceOver
  with Safari) through the library, the lesson editor and the learner player, including a scenario, the glossary
  term links and interactive video. Zero blockers to release.
- [ ] Usability session: at least two authors build a short lesson from the Quick Start without help. Record where
  they stopped.
- [ ] Bump `package.json` to `0.2.0-alpha.1`, finish the release notes, commit, and tag that commit. Build and sign
  only from the tagged commit with a clean working tree.

## Cutover (needs the owner's go-ahead and VPS access)

Follow the backup-first plan in `DEPLOYMENT-HANDOFF.md`, with these additions:

1. After the backup is restored into an isolated database for verification, run `npm run db:rehearse` against
   that copy. Every row must open (`"ok": true`); a failure names the row id to investigate before going on.
2. There is no new database migration in this release. Stored courses stay at their schema version until an
   author saves them, so rolling back to the previous image pair keeps working for unsaved courses. A course saved
   by the new version cannot be opened by the old one: if rollback is needed after authors have saved, restore the
   backup.
3. Deploy with `OPENSCROLL_STUDIO=off` first. Check the classic workspace and existing courses, then turn the
   studio on and restart. Embedded video is on by default (approved by the owner); the size limits start at 64 MiB
   per file and 160 MiB per course, and the edge proxy now allows requests up to 440 MiB.
4. Recheck the other services on the VPS, as the handoff requires.
