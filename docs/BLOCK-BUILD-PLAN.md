# Block build plan

Status: built through stage 9, 2026-11-25. Stages 1, 3 and 4 are built
on the `feature/schema-4` branch: schema 4, the studio shell, and the new lesson editor with Wave A, learner
responses and My workbook (F2) and the region editor (F4). Because schema 4 is not yet released, Wave A's block
shapes joined it instead of starting version 5; later waves do the same until the release stage. Stage 5 added the question engine
with per-question LMS reporting (F3), Wave B's short answer, numeric, hotspot and survey, Checks, the export
dialog, the device preview and the theme studio. Question banks and `.openassess` import moved to stage 7, because
they need the course resources panel (F6) that stage 7 builds. Stage 6 added the timed cue editor (F5), audio
description, interactive video, embedded video behind an instance setting (F7; on by default since the owner's decision of
2026-11-26), software practice with OpenStage Capture import, and test results reported as `performance`.
Size-limit settings followed in the release stage (64 MiB per file and 160 MiB per course by default, raised by
`OPENSCROLL_MAX_FILE_MIB` and `OPENSCROLL_MAX_COURSE_MIB`).
Stage 7 added course resources (F6: glossary, question banks, certificate), the glossary, action plan, results and
certificate and "Questions from a bank" blocks, glossary term links, bank editing in the lesson editor, and
`.openassess` import through `@openstage/bank` 0.1.0, installed from its GitHub release and checked against the
release's SHA-256 (npm cannot install one package from a monorepo folder, so the release tarball replaced the Git
dependency in decision 5's default).
Stage 8 added characters (upload-only at first; OpenStage Author's packs followed in the release stage), the scenario block,
its editor with a route check and undo, the conversation player with "Your path", and scenario results reported
to the LMS.
Stage 9 added the compatibility fixtures (the original version 1 to 3 starters and an every-block version 4 file),
a read-only migration rehearsal (`npm run db:rehearse`), the [Quick Start](QUICK-START.md), draft release notes
and the [release checklist](RELEASE-0.2-CHECKLIST.md). What remains needs the owner, Brightspace, people or the
live server, and is listed there.

## Scope

This build delivers every block shown in the redesign prototype, including the ones it marks Planned:

- **Seven new blocks** from the OpenStage Author and Guide survey: learning objectives, table, reflection,
  activity, checklist, self-assessment, true or false.
- **Fifteen planned items**: columns, glossary, embedded video, audio description on video, scenario,
  interactive video, software practice, action plan, survey, hotspot, ordering, short answer and numeric
  questions, question banks, and results with a certificate.
- **The lesson banner** and **My workbook**.

Graded quizzes as outline items, charts, and other extras are listed at the end as optional.

## How a block reaches every output

Each block type touches the same places today, and the plan keeps one checklist for all of them. A block is
done only when every row is done.

| Layer | Where it lives today | What each block needs |
| --- | --- | --- |
| Format | `src/shared/course.ts`, generated `schema/course-v4.schema.json` | Zod schema, reference checks in `parseCourse`, migration from older versions where relevant |
| Catalog | `src/shared/block-catalog.ts` | Label, icon, category, starter content (original text), variants |
| Learner view | `src/shared/block-renderer.ts`, `src/shared/extended-renderer.ts`, `src/shared/blocks.css` | Semantic HTML, keyboard behavior, reduced motion, phone layout |
| Learner state | `src/player/state.ts`, `src/player/assessment-player.ts` | What is saved, what counts as done, what Continue waits for |
| LMS | `src/player/scorm.ts` | Resume data size, and the per-question report added below |
| PDF | `src/project/pdf-html.ts` | A static reading version, and its entry in the optional answer key |
| Editor | New inspector and canvas (replaces `src/client/extended-settings.ts`, `assessment-settings.ts`) | Content, Style, Behavior and Access tabs; inline editing where text is on the page |
| Reuse and assets | `src/shared/reuse.ts`, `src/server/library-routes.ts` | Asset references, so saved blocks and snapshots carry their files |
| Readiness | `src/project/readiness.ts` and Checks | What blocks an export, what warns, what needs a person |
| Tests | `tests/*.test.ts`, `tests/browser/*.spec.ts`, `tests/helpers/pdf-project.ts` | Round trip, scoring, keyboard path, axe check, PDF text, SCORM resume |

## Shared foundations

These are built once and used by many blocks. Each is listed with the blocks that depend on it.

| ID | Foundation | What it adds | Used by |
| --- | --- | --- | --- |
| F1 | Schema 4 | Rich text, the new course and block fields, course-level `glossary`, `banks`, `characters` and `certificate` collections | Everything |
| F2 | Learner responses | One saved-response store for text, ticks, ratings and grids, shown on My workbook, kept in resume data, with a size estimate in Checks | Reflection, activity, checklist, self-assessment, action plan, survey, short answer |
| F3 | Question engine | One scoring, attempts and feedback model for all question kinds, plus per-question `cmi.interactions` reporting (today the player sends only the overall score) | All questions, hotspot, banks, interactive video, software practice test mode |
| F4 | Region editor | Draw, label and nudge rectangles and circles on an image with mouse or arrow keys, with numeric fields | Labeled graphic (exists), hotspot, software practice, interactive video hotspots |
| F5 | Timed cue editor | A list of times synced to a video scrubber, used for checkpoints and description cues, sharing the WebVTT parser that captions use today | Interactive video, audio description, captions |
| F6 | Course resources panel | A course-level place for glossary terms, question banks, characters and certificate settings | Glossary, banks, scenario, results |
| F7 | External media policy | An allowlist of video hosts, click-to-load facades, a frame rule in the player's content policy, and an "external content" notice in Export | Embedded video |

### F2 detail: where learner responses are saved

Today the player saves progress and question answers as compact resume data. Its adapter enforces 4,096
characters for SCORM 1.2 and 64,000 for SCORM 2004 and never truncates. Written answers can exceed the 1.2
limit quickly.

- Website export: responses go in the browser's local storage with the existing resume data.
- SCORM 2004: responses go in resume data. Checks estimates the size and warns near the limit.
- SCORM 1.2: responses that don't fit are kept on the learner's device and the learner is told so. Checks
  warns when a course has written-response blocks and recommends SCORM 2004.
- Responses are also reported as `cmi.interactions` (`long-fill-in` in 2004, `fill-in` in 1.2) so the LMS
  has a record even when resume data cannot hold them.
- My workbook reads the same store. It prints through the browser's print stylesheet.

### F3 detail: question types and LMS reporting

| Question | SCORM interaction type | Scored |
| --- | --- | --- |
| Multiple choice, multiple response, true or false | `choice`, `true-false` | Yes |
| Fill in the blank, short answer (exact match) | `fill-in` | Yes |
| Short answer (self-check against a model answer) | `long-fill-in` (2004), `fill-in` (1.2) | No |
| Numeric (value with tolerance, or range) | `numeric` | Yes |
| Matching | `matching` | Yes |
| Ordering | `sequencing` | Yes |
| Hotspot | `choice` with area ids | Yes |
| Survey rating | `likert` | No |
| Software practice, test mode | `performance` | Yes |

Scoring stays all-or-nothing per question, as today, except numeric tolerance. Per-question reporting is
verified in Brightspace for both editions before the first wave ships.

## Block specifications

Size is a relative build estimate: S (a few days), M (one to two weeks), L (two to four weeks),
XL (more than four weeks). PDF describes the static reading copy; the answer key stays optional and off by
default.

### Wave A: built with the new lesson editor

| Block | Learner does | Stored data | PDF | Size |
| --- | --- | --- | --- | --- |
| Learning objectives | Reads outcomes with optional Bloom levels | `intro`, `items[{text, level, id}]`; also fills the lesson objectives field Guide asked for | Numbered list with levels | S |
| Table | Reads a table with header cells | `caption`, `head[]`, `rows[][]` (rich text cells), header-column flag | Table with repeated header row across pages | M |
| Reflection | Writes an answer; can reveal a sample | `prompt`, `placeholder`, `sample`, `minWords?`, `required`, `workbook` | Prompt plus ruled lines; sample in the answer key | S |
| Activity | Follows timed steps; writes in a box | `title`, `minutes`, `steps[]`, `output` label | Boxed card with steps and ruled lines | S |
| Checklist | Ticks items | `title`, `items[]` | Items with empty boxes | S |
| Self-assessment | Rates statements; sees a total and its meaning | `title`, `scale[]`, `items[]`, `bands[{min, max, text}]` | Statements with scale boxes and the score table | M |
| True or false | Judges a statement | question engine, kind `tf` | Statement with True / False boxes | S |
| Ordering | Puts items in order | today's assessment `sorting`, renamed `ordering` in schema 4 so it can't be confused with grouping | Items in shuffled order | S |
| Columns | Reads two or three columns that stack on phones | `layout` (`1-1`, `1-1-1`, `2-1`, `1-2`), `columns[{blocks[]}]`; children limited to text, image, list, note, quote, button | Side by side when the page is wide enough, else in order | L |

Columns is in this wave because nested selection shapes the editor's selection and undo model. Only
non-interactive blocks may sit inside a column, which keeps tracking and phone reflow simple.

### Wave B: questions, surveys and banks

| Block | Learner does | Stored data | PDF | Size |
| --- | --- | --- | --- | --- |
| Short answer | Types an answer; exact match or self-check against a model answer | `prompt`, `mode` (`match` or `self-check`), `accepted[]`, `caseSensitive`, `model` | Prompt and an answer line | S |
| Numeric | Types a number | `prompt`, `value`, `tolerance` or `min`/`max`, `unit` | Prompt and an answer box | S |
| Hotspot | Selects the right place on a picture | image, `areas[{shape, x, y, w, h, label, correct, feedback}]` | Image with lettered areas; key marks the correct ones | M |
| Survey | Answers unscored ratings and comments | `items[{kind: likert, rating, differential, comment, choice}]`, scale labels | Blank form | M |
| Question bank draw | Gets a random set of questions that stays the same on resume | course `banks[{id, name, questions[]}]`; block `{bankId, count, shuffleChoices}`; drawn ids kept in resume data | "Answer N of M questions"; the key lists the whole bank | L |
| `.openassess` import | Brings OpenAssess banks in | Read with `@openstage/bank` from openstage-core (BANK-1), pinned and listed in third-party notices | n/a | M |

**Hotspot without a mouse.** Every area, correct or not, has a text label. Keyboard and screen reader users
choose from that labeled list; pointer users click the picture. Authors are prompted to add at least two
wrong areas so the list doesn't give the answer away.

**Banks.** Spreadsheet import (the existing Excel and CSV path) can target a bank as well as the lesson.
The column names are aligned with OpenStage Author's question CSV (Type, Question, A–H, Correct, Points,
Attempts, feedback) so one file works in both tools.

