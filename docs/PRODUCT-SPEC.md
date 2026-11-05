# OpenScroll product specification

Status: product baseline, 2026-10-22. Steps 1–9 cover planning, the application foundation, portable files, accounts, the private library, course organization with autosave, core block authoring, learner preview, standalone HTML publishing, and media/interactive blocks. Assessments, scoring, and required completion rules are implemented; SCORM and PDF remain in later steps.

## Confirmed product scope

OpenScroll is a browser-based, block-based eLearning authoring tool in the OpenStage product family. Authors compose responsive scrolling lessons from prebuilt blocks rather than placing objects on slides.

The first release must publish standalone HTML, SCORM, and PDF. Authors have accounts on the operator's website. Initial production hosting is Jason Wrench's Hostinger VPS. Other organizations should eventually be able to host their own instance, so installation and configuration must support that direction from the beginning.

OpenScroll is not an LMS. Learner enrollment, hosted course administration, and centralized learner reporting are outside scope. Published SCORM courses delegate tracking to the receiving LMS. Author accounts do not imply learner accounts.

## Sources and interpretation

This baseline draws on the conversation, `Block Based Elearning Tool.docx`, and the two reference recordings. The replacement first recording, `Untitled Project (2).mp4`, is approximately five minutes; the second, `Untitled Project (1).mp4`, is approximately 2 minutes 51 seconds. Sampled frames were inspected across both, not every interaction frame or audio track.

This specification defines OpenScroll's scope. Implementation and deployment require separate authorization.

The related repositories, `jasonswrench-beep/openstage-author` and `jasonswrench-beep/OpenExplainer`, inform family conventions. Their desktop shells and repository-specific rules are not automatically OpenScroll requirements. Build original UI, starter content, templates, and implementation; do not copy reference-product assets or proprietary code.

## Recommended family principles

Carry forward accessible authoring, portable editable files, documented formats, optional AI, and permissively licensed dependencies. The existing repository is Apache-2.0. Keep third-party notices and review licenses before adopting dependencies.

Target WCAG 2.2 AA for the editor and learner player, using ATAG guidance for authoring accessibility. Keyboard access, meaningful focus, screen reader labeling, and non-color status indicators are acceptance requirements, not post-release polish. Never make essential controls hover-only. Respect reduced-motion preferences. Treat accessibility warnings as guidance rather than preventing an author from saving their work.

## Content model

- A course owns metadata, a theme, ordered sections, lessons, and referenced assets.
- A section groups and orders lessons; it does not contain learner-facing blocks itself.
- A lesson contains an ordered sequence of typed blocks.
- A block has a stable ID, type, variant, content, appearance, and applicable interaction/completion settings.
- An asset has a stable identity, media type, metadata, and referenced file. Accessible descriptions belong to the context where the asset is used.
- Assessment success and course completion are separate concepts.

An editable download packages versioned course data and assets into one portable file. Step 3 defines `.openscroll` ZIP packages and the version 1 schema in [FORMAT-SPEC.md](FORMAT-SPEC.md). Server records and exported files must not contain deployment-specific asset URLs as the only asset identity.

## Author workflow and screens

### Account and library

Authors register when registration is enabled, sign in, reset passwords, and sign out. The library supports creating, opening, renaming, duplicating, searching, sorting, and deleting owned courses, with grid and list views. Define deletion confirmation and retention before implementing deletion. Course and asset access is private to the owner until an explicitly supported sharing feature is added.

### Course outline

Edit title, description, cover, and displayed author information. Add, rename, duplicate, delete, and reorder sections and lessons. Navigate directly into a lesson. Show save state and actionable failure messages. Do not imply a successful save until the server confirms it.

### Lesson editor

Display a scrolling canvas close to the learner rendering. Browse visual block previews in a library, use shortcuts, or insert between existing blocks. Newly inserted blocks have original editable starter content. Edit ordinary text in place; use labeled settings panels for structured content and interaction settings.

