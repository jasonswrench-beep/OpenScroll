# Assessments and completion

Step 9 adds multiple choice, multiple response, fill in the blank, matching, and sorting. Find them under **Assessment** in the block library. Questions use the same outline save, recovery, undo/redo, duplication, preview, and standalone HTML publishing workflow as the other blocks.

## Authoring questions

Edit the prompt and choices, matching terms, or sorting items directly in the lesson. Open block settings to set the answer key and feedback, add/remove entries, choose scoring and completion rules, and set retry limits. For sorting, the authored item order is the correct order; the learner starts with the reverse order and moves items using labeled buttons. Matching uses native select controls rather than requiring dragging.

| Format | Answer rule |
| --- | --- |
| Multiple choice | Exactly one selected choice matches the answer key |
| Multiple response | The selected set matches every correct choice, with no extra choices |
| Fill in the blank | A typed answer matches one accepted answer; Unicode NFC normalization, trimmed/collapsed whitespace, and optional case sensitivity apply; punctuation remains significant |
| Matching | Every term receives its correct distinct match |
| Sorting | Every item appears in the authored order |

There is no partial credit. Choice/pair/sorting entries must be distinct and nonempty to publish; matching and sorting need at least two entries. Fill in the blank needs a nonempty accepted answer. Empty/incomplete drafts can be saved, but publishing rejects unusable questions with an actionable message. Preview disables an unconfigured question. Switching question formats preserves hidden content and settings, so review the answer key after changing formats.

Correct and incorrect feedback are plain text. Each valid submission shows its outcome, author feedback, and attempt count. Incomplete or malformed responses do not spend an attempt. Feedback receives keyboard focus; retry returns focus to the question. Form controls have native fieldsets, labels, keyboard behavior, and a sorting alternative to dragging.

## Scoring and retries

Questions start as optional, unscored practice. Choose **Include in course score** for graded questions, and assign 1–100 points. The course outline's **Course passing score (%)** sets the threshold. Points for a question are all-or-nothing; a correct attempt earns its full value. The best correct result is retained, and a correct question is no longer retryable.

The score totals every graded question across the course. Unsubmitted questions count as zero points, and the status remains **incomplete** until every graded question has a valid submission. Then the exact weighted ratio determines **passed** or **failed** against the threshold. The displayed percentage is rounded to one decimal; threshold comparison uses the unrounded points ratio. With no graded questions, there is no assessment result banner.

**Maximum attempts** accepts 0 for unlimited or 1–20 for a finite limit. Failed answers can be retried while attempts remain. A retry preserves the previous answer for editing and keeps the last submitted outcome visible until resubmission. Unlimited mode has a defensive per-question storage bound of 10,000 submissions. A fresh course reset clears attempts and scores.

## Completion is separate from passing

**Require this question for lesson completion** makes it a required task. The independent **Question completion** rule chooses:

- **Submit a valid answer:** a wrong submission satisfies question completion, while earning zero points.
- **Answer correctly:** a correct result is required before the question is complete.

Continue's previous/all-previous rules use the same question completion rule, even if a question is otherwise optional. Assessment questions cannot be bypassed with Mark as reviewed. Lesson completion also checks required questions directly, even without a Continue block.

A course can be **complete and failed**, or have a passing score before all lessons are marked complete. Optional graded questions can also leave a completed course's assessment status incomplete until answered. The player displays lesson progress and assessment results separately. Completing a lesson does not manufacture a passing score; improving a retry score does not clear prior lesson completion.

With finite attempts and an answer-correctly requirement, exhausting attempts can block further progress. The settings panel explains this. The learner can use **Reset progress** to start a new course attempt; this clears the entire course's local progress, not just that question. Exported courses confirm before clearing saved progress. Preview practice state resets immediately and never changes the authored course.

## Required interactions

Accordion, tabs, flashcards, process, and labeled graphic settings offer **Require every item to be explored**:

| Interaction | Evidence recorded |
| --- | --- |
| Accordion | Each item opened |
| Tabs | Each panel displayed; the initially visible panel counts |
| Flashcards | Each answer revealed |
| Process | Each step displayed; the initial step counts |
| Labeled graphic | Each marker description opened |

This records unique item visits, displays an explored-items count, and blocks Continue/lesson completion until satisfied. Native buttons, disclosure controls, and tab keyboard navigation remain available. Mark as reviewed cannot bypass these requirements. Gates update without rebuilding the interaction, so keyboard focus stays on the active control. Closing a panel does not erase its visit. The recorded exploration resumes, although the active/open visual panel itself is transient.

