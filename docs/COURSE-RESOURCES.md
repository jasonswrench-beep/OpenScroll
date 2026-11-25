# Course resources, results and certificates

Course resources belong to the whole course rather than to one lesson. Open them from the course page (Course
details, Open course resources). They have three tabs.

## Glossary

Each term has a definition (formatted text) and, optionally, other names it goes by. Terms are kept A to Z.

- **Glossary block.** Lists the terms by letter, with letters to jump to and a search box (both optional). The list
  variant drops the letter headings.
- **Term links.** With "Link the first use of each term in every lesson" on, the player turns the first use of each
  term (or one of its other names) in a lesson's formatted text into a toggletip: a button that shows the definition
  below it and announces it. It works by keyboard and touch; nothing appears on hover only. Escape closes it.
- **Import.** A CSV file with the columns `term`, `definition` and `aliases` (other names separated by semicolons).
  Terms already in the glossary are skipped.
- **PDF.** The glossary block prints the whole glossary as a description list.

## Question banks

A bank holds questions of any kind OpenScroll supports. The **Questions from a bank** block draws a number of them at
random for each learner. The set is drawn once, when the learner first reaches the block, and kept with their
progress, so the same questions come back on resume and in the LMS. Each question keeps its own scoring, attempts and
feedback; scored bank questions count toward the course score once drawn, and the course result stays "incomplete"
until a learner has drawn and answered them. Every answered bank question is reported to the LMS like any other.

Bank questions are edited in the lesson editor (Edit questions), with the same canvas, inspector and undo, and the
picker limited to questions. Checks blocks export when a block names a missing or empty bank, or when a bank question
is not ready, and warns when a block asks for more questions than its bank holds.

**Importing an OpenAssess bank.** Course resources, Question banks, Import an OpenAssess bank reads a `.openassess`
file (format 1, read with [`@openstage/bank`](https://github.com/jasonswrench-beep/openstage-core/tree/main/packages/bank))
on the server and shows what can be imported before anything is added.

| OpenAssess | OpenScroll |
| --- | --- |
| Multiple choice, multiple response | Multiple choice, multiple response, with per-choice feedback when the bank has it |
| True or false | True or false |
| Fill in the blank (one blank) | Fill in the blank; more than one blank is listed as not imported |
| Short answer | Short answer (match) |
| Essay | Short answer, self-check against the model answer, not scored |
| Matching, ordering | Matching (2–20 pairs), ordering (2–20 items) |
| Numeric (exact, tolerance, range) | Numeric |
| Hotspot, calculated | Listed as not imported |

Points, the prompt and correct or incorrect feedback carry over. Pictures are not carried over and equations stay
as text; the report says how many. Questions can also be imported into a bank from a spreadsheet, with the same
columns as lesson question import.

## Certificate

With "Offer a certificate" on, a results block can show a certificate once a learner has finished every lesson and,
when the course is scored, reached the passing score. It carries the title, the learner's name as they type it, the
course title, the date, the issuer, the signer's name and title, and optionally a logo, a signature image and the
score. Learners print it or save it as PDF from the browser. The certificate is not verified by any service: a
website or SCORM export has no server to vouch for it.

## Results block

Shows the learner's progress, their score with the passing score and whether they passed, a table of scores by
lesson, and (optionally) the questions they missed, each with a button that goes to the question, and the certificate.
The PDF leaves it out, because results belong to each learner.

## Action plan block

A table the learner fills in: up to six columns, each text or a date, starting with a set number of rows and letting
the learner add rows up to a limit. The plan is kept with the learner's progress, appears in My workbook and is sent
to the LMS as an unscored record. When required, at least one row must be complete. The PDF prints the blank table.