### Wave C: media

| Block | Learner does | Stored data | PDF | Size |
| --- | --- | --- | --- | --- |
| Audio description (video option) | Switches to a described version | `describedAssetId?` (a second MP4), `descriptions[]` cues read aloud through a polite live region | Description text inline with the transcript | M |
| Embedded video | Watches YouTube or Vimeo after pressing play | `provider`, `videoId`, `title`, `transcript` (required), `start?` | Title, address, transcript | M |
| Interactive video | Watches an uploaded video that pauses at checkpoints | `assetId`, captions, `chapters[]`, `checkpoints[{time, kind: question, note, jump, hotspot}]`, `noSkipAhead` | Transcript with checkpoints placed at their times | XL |
| Software practice | Watches, tries and is tested on a recorded task | `steps[{imageId, alt, instruction, target{x, y, w, h}, typed?, hint}]`, `modes` (watch, try, test) | Numbered steps with screenshots and the target outlined | XL |

**Embedded video and self-contained exports.** Website and SCORM exports promise to run with no outside
service. An embedded YouTube or Vimeo video breaks that promise. The plan allows it only on these terms:

- Learners load nothing from the video host until they press play; until then a facade shows the title and
  a "Plays from YouTube" notice. YouTube uses its privacy-enhanced domain.
- A transcript is required.
- Export lists every external video, and the course still works without them.
- LMSs or networks that block the host show the transcript and a link instead.

