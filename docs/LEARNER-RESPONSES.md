# Learner responses and My workbook

Reflection, activity, checklist, self-assessment and survey blocks collect something from the learner: written text,
ticks or ratings. These responses are learner progress, like question answers. They are never written into the
course file, the library, or the authoring database.

## What each block keeps

| Block | Kept | Counts as done when required |
| --- | --- | --- |
| Reflection | The text (up to 20,000 characters) | At least the minimum number of words (at least one word) |
| Activity | The text in the writing box, or "done" when the activity has no box | Something written, or marked as done |
| Checklist | Which items are ticked | Every item ticked |
| Self-assessment | One rating per statement | Every statement rated |
| Survey | A rating, choice or comment for each question | Every rating and choice question answered (comments are optional) |

A block that is not required never holds up the lesson. A required block appears in the lesson's "To finish this
lesson" list until its response meets the rule, and a Continue button set to wait for the blocks above it waits for
it too. Text is kept after a short pause in typing and whenever the learner leaves the box; ticks and ratings are
kept at once.

A self-assessment total counts each rating by its position on the scale, starting at 1, so three statements on a
four-point scale total between 3 and 12. The first score band whose range contains the total is shown.

## Where responses are saved

- **Website export.** With the rest of the learner's progress, in that browser's local storage.
- **SCORM 2004.** In the LMS resume data (`cmi.suspend_data`, up to 64,000 characters), with the rest of the
  progress.
- **SCORM 1.2.** In the LMS resume data when they fit within its 4,096 characters. When written responses would
  not fit, the player still saves all other progress to the LMS, keeps the responses on the learner's device, and
  says so in the LMS status line. Reopening the course on the same device brings them back; another device will not
  have them. Use SCORM 2004 for courses with long written responses.
- **Preview.** Practice progress in the preview stays in the preview and is discarded when it closes.

Every response is also sent to the LMS as an unscored interaction record (see
[per-question reporting](SCORM-PUBLISHING.md#per-question-reporting)), so the LMS keeps a record even when the
resume data cannot hold the response. SCORM 1.2 records keep only the first 255 characters of written text; SCORM
2004 keeps up to 4,000.

Resume data from earlier exports (checkpoint version 2, without responses) still opens: the learner simply starts
with no responses.

## My workbook

When a course has any reflection, activity, checklist or self-assessment block with "Show in My workbook" on, the
learner sees a My workbook button at the top of the course. My workbook lists every such block, lesson by lesson,
with the learner's response or "Not answered yet", and offers:

- **Print or save as PDF**, through the browser's print dialog. The print style leaves out the course header,
  outline and buttons.
- **Download as a text file**, a plain-text copy made in the browser.
- **Back to the course**, which returns to the lesson.

Nothing in My workbook leaves the learner's browser unless they print or download it.

## In the PDF reading copy

The PDF shows each prompt with ruled lines to write on, checklists with empty boxes, and self-assessments as a
table of statements and ratings followed by the score bands. When the answer key is included, reflection sample
responses are listed under "Sample responses".
