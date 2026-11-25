# Quick Start: building a course in OpenScroll Studio

This guide takes an author from an empty library to a course in the LMS. It assumes the studio is turned on for
your installation (`OPENSCROLL_STUDIO=on`, see [STUDIO.md](STUDIO.md#turning-it-on)) and that you are signed in
with an approved account. The classic workspace at `/app/` opens the same courses, so you can switch at any time.

## 1. Start a course

Open `/studio/`. Choose **New course** and pick where it starts:

- **Blank** for a course with one section and one lesson.
- **From a template** for a starter course with example lessons.
- **From an OpenScroll project** to open an `.openscroll` file downloaded from any OpenScroll installation.
- **From a Rise 360 export** to bring in a course exported from Rise as a website ZIP. The
  [import report](RISE-IMPORT.md) lists what came across, what changed and what needs your attention.

The course opens on its course page. Click the title or description to edit them in place.

## 2. Plan the outline

On the course page, add sections and lessons, type their titles in place, and reorder them with the arrow
buttons (focus stays on the row you moved). **Course details** holds the author, language, lesson order,
passing score and cover image with its alternative text. **Open the theme studio** sets the accent colour,
cover layout, lesson header, body text and reading width, and tells you whether the accent has enough contrast.

## 3. Write a lesson

Choose **Edit lesson**. The lesson appears as learners will see it.

1. With no block selected, the panel on the right shows the lesson's banner and its learning objectives.
2. Choose **Add block** to open the picker. Search by name or browse the categories (Text, Images, Structure,
   Media, Interactive, Activities, Assessment). The new block goes after the selected one.
3. Click into any text to type. Ctrl+B and Ctrl+I add bold and italic.
4. Select a block's name in its bar to open its settings: **Content**, **Style**, **Behavior** and **Access**.
   The Access tab is where alternative text and narration scripts go, and it explains what a screen reader
   will announce.
5. Undo with Ctrl+Z and redo with Ctrl+Y.

The save button in the top bar shows the true state. "Saved" means the server has your work. If the same course
is changed in another tab, the conflict banner lets you keep both versions; nothing is overwritten.

## 4. Add what belongs to the whole course

**Course details, Open course resources** holds the glossary, question banks, characters for scenarios and the
certificate. A "Questions from a bank" block draws questions at random for each learner; a results block shows
the score, the questions missed and the certificate. See [COURSE-RESOURCES.md](COURSE-RESOURCES.md) and
[SCENARIOS.md](SCENARIOS.md).

## 5. Check and preview

- **Checks** in the top bar lists anything that stops an export, anything worth fixing, and anything that needs a
  person's judgment. **Go to issue** takes you to the block and the field.
- **Preview** opens the real learner player at the current lesson, at desktop, tablet or phone width.

## 6. Export

Choose **Export** and pick the file:

| File | Use it for |
| --- | --- |
| SCORM 2004 4th Edition | An LMS. Recommended when the course has written responses, because it keeps more of each learner's work. |
| SCORM 1.2 | An LMS that only accepts SCORM 1.2. |
| Website ZIP | Any web server, without an LMS. Progress is kept in the learner's browser. |
| PDF | A printable or archived copy, with an optional answer key. |
| OpenScroll project | A complete editable copy you can keep or open elsewhere. |

Test a SCORM package in your LMS before releasing it to learners: open it as a learner, answer a few questions,
leave, come back and check that it resumes where you left off and records the score.

## Where to go next

- [STUDIO.md](STUDIO.md): every part of the studio in detail.
- [LEARNER-RESPONSES.md](LEARNER-RESPONSES.md): what learners write, where it is kept and My workbook.
- [MEDIA-AND-INTERACTIONS.md](MEDIA-AND-INTERACTIONS.md): video, audio, captions and interactions.
- [SCORM-PUBLISHING.md](SCORM-PUBLISHING.md): LMS reporting in detail.