**Interactive video** reuses the question engine for checkpoint questions, so scoring, attempts, feedback
and LMS reporting match ordinary questions. Every checkpoint also appears in a list under the video, so
learners who can't use the player controls get the same content.

**Software practice** imports OpenStage Capture's `steps.json` and screenshots (the capture format is in
openstage-core `specs/capture`), converting screenshots to WebP to save space. Targets are drawn with the
region editor (F4). In Try mode a wrong click shows a hint after the second attempt. A keyboard user tabs to
a labeled target button. Test mode is scored and reported as `performance`.

**Size limits.** Exports are capped at 16 MB per file and 32 MB per package (64 MB unpacked). A few minutes
of video, or a long software practice, can exceed that. The plan makes these limits instance settings with
today's values as defaults, so a self-hosted operator can raise them knowingly. Checks shows the projected
package size and the largest files.

### Wave D: course-level blocks

| Block | Learner does | Stored data | PDF | Size |
| --- | --- | --- | --- | --- |
| Glossary | Browses terms A to Z with search; optional links on the first use of each term in the text | course `glossary[{id, term, definition, aliases[]}]`; block `{filter?, showLetters}`; optional term links in rich text | An appendix glossary | M |
| Action plan | Fills a table of what, who, by when; can add rows | `columns[]` (labels, input type text or date), `starterRows`, `maxRows` | Blank table with ruled rows | M |
| Results and certificate | Sees progress, scores by check and pass status, reviews missed questions, prints a certificate | course `certificate{title, issuer, logoId?, signatureId?, signerName, showScore}`; block `{showReview, showCertificate}` | Omitted (learner-specific) | L |

**Glossary links** use a toggletip button, not hover, so they work by keyboard and touch. Terms can be
imported from a CSV or from OpenStage Guide's glossary section.