Ordinary content keeps its existing review acknowledgements. Galleries, timelines, and audio/video do not gain automatic end-of-playback requirements in this step. Exploration and acknowledgement are not proof of comprehension.

## Saving, HTML, print, and learner state

Answer keys, feedback, point values, retry rules, required flags, and course passing score are authored portable data. Learner answers, attempt counts, best results, and visits are separate. They never enter the editable project, server course revision, browser author recovery draft, or a publication snapshot.

Preview uses isolated in-memory learner state. Static HTML uses the same player and optionally persists a version 2 learner snapshot in local storage under the course fingerprint. It includes partial answers, last/best submitted answers, attempts, unique visits, gate releases, lesson completions, and the current lesson. Scores are recomputed from validated answers on restore; stored score numbers and unknown/hidden block references are not trusted. The player can still read version 1 progress snapshots and safely normalizes incompatible/impossible state. Storage failure is reported while the current session remains usable.

The storage key namespace remains stable for old snapshots; the version inside the payload distinguishes their shapes. Snapshot reads are bounded to 4 MiB and individual responses/attempts/visits have limits. Data is local to the browser and origin; changed authored content gets a different fingerprint. Clearing site data or resetting the course removes that attempt's progress.

Question responses and scores are client-side data. Published answer keys are part of the public course source, and learners can edit local storage. This is not secure examination, central reporting, or LMS persistence. SCORM mapping and tested LMS behavior remain Step 10.

Print styles omit active controls and show a static question/option representation, including matching choices and a fill-in answer line. They do not add a configurable answer key or publish an accessible PDF; those are Step 11 work. Continue still limits which content has been rendered for browser printing.

## Format compatibility and implementation

Portable **schema version 3** adds assessment blocks and optional `requiredInteraction` flags. Supported version 1 and 2 projects migrate on copies with content, IDs, assets, and narration intact. Frozen schemas and starter fixtures remain available. New downloads target v3. Stored rows are not rewritten merely by reading. The server recognizes exact unchanged legacy v1/v2 pending-save acknowledgement digests; stale/modified requests still conflict. Database migration 2 remains current.

`src/shared/assessment.ts` defines readiness/answer validation and grading. `src/player/state.ts` owns attempts, drafts, exploration, completion, score aggregation, and resume normalization. `assessment-player.ts` supplies accessible learner forms; `assessment-settings.ts` connects authored rules to the existing editor. No new npm dependency, service, secret, or setup review is required. Cloud development is sufficient for this step.

See [Step 9 validation](STEP-9-VALIDATION.md). Manual screen reader testing, non-Chromium verification, SCORM, and PDF publishing remain pending.


## Learner flow improvements after Brightspace recordings

Learners may submit each answer for immediate feedback or use **Submit all answers** at the lesson footer. The latter validates every pending required/gated response before submitting any, points to the first incomplete question, and preserves drafts. Sorting uses the visible order; no extra move is required if the learner wants to submit that order. Correctness, points, retry limits and required-correct rules are unchanged. Submitted questions show feedback instead of an inactive Submit button.

Matching uses each choice once. Selecting a match already assigned elsewhere swaps the assignments (or clears the other assignment if the current row was empty), updates both selects immediately, and announces the change. It does not choose correct answers. Each row can still be wrong, but learners cannot get stuck repeatedly submitting duplicate matches without seeing why.

The completion footer names remaining required questions/interactions/reviews, with links that focus the relevant content. Exhausting attempts on a submitted-only question explicitly says the response is recorded and other questions may still need submission. A required-correct exhausted question still blocks completion; this rule has not been relaxed.

A terminal Continue and lesson completion are one action. For intermediate lessons that action also opens the next lesson; for the final lesson it completes the course. Interior gates and all authored requirements are preserved. The test course therefore needs one action to advance after exploration, and one bulk submission plus one completion action after filling in the five responses.

## Spreadsheet authoring

Use **Import questions** inside a lesson to download Excel/CSV templates and preview a batch before insertion. OpenStage question-board CSVs are compatible; actual assessment weights are controlled by Points or the import default, not the board Value. See [spreadsheet import](QUESTION-IMPORT.md) for supported types, mapping and limits. Imported questions are normal editable blocks and retain the grading, persistence, preview and export behavior above.
