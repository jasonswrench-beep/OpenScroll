# Scenarios

A scenario is a branching conversation. Learners read lines spoken by the course's characters, make choices, and
reach one of several endings. It is the Wave E block of the [block build plan](BLOCK-BUILD-PLAN.md).

## Characters

Characters belong to the course (Course resources, Characters). Each has a name, an optional role, and up to 20
poses: pictures you upload, such as calm, pleased or worried, each with a description. Screen readers read the pose
description when the character speaks, so describe the expression and anything that matters ("Sam frowning at the
report"). Checks warns about a pose with no description.

OpenScroll does not ship character art. Authors upload their own pictures; reusing OpenStage Author's character
packs, or drawing new ones, waits for the owner's decision on their licence.

## Writing a scenario

Add a Scenario block, then choose Open the scenario editor in its settings. A new scenario starts with a short
example conversation to edit.

- **Scenes** group steps and can have a background picture (decorative) and a title shown above the conversation.
- **Steps** are one of four kinds: *a character speaks* (choose the character and pose), *narration*, *the learner
  chooses* (up to six options, each with feedback and, when scoring is on, points), or *an ending* (good, neutral or
  poor outcome).
- **Links** are chosen from menus: "After step 3, go to" for lines and narration, "If chosen, go to" for each
  option. No dragging. The flag button marks the step the scenario starts with.
- **Route check** (beside the editor, and in Checks) lists steps that lead nowhere, options without a destination,
  steps that can never be reached, a missing start, and scenarios with no reachable ending. Each blocks export or
  warns as appropriate.
- **Undo and Redo** (Ctrl+Z, Ctrl+Y) cover every change in the scenario editor.

Block settings choose whether learners can take back their last choice, whether "Your path" appears at the end, and
whether choices are scored, with the points needed to pass.

## For learners

The conversation appears as a column of lines, each with the speaker's pose and name. Continue moves on; choices are
buttons; the learner's choice and its feedback appear in the conversation, and focus moves to the newest line. At an
ending, "Your path" lists the choices made with their feedback (and points, when scored), with Start the scenario
again and, when allowed, Go back to my last choice.

The path is kept with the learner's progress, so the conversation resumes where it was left. A required scenario is
finished by reaching any ending. Each finished path is sent to the LMS as one record (`performance` in SCORM 1.2,
`other` in 2004): correct or incorrect against the pass mark when scored, otherwise neutral.

## PDF

The PDF prints the scenario as a numbered script: each line with its speaker, each choice with "If you choose …, go
to 7", and each ending with its outcome, starting from "Start at step N".