**Certificates** print through the browser and are not verifiable: a Website or SCORM export has no server
to vouch for them. The block says "Certificate of completion" and carries the course title, the learner's
typed name, the date, and the issuer. Verifiable certificates are out of scope.

### Wave E: scenario

| Block | Learner does | Stored data | PDF | Size |
| --- | --- | --- | --- | --- |
| Scenario | Talks through a situation with characters, making choices that lead to different endings | course `characters[{id, name, role, poses[{name, imageId, alt}]}]`; block `{scenes[{id, background?, nodes[{id, kind: line, narration, choice, ending}]}], start, allowTakeBack, showPathReview, scoring?}` | The script as numbered nodes, with "If you choose …, go to 7" | XL |

- **Editor.** A full-screen scenario editor: a scene list, a node list for the selected scene, an optional
  map of how nodes connect, and the inspector. Choices pick their next node from a menu, so authoring never
  needs dragging. Checks flags dead ends, unreachable nodes and endings with no route.
- **Learner view.** A conversation column: each line shows the speaker's pose image and name. Choices are
  buttons, and focus moves to the newest line. At the end, "Your path" shows the choices made, with feedback.
- **Characters.** Poses are images with alt text, uploaded or chosen from OpenStage Author's two packs (`pack.json`
  with WebP poses), which ship in `public/character-packs` under the Apache License 2.0.
- **Tracking.** Reaching an ending completes the block. Optional scoring sums points per choice and reports
  as `performance`.

## Delivery sequence

The redesign's six stages grow to nine: the first five keep their content and take a block wave each where
it fits, three new stages carry the larger waves, and Release moves to the end. Each wave ships behind the
new-editor instance setting.

| Stage | Includes | Block wave |
| --- | --- | --- |
| 1. Format | Schema 4 (F1), migration, renderer updates | Data shapes for every block in this plan, so the format changes once |
| 2. Rise import | Importer and report | — |
| 3. Workspace shell | Library, course page, saving | — |
| 4. Lesson editor | Canvas, inspector, picker, rich text, F2, F4 | Wave A |
| 5. Delivery | Theme, preview, Checks, Export, F3 with per-question LMS reporting | Wave B |
| 6. Media | F5, F7, size-limit settings | Wave C |
| 7. Course resources | F6, glossary, action plan, results and certificate | Wave D |
| 8. Scenario | Scenario editor and player | Wave E |
| 9. Release | Compatibility fixtures, Brightspace checks for both SCORM editions, accessibility and usability sessions, VPS cutover | — |

Stage 1 (done) added the fields imported courses need, the lesson banner and objectives, per-choice feedback,
and the sort-into-groups question. Each later wave adds its own block shapes in a new schema version with a
non-destructive migration, designed when that wave starts rather than guessed now. Older servers reject newer
files with a clear message and keep the file unchanged, as the format policy already requires.

Waves can ship to the VPS one at a time, each after its own backup-first upgrade.

## Done when, for every block

- It saves, reopens, duplicates, and survives undo, redo and a revision conflict.
- It round-trips through an `.openscroll` file and through a snapshot restore with its assets.
- It renders the same in the editor, the preview and the Website and SCORM exports, at 1440, 768 and 375 px.
- It works by keyboard alone, passes the axe check, and has screen reader names for every control.
- Reduced motion turns off its animation.
- Its PDF version reads in order, and its answer-key entry is correct.
- Scored blocks report to the LMS and resume correctly in both SCORM editions in Brightspace.
- Checks covers its required fields, and the Access tab explains what assistive technology announces.

## Decisions (answered by the owner on 2026-11-26)

Answers: 1, allow YouTube and Vimeo (on by default); 2, reuse OpenStage Author's packs; 3, yes, SCORM 2004 first
for courses with written responses; 4, raise the defaults and add settings to raise them further. Decision 5 kept
its default with the release tarball described above.

1. **Embedded video.** Allow YouTube and Vimeo in exports on the terms above, or keep exports fully
   self-contained and offer only uploaded video?
2. **Character art for scenarios.** Use OpenStage Author's two packs (if their license allows it here),
   commission or draw original packs, or ship with upload-only characters?
3. **SCORM default.** Make SCORM 2004 the default export for courses with written-response blocks?
4. **Size limits.** Keep 16 MB per file and 32 MB per package as defaults with instance settings to raise
   them, or raise the defaults?
5. **openstage-core dependency.** Default: consume `@openstage/bank` as a Git dependency pinned to a commit,
   listed in the third-party notices and checked by `npm run licenses`. A vendored copy is the fallback if
   the license check or the container build objects.

## Optional extras

Not in this build unless added: charts (bar, line, pie), quote carousel, gallery carousel, button stack,
text over an image and a banner image block, a sandboxed code block, and graded quizzes as outline items.
None of the courses tested so far uses them.
