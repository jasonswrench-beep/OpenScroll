# OpenScroll Studio

OpenScroll Studio is the redesigned authoring workspace at `/studio/`. It is being built in stages (see the
[redesign plan](REDESIGN-PLAN.md) and the [block build plan](BLOCK-BUILD-PLAN.md)). The classic workspace at `/app/`
stays available and keeps every current tool while the studio grows; both work on the same library and the same
saved courses, so an author can move between them at any time.

## Turning it on

The studio is controlled by one instance setting:

| Setting | Values | Default |
|---|---|---|
| `OPENSCROLL_STUDIO` | `on` or `off` | `on` in development, `off` when `NODE_ENV=production` |

`deploy/compose.yaml` passes `OPENSCROLL_STUDIO=off` unless the operator sets it in `.env.production`. When it is
off, `/studio/` sends approved authors to the classic workspace and `GET /api/features` reports
`{"studio": false}`. Any other value stops the server at start-up with a clear message, so a typo cannot quietly
change what authors see. The setting changes only which pages are offered; the API, the library and the course
format are the same either way.

## What is in the studio now

- **Library**: course cards with cover, lesson and block counts, accent colour and last edit date; search, sort,
  and grid or list view (remembered per browser); a "Pick up where you left off" strip for the last course and
  lesson opened; New course (blank, from a template, from an `.openscroll` project, or from a Rise 360 export with
  its [import report](RISE-IMPORT.md)); and Rename, Duplicate, Download project and Delete for each course.
- **Course page**: the course cover rendered with the course theme, with the title and description edited in place;
  the lesson outline with sections, per-lesson block, interaction and question counts, inline titles, reordering
  that keeps keyboard focus on the moved row, Duplicate, Move to section and Delete; and a details panel for
  author, language, lesson order, pass mark, cover image and alt text, and theme (accent colour, cover layout,
  lesson header, body font, reading width).
- **Lesson editor**: the lesson shown as learners see it, on the course's own paper and theme, with text edited in
  place (see below).
- **Saving**: the save button in the top bar always shows the true state (Saved, Changes pending, Saving, Save not
  confirmed, Conflict). Edits are revision-checked, kept in this browser as a recovery draft until the server
  confirms them, and never overwrite a change made in another tab: the conflict banner offers Download my edits,
  Save as a separate copy, or Reload saved course. Snapshots are one click away from the save button.
- **Export**: SCORM 1.2, SCORM 2004 4th Edition, website ZIP, PDF and editable project, all from the current edits.

## The lesson editor

Edit lesson opens the lesson on the course paper: the banner, the title, then each block exactly as learners see
it. Click into any text to edit it; Ctrl+B and Ctrl+I format formatted text.

- **Block bar.** Every block has a small bar with its number and name (select it to open its settings), Move up,
  Move down, Duplicate and Delete. Blocks inside columns also have Move to the column on the left or right.
- **Adding blocks.** Add block (top bar, between blocks, or at the end) opens the picker: search, categories
  (Text, Images, Structure, Media, Interactive, Activities, Assessment) and a description of every block. A
  new block is inserted after the selected one and its first text is ready to type.
- **Inspector.** The panel beside the lesson has four tabs. *Content* holds lists of items, rows, steps, ratings,
  score bands, images and answers; *Style* the template, width, spacing and background; *Behavior* what learners
  must do (required responses, opening every item, Continue rules); *Access* alternative text, decorative
  images, narration scripts, and a plain description of what assistive technology announces for that block.
  With nothing selected, the panel shows the lesson's own settings: banner (none, the course cover, or its own
  image, with alternative text) and lesson objectives with optional thinking levels.
- **Columns.** Two or three columns (equal, wide and narrow, or narrow and wide) hold text, images, lists,
  notes, quotes and link buttons. Each column has its own Add button, and its blocks are selected and edited like
  any other. Changing the column count keeps every block.
- **Region editor.** Labeled graphic markers, hotspot areas and software practice targets can be dragged on the
  image, moved with the arrow keys (Shift moves further; Alt with arrows resizes an area), or placed with number
  fields.
- **Timed cues.** Captions, audio descriptions, chapters and checkpoints use one cue editor beside a video preview;
  see [MEDIA-AND-INTERACTIONS.md](MEDIA-AND-INTERACTIONS.md#wave-c-audio-description-interactive-video-embedded-video-and-software-practice).
- **Undo.** Undo and Redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) cover every block change in the lesson for the
  session. Typing in inspector fields uses the browser's own undo while the field has focus.
- **Narrow screens.** Below 1200 px the panel becomes a sheet along the bottom of the window, so the selected
  block and its settings stay on screen together.

Wave A adds learning objectives, tables, reflections, activities, checklists, self-assessments, true or false
questions and columns. Learner responses to the activity blocks are described in
[LEARNER-RESPONSES.md](LEARNER-RESPONSES.md). The classic workspace can show and edit the text of the new blocks,
but their settings are only in the studio.

## Course resources

Course details, Open course resources has three tabs: the glossary (terms, other names, definitions, CSV import and
term links), question banks (new bank, OpenAssess import, spreadsheet import, Edit questions) and the certificate.
Edit questions opens the bank in the lesson editor with the picker limited to questions. See
[COURSE-RESOURCES.md](COURSE-RESOURCES.md).

## Checks, preview, theme and export

- **Checks** (top bar) lists what blocks export, what deserves a fix, and what needs a person's judgment, each with
  its lesson, block and the outputs it affects. The count on the button is the blocking issues, or the warnings
  when nothing blocks. **Go to issue** opens the lesson, selects the block, opens the right inspector tab and puts
  the cursor in the field. The server uses the same checks before building any export. Checks never stop saving.
- **Preview** opens the real learner player at the lesson being edited, at desktop, tablet (768 px) or phone
  (375 px) width, with a lesson menu and Restart. Practice progress stays in the preview; closing returns to the
  editor where you were.
- **Theme studio** (Course details, Open the theme studio) sets the accent colour, cover layout, lesson header,
  body text, reading width and lesson order beside a live preview of the cover and a sample lesson. It reports the
  accent's contrast: buttons use white or dark text, whichever reads better, and a light accent is darkened for
  headings and links on white.
- **Export** names how many issues block export (with a link to Checks), recommends SCORM 2004 for courses with
  written responses, and gives the next step for each file: upload to the LMS (test in Package Doctor first), put
  the website on a server, or check the PDF's tags in PDFRemediator. The editable project can always be downloaded.

## Addresses

| Address | Shows |
|---|---|
| `/studio/#library` | the library |
| `/studio/#course=<id>` | a course page |
| `/studio/#course=<id>&lesson=<lesson id>` | a lesson in the editor |

The browser Back button moves between these. Leaving a course with unconfirmed edits asks first.

## Accessibility

Every studio page has a skip link, one `h1`, labelled landmarks, visible focus, and announcements for saves and
list changes through a polite live region. Dialogs are native modal dialogs that return focus to the control that
opened them. Icon-only buttons carry text labels. The library and course page reflow to one column below 1200 px
and have no horizontal scrolling at 390 px. The browser checks in `tests/browser/studio.spec.ts` run axe
(WCAG 2.2 A and AA) on the library and the course page.