Support movement, duplication, deletion, appearance settings, and content-preserving switches between compatible variants. Provide keyboard alternatives to dragging. Undo and redo must have defined boundaries and must not silently resurrect deleted server assets or discard confirmed saves.

### Preview and publishing

Preview desktop, tablet, and phone layouts using the shared player. Preview interaction state is isolated from authored content. Return to the relevant editing context. Publishing selects an output and reports validation errors and export progress. Editable project download remains distinct from learner-facing publishing.

## Block delivery groups

| Group | Blocks | Delivery |
| --- | --- | --- |
| Core composition | Heading, paragraph, list, statement, quote, image, image and text, divider, spacer | Step 6 |
| Flow | Continue, lesson navigation, completion indicators | Step 7 |
| Media | Gallery, audio, video, attachment, button | Step 8 |
| Interactive | Accordion, tabs, flashcards, process, timeline, labeled graphic | Step 8 |
| Assessment | Multiple choice, multiple response, fill in the blank, matching, sorting | Step 9 |
| Reuse and presentation | Themes, course templates, saved block groups, composed layouts | Step 12 |

Tables, charts, surveys, additional variants, and rich composed layouts enter the backlog with explicit acceptance criteria. Arbitrary code and uploaded web applications are deferred until isolation and export behavior are designed.

Every block needs editing, validation, save/reopen, keyboard and screen reader behavior, responsive rendering, and a defined HTML, SCORM, and PDF representation. A catalog entry without these capabilities is not a completed block.

## Output requirements

### Standalone HTML

Export a ZIP with relative asset references and a self-contained player suitable for a static web server. Exported courses must not need an OpenScroll account, API, or running instance. Clearly identify any author-selected external media dependencies. Direct `file://` execution is not promised; validate served output.

### SCORM

Recommend SCORM 1.2 first, then a specifically documented SCORM 2004 edition. Support launch, score reporting, completion, applicable success status, bookmarking, resume state, and session termination. Account for SCORM 1.2 storage and status limitations explicitly. Validate passing and failing attempts and interrupted sessions. A mock LMS passing is insufficient evidence of interoperability with a real LMS.

### PDF

Use a deliberate print layout with cover, contents, headings, page numbers, captions, transcripts, and links. Flatten tabs and accordions into ordered sections; render flashcards as prompts and responses; describe dynamic interactions; represent media with descriptions and available transcripts and links. Make assessment-answer inclusion configurable. Establish and test document tagging and reading order; do not claim PDF accessibility from visual inspection alone.

## Saving, portability, and reliability

Autosave must expose pending, saving, saved, and failed states and protect edits during recoverable failures. Define multi-tab conflict behavior before enabling concurrent edits. Validate archive paths, sizes, types, versions, and references on import. Reject unsupported future versions safely. Migrations must preserve the original data or a recoverable backup.

## Deferred scope

AI assistance and text import; question banks; review comments; co-authoring; localization; suite integrations; custom scripting. AI must not be required for manual authoring. The full reference-product feature catalog is not the first-release acceptance checklist.

## Decisions to resolve at the relevant implementation step

1. Step 4 defines configurable registration, local outbox/production SMTP, verification defaults, and permanent course deletion. See [accounts and library](ACCOUNTS-AND-LIBRARY.md). Actual production email provider and broader privacy policy remain deployment decisions.
2. Resolved in Step 3: `.openscroll`, schema version 3 with non-destructive version 1/2 import, strict validation, and non-destructive future migrations. See [format specification](FORMAT-SPEC.md).
3. Browser/version support and screen reader test matrix (Steps 2 and 6).
4. SCORM 2004 edition and actual LMS test destinations/access (Step 10).
5. PDF generation engine and the verified accessibility target (before Step 11).
6. VPS resources, domain, storage quotas, backup destination, and deployment access (Step 13).
7. Whether audio narration for all readable text is a launch requirement or later family feature; transcripts and captions remain required where relevant.

These decisions do not block starting the application foundation. Recommendations are provisional implementation defaults, not additional user-confirmed requirements.
