# OpenScroll redesign plan

Status: draft for review, 2026-11-25. Stage 1 (schema 4) and the Rise importer are built on the `feature/schema-4`
branch: see [FORMAT-SPEC.md](FORMAT-SPEC.md#version-4-additions) and [RISE-IMPORT.md](RISE-IMPORT.md). Stage 3,
the studio shell (library and course page at `/studio/`), and stage 4, the lesson editor with the first block wave,
are built: see [STUDIO.md](STUDIO.md). A clickable prototype accompanies this plan (kept outside the repository because it
contains the owner's course content).

## Goal

Make OpenScroll a place where an author can rebuild a real Rise course and keep working in it comfortably:
a library, a course page, a lesson editor, a theme studio, a learner preview, checks, and export that work as
one connected workspace. Keep everything OpenScroll already does well: portable projects, revision-checked
autosave, the shared learner player, SCORM 1.2 and 2004 output that passed in Brightspace, tagged PDF, and
the security boundaries around accounts, the database, and the PDF renderer.

## Inputs

- A hands-on functional profile of Rise 360 and Articulate 360 AI, an analysis of 21 Rise template courses
  (1,396 blocks), and an inventory of 295 Rise templates and 1,061 lessons (owner's research documents).
- Five of the owner's own Rise courses as web exports ("raw" ZIPs). Their content is the fidelity target.
- An interface overhaul specification (owner's document) with screen requirements OS-01 to OS-15, save and
  recovery rules, accessibility targets, staged delivery, and acceptance scenarios AC-01 to AC-04.
- This repository at `5a38b33`.

## What the five courses need

A Rise web export stores the course in `content/runtime-data.js` as base64-encoded JSON inside a
`__jsonp("runtime-data.js", "…")` call, with media in `content/assets/`. All five decode cleanly.

| Rise block | Count | OpenScroll today (schema 3) |
| --- | ---: | --- |
| Text: paragraph with heading | 560 | Paragraph with heading, plain text only |
| Text: paragraph | 74 | Paragraph, plain text only |
| Accordion | 59 | Accordion; panel text plain |
| Knowledge check (multiple choice / response) | 58 | Assessment; feedback is right/wrong only, plain text |
| Continue | 49 | Continue; no completion hint text |
| Process (intro, steps, summary) | 46 | Process; no intro or summary cards |
| Tabs | 36 | Tabs |
| Numbered list | 33 | List; plain text items |
| Sorting activity (cards into groups) | 27 | Missing: OpenScroll's sorting is ordering, not grouping |
| Statement B | 24 | Note |
| Flashcard grid | 23 | Flashcards; plain text |
| PDF attachment | 20 | Attachment |
| Image (hero, with caption) | 5 | Image |
| Timeline with labels such as "Phase 1" | 3 | Timeline; no date label |
| **Total** | **1,017** | Every block has a home; none is unknown |

The text is rich. Across the five courses: 5,165 paragraphs, 958 list items (ordered lists with custom start
numbers), 407 subheadings (h2 to h4) inside text blocks, 247 bold runs, 60 italic runs, and 16 links.

Course-level settings also matter: accent color, cover layout (centered overlay, split left, split right,
two-thirds left), the Lato + Merriweather font pairing, cover image, author name and photo, sidebar
navigation, and "Lesson 1 of 10" labels.

### Format gaps to close

1. **Rich text** in every text field: paragraphs, bold, italic, links, bulleted and numbered lists (with a
   start number), and level 3 and 4 subheadings. Stored as a small, validated HTML subset, sanitized on save
   and on import.
2. **Knowledge check feedback**: none, right/wrong, or per choice, each message rich text.
3. **Process**: optional introduction and summary cards around the steps.
4. **Timeline**: a short label per event ("Phase 1", "1932").
5. **Sorting into groups** as a new question type beside today's ordering question (rename that one Ordering).
6. **Note styles**: note, statement, highlight.
7. **Continue**: the message under the button.
8. **Theme**: cover layout, named font pairings (beyond sans/serif), corner style, navigation style,
   lesson count label, author photo, and lesson header style (image banner, accent band, or plain).
9. **Lesson banner**: an image at the top of each lesson. The current player already shows the course cover
   there; schema 4 lets each lesson use the cover, its own image, or none, with alternative text or a
   decorative flag stored per lesson.
10. **Lesson objectives**: an optional objectives field on a lesson (text, Bloom level, id). OpenStage Guide
    has asked for this (its `CORE-REQUESTS.md` G5).

## Decision needed: file format version

The interface specification proposes keeping schema 3 for the first release and treating rich text as a
separate decision. Recreating the five courses is impossible without rich text and the fields above, and an
importer that flattens bold, lists, and subheadings would lose a large share of the authored formatting.

**Recommendation:** introduce schema 4 first. It is additive: version 1 to 3 projects keep importing
unchanged, and plain text converts losslessly into paragraphs. Stored library courses migrate once, server
side, with the original revision kept as a snapshot. The new editor UI then builds on schema 4 from day one
instead of being reworked later.

## Interface direction

The prototype shows the direction. Principles:

1. **The page is the editor.** The lesson canvas uses the learner renderer with the course's own fonts and
   colors. The app chrome around it never takes on the course theme.
2. **Three panes.** Outline and block picker on the left, the live page in the middle, an inspector for the
   selected block on the right. Below 1200 px one side pane becomes a drawer; below 900 px both do.
3. **Select, don't hover.** Clicking or tabbing to a block selects it. Its toolbar (type, Edit, Style, move,
   duplicate, delete) and the inspector are keyboard reachable; nothing essential appears only on hover.
4. **Type on the page; edit items as cards.** Paragraphs, headings, lists, and notes edit in place with a
   formatting bar. Accordion panels, tabs, flashcards, steps, events, sorting cards, and answer choices edit
   as reorderable cards in the inspector, with move buttons as well as drag.
5. **One inspector with four tabs.** Content, Style (background, width, spacing, "use for every block of this
   type"), Behavior (required interaction, attempts, pass-to-continue, scoring, Continue unlock rule), and
   Access (this block's checks, reading order, and what assistive technology announces).
6. **Insert anywhere, and say where.** A + between blocks opens a quick picker; the Blocks tab holds the full
   catalog (Text, Media, Interaction, Reflect and apply, Assessment, Structure, Saved), with previews drawn in the course accent
   and a line that names the block the insertion follows. Spreadsheet question import lives under Assessment.
7. **Checks point at the field.** Grouped as Blocks export, Warnings, and Needs a person's review, each with
   lesson, block, and the outputs it affects. Go to issue selects the block and focuses the exact field.
   Checks never block saving.
8. **Honest saving.** The label says Saved only after the server confirms. The states are Changes pending,
   Saving, Saved, Save not confirmed, and Conflict. A conflict pauses saving and offers Download my edits,
   Save a separate copy, and Reload saved course. Snapshots sit behind the same label.
9. **Export by destination.** LMS package (SCORM 1.2 or 2004, 4th edition), Website files, PDF document, or
   Editable project. The build says which revision it uses, shows its steps, and ends with the next step for
   that file (upload as is; test in Package Doctor; check PDF tags).
10. **Theme studio with live preview.** Cover layout, accent with computed contrast (button text flips
    between white and dark; light accents darken for text), font pairing, navigation, corners, motion.

Screens in the prototype: Library (with Resume and Open or import), Import from Rise (mapping report from
the real exports), Course page (cover edited in place, lesson rows, course details), Lesson editor, Theme,
Learner preview (Desktop, Tablet 768 px, Phone 375 px, with My workbook), Export, Checks, and Saving and
recovery. Each lesson opens with a banner image whose alternative text is set in the lesson panel.

### From the interface specification

Adopted: Resume to the last lesson and block; named device controls with 768 and 375 px widths; export framed
by destination with output-specific next steps; checks grouped by effect with affected outputs; Go to issue
focusing the field; the five save states and the conflict choices; keyboard and menu alternatives to every
drag; the 1200 and 900 px breakpoints; a skip link to the lesson; staged delivery behind an instance setting;
acceptance scenarios AC-01 to AC-04 and the pilot usability targets; handoffs to OpenStage Assess (spreadsheet
import), Package Doctor (after SCORM), and PDFRemediator (after PDF).

Changed: the palette keeps the OpenScroll icon's navy and teal rather than a new green accent, and the
library keeps the name Library. Schema 4 comes first, as above.

## Blocks from OpenStage Author and OpenStage Guide

Both siblings were surveyed read-only (`openstage-author`, `OpenStageGuide`, and the older `OpenStage-Guide`
add-in). Author is slide-based: triggers, layers, object states, timed builds, and animations only make sense
on a fixed canvas and are left out. Its self-contained objects translate well, and its player already has a
one-column "reflow" mode. Guide works in Word, but its cues and forms map cleanly to learner-response blocks.

**Proposed for this build** (all are in the prototype and work there):

| Block | Learner does | Comes from |
| --- | --- | --- |
| Learning objectives | Reads outcomes, each with an optional Bloom level | Guide objectives and design desk |
| Table | Reads rows and columns with real header cells | Author data table; Rise table |
| Reflection | Writes a response; can reveal a sample answer | Guide Ask/Discussion; Author free-text reflection |
| Activity | Follows timed steps; writes in a response box | Guide activities (46 in its catalog) |
| Checklist | Ticks items; progress is saved | Guide checklists |
| Self-assessment | Rates statements; sees a total and what it means | Guide self-scored instruments |
| True or false | Judges a statement | Author and Guide question types |

Responses from the four learner-response blocks also collect on a **My workbook** page in the player, which
learners can print or save, following Guide's participant workbooks. Saved responses need care in SCORM 1.2,
whose suspend data holds about 4,000 characters for the whole course; courses with long written answers
should export as SCORM 2004.

**Also in this build, in later waves** ([BLOCK-BUILD-PLAN.md](BLOCK-BUILD-PLAN.md)): branching scenario with characters (Author's scenario object and character
packs), hotspot question, short answer and numeric questions, survey (Likert, unscored), action plan grid,
course glossary with A to Z search, results summary and certificate, embedded YouTube or Vimeo with a
transcript, audio description on video, interactive video checkpoints, software practice from OpenStage
Capture recordings (Watch, Try, Test), ordering, and question banks drawn from `.openassess` files.

**Formats to share:** Guide already writes `.openscroll` schema 3 files (`src/design-storyboard.mjs`), so
schema 4 must keep importing them and Guide should learn schema 4 later. Author's question CSV (Type, Question,
A to H, Correct, Points, Attempts, feedback) should match OpenScroll's spreadsheet import. WebVTT captions
(with Author's NOTE marker for unreviewed captions), QTI import, xAPI and cmi5 output, and XLIFF translation
already exist in Author and are candidates to share through openstage-core. Guide's 14 cue icons are
CC BY-NC-SA, which is not compatible with this Apache-licensed project unless their author relicenses them.

## Technical approach

- **Keep the TypeScript client and APIs.** Reuse the save controller, revision checks, recovery drafts,
  snapshots, schemas, learner player, and exporters. Replace the page-of-forms shell with the workspace.
- **No UI framework.** The prototype's pattern (state object, render functions per pane, delegated actions,
  targeted re-render of one block) is enough and keeps the dependency list short.
- **Rich text engine: ProseMirror (MIT).** It enforces a schema that matches the stored HTML subset, keeps
  the caret and IME composition stable during autosave, and has field-level undo. The prototype's
  `execCommand` bar is a stand-in only.
- **Icons: Lucide (ISC),** imported per icon at build time.
- **Rise importer, server side.** Accept a Rise web export ZIP with the existing archive safety checks (size,
  path, type limits). Decode `runtime-data.js`, map blocks to schema 4, carry `content/assets/` files, convert
  the theme, sanitize all HTML, and return a report (exact, adjusted, needs review) before anything is saved.
  Images and attachments that arrive without alt text or descriptions land in Checks.
- **Fixtures.** The owner's courses are private content and stay out of this public repository. Commit
  synthetic Rise-shaped fixtures; run the full-fidelity check locally against the five real exports
  (target: all 1,017 blocks import, and their text and answers round-trip).

## Delivery stages

| Stage | Deliverables | Done when |
| --- | --- | --- |
| 1. Format | Schema 4, sanitizer, migration of v1 to v3 files and stored courses, renderer and HTML/SCORM/PDF updates for the new fields | Old projects round-trip unchanged in meaning; new fields render in every output |
| 2. Rise import | Server importer, import report, library entry point | The five exports import with every block mapped and nothing silently dropped |
| 3. Workspace shell | Library with Resume and Open or import, course page, course details, save and conflict UI, behind a reversible instance setting | Create, reopen, duplicate, revise, and recover old and new projects |
| 4. Lesson editor | Canvas, selection, toolbar, inspector, block picker, ProseMirror text, keyboard reordering, workspace undo | AC-01 passes keyboard only |
| 5. Delivery | Theme studio, learner preview with return to position, Checks, Export | AC-03 and AC-04 pass; both SCORM editions re-verified in Brightspace |
| 6. Release | Compatibility fixtures, migration rehearsal on a copy of production data, accessibility and usability sessions, updated Quick Start, VPS cutover | Pilot targets met; zero accessibility blockers |

This build now includes every block above, the seven new ones and all the "next" ones.
[BLOCK-BUILD-PLAN.md](BLOCK-BUILD-PLAN.md) specifies each block, the shared foundations they need, and how
they extend these stages to nine, with Release last. Later: charts and other Rise-only extras, graded quizzes
as outline items, and the shared OpenStage accessibility rules (A11Y-1) for Checks.

## Deployment

The live instance runs on the owner's VPS. Schema 4 changes stored course data, so the cutover follows the
backup-first plan in `DEPLOYMENT-HANDOFF.md`: record the running installation, take and verify a backup,
migrate with the migrator role, keep the previous image pair for rollback, and ship the new workspace behind
the instance setting so the current editor stays available until the new one is accepted. The hostname,
access method, and current image pair are needed before that work starts.

## Open questions

1. Approve schema 4 ahead of the UI work?
2. May the five courses be used as local, uncommitted import fixtures (never pushed)?
3. Which LMS besides Brightspace should exports be tested in?
