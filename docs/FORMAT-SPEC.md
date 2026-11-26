# OpenScroll editable project format

Version: **4** (versions 1–3 import supported). Extension: **`.openscroll`**. Content type: `application/x-openscroll-project`.

This is an editable authoring package, not a learner-facing HTML, SCORM, or PDF export. The format has no dependency on an OpenScroll server, account, database ID, domain, browser framework, or AI provider.

## Package layout

An ordinary ZIP contains exactly one UTF-8 `course.json`, followed by the assets listed in that document:

```text
course.json
assets/sample-image.png
```

There is no separate manifest: `course.json` is the manifest and course source. Canonical asset paths are `assets/<asset-id>.<extension>`. Original filenames are metadata only. Order in the document's arrays defines section, lesson, and block order; filenames do not.

The starter file is [examples/welcome.openscroll](../examples/welcome.openscroll). [src/project/sample.ts](../src/project/sample.ts) defines its original course text and tiny PNG fixture. It contains one section, two lessons, six blocks, and one asset. Its image exists to test portability, not as a finished course illustration.

## Document structure

[course-v3.schema.json](../schema/course-v3.schema.json) is the generated JSON Schema for structural validation. [src/shared/course.ts](../src/shared/course.ts) is the runtime source and also checks unique IDs, references, image compatibility, and aggregate limits. JSON Schema alone does not check those semantic rules.

The top-level object has exactly four properties:

| Property | Meaning |
| --- | --- |
| `format` | Literal `openscroll` |
| `schemaVersion` | Integer `3` on current writes; version `1`/`2` imports migrate on a copy |
| `course` | Course metadata, settings, theme, and ordered content |
| `assets` | Asset inventory with identities, media types, byte lengths, and SHA-256 hashes |

Unknown properties and unsupported block types are rejected rather than silently discarded. Strings are plain text; do not interpret them as HTML or executable code. Rich text will require a documented format extension.

### Course

Required metadata: `id`, `title`, `description`, `author`, `language`, `createdAt`, and `updatedAt`. Timestamps use ISO UTC datetime strings. Language strings are stored for later localization and narration; the validator currently bounds their length rather than enforcing the full BCP 47 grammar.

`cover` is null or an image reference with `assetId`, `altText`, and `decorative`.

`theme` contains a six-digit hexadecimal `accentColor`, `font` (`sans` or `serif`), and `pageWidth` (`standard` or `wide`). These are design tokens rather than arbitrary CSS.

`settings` contains `navigation` (`free` or `sequential`), `completion` (currently `all-lessons`), and integer `passingScore` (0–100). The player applies navigation and lesson completion. Assessment scoring is later work.

`sections` contains objects with `id`, `title`, and `lessons`. Each lesson contains `id`, `title`, and `blocks`. Empty courses, sections, lessons, and textual content are valid authoring drafts.

### Identity

Course, section, lesson, block, and asset identifiers must be unique throughout a project. IDs start with a lowercase letter, followed by lowercase letters, digits, or hyphens, up to 64 characters. Future creation code can use prefixed UUIDs. Reordering and editing preserve identity. Duplication must allocate fresh IDs and update the appropriate references.

### Blocks

All blocks have `id`, `type`, `variant`, `appearance`, and `content`. Version 3 adds optional `requiredInteraction` on accordion, tabs, flashcards, process, and labeled graphic; true requires every item to be explored. Optional `narration` stores `script`, `language`, `speed` (0.5–2), and an optional provider-independent `voice` selector. Generated speech is not the primary source of narration. A future voice adapter must handle unavailable voices without destroying scripts.

Appearance has `width` (`reading`, `wide`, `full`), `padding` (`small`, `medium`, `large`), and `background` (`page`, `surface`, `accent`).

| Type | Variants | Content |
| --- | --- | --- |
| `heading` | `heading`, `subheading` | `text` |
| `paragraph` | `plain`, `with-heading` | `text`, `heading` |
| `list` | `bulleted`, `numbered`, `checklist` | Ordered `items` of text |
| `statement` | `statement`, `note` | `text` |
| `quote` | `plain` | `text`, `attribution` |
| `image` | `centered`, `full-width` | `assetId`, `altText`, `decorative`, `caption` |
| `image-text` | `image-left`, `image-right` | Image fields plus `heading`, `text` |
| `divider` | `line`, `numbered` | `label` |
| `spacer` | `small`, `medium`, `large` | Empty object |
| `assessment` | `single-choice`, `multiple-response`, `fill-blank`, `matching`, `sorting` | `prompt`, `options`, answer-key `correct` indices, `accepted` answers, `caseSensitive`, `pairs`, sorting `items`, correct/incorrect feedback; top-level `assessment` rules |
| `continue` | `button` | `label`; also requires top-level `completion` |
| `gallery` | `grid` | `items` of image usage fields (1–30) |
| `audio` | `player` | `title`, nullable `assetId`, `transcript` |
| `video` | `player` | `title`, nullable `assetId`, `transcript`, `captionLanguage`, timed `captions` |
| `attachment` | `download` | `label`, `description`, nullable `assetId` |
| `button` | `link` | `label`, empty or validated HTTP/HTTPS `url` |
| `accordion` | `stacked` | `items` with `title`, `text` (1–50) |
| `tabs` | `horizontal` | `items` with `title`, `text` (1–50) |
| `flashcards` | `grid` | `cards` with `front`, `back` (1–50) |
| `process` | `steps` | `items` with `title`, `text` (1–50) |
| `timeline` | `vertical` | `items` with `title`, `text` (1–50) |
| `labeled-graphic` | `markers` | Image fields plus `markers` containing `label`, `text`, `x`, `y` (1–30, coordinates 0–100) |

Continue completion is `none`, `previous`, or `all-previous`. Its player behavior is implemented. Additional block families must extend this contract with tests, documentation, and migration decisions before use. Having a format definition is not evidence that the corresponding editor/player block is implemented.

Alternative text and decorative status belong to image usages, not the reusable asset. Missing descriptive text may be an accessibility warning later; it is not a reason to refuse saving a draft.

### Assets

Each inventory entry contains `id`, original `fileName`, `mediaType`, `byteLength`, and lowercase hexadecimal `sha256`. Every listed asset must be present exactly once, even if not yet used in a block. Undeclared asset files are rejected. Image references must resolve to an image inventory entry. Non-null audio, video, and attachment references must resolve to an asset of the corresponding accepted type. Captions are cue records (`start`/`end` seconds, end after start, and plain text), not uploaded executable files. There can be at most 500 cues, up to 24 hours and 5,000 characters each. Collection entries use array order and do not introduce additional global IDs.

| Media type | Canonical extension | Accepted original extensions |
| --- | --- | --- |
| image/png | png | png |
| image/jpeg | jpg | jpg, jpeg |
| image/webp | webp | webp |
| audio/mpeg | mp3 | mp3 |
| audio/wav | wav | wav |
| video/mp4 | mp4 | mp4 |
| application/pdf | pdf | pdf |
| text/plain | txt | txt |

Binary type signatures, original extensions, lengths, and hashes are checked. Plain text must be valid UTF-8 without NUL. Signature checking is not malware scanning or a full media decoder. Files are never executed, rendered, or extracted during import. Attachments download accepted PDF/TXT bytes; they are not embedded as executable pages. SVG, HTML, JavaScript, executables, and arbitrary embedded projects are not accepted asset types.

## Validation and limits

- Size limits are set by each instance, within the format's ceilings (version 4; earlier versions were fixed at
  16 MiB per asset, 64 MiB expanded and a 32 MiB archive):
  - individual asset: 64 MiB by default, at most 256 MiB (`OPENSCROLL_MAX_FILE_MIB`); assets cannot be empty;
  - total expanded content: 160 MiB by default, at most 320 MiB (`OPENSCROLL_MAX_COURSE_MIB`);
  - compressed archive: the expanded limit plus 16 MiB, since media hardly compresses.

  A file made on one instance opens on another only if it fits the second instance's limits.
- Maximum `course.json`: 2 MiB, including exported formatting.
- Maximum entries: 256, including `course.json`.
- At most 100 sections, 500 lessons total, and 5,000 blocks total; individual arrays have additional schema bounds.
- At most 255 assets and 100 items in a list.
- ZIP methods: stored or DEFLATE; encrypted entries, links, directories, unexpected paths, and duplicate entries are rejected.

Import reads entries lazily and counts actual streamed bytes, not just declared sizes. It checks entry CRC-32 and asset SHA-256. No archive entry is written to the filesystem, so import cannot overwrite application or user files. Failure returns an error without mutating the caller's existing project or original archive.

Exports use fixed ZIP metadata and stable entry ordering. Identical validated source produces identical bytes with the same pinned implementation; byte identity across future ZIP library changes is not a compatibility promise.

## Version 4 additions

Version 4 adds formatted text and the fields needed to recreate Rise 360 courses. [schema/course-v4.schema.json](../schema/course-v4.schema.json) is the generated structural schema; [src/shared/course.ts](../src/shared/course.ts) and [src/shared/rich-text.ts](../src/shared/rich-text.ts) are the runtime sources.

**Rich text.** These fields hold formatted text: course `description`; paragraph, statement, quote and image-and-text `text`; list `items`; accordion, tabs, process and timeline item `text`; process `intro`/`summary` text; flashcard `front` and `back`; labeled-graphic marker `text`; assessment `prompt`, `feedbackCorrect`, `feedbackIncorrect` and `choiceFeedback`. Titles, labels, captions, transcripts, options and alternative text stay plain.

Formatted text is a canonical subset of HTML: `<p>`, `<h3>`, `<h4>`, `<ul>`, `<ol>` (optionally `start="N"`), `<li>` (lists nest at most three deep), `<strong>`, `<em>`, `<br>`, and `<a href>` with a complete HTTP or HTTPS address. Text escapes `&`, `<` and `>`; attribute values also escape `"`; whitespace runs are single spaces. A value that is one paragraph is stored without its `<p>` wrapper, so ordinary plain text is already valid. A stored value must already be canonical: validation rejects anything else instead of rewriting it. Imported and pasted HTML passes through `sanitizeRich`, which drops scripts, styles, event attributes, unsafe links and unknown elements. Renderers build DOM nodes from the parsed tree and never assign authored HTML to `innerHTML`.

**New fields.**

| Where | Field | Default |
| --- | --- | --- |
| Course | `authorImage: { assetId } \| null` (an image asset) | `null` |
| Theme | `coverLayout`: `stacked`, `split-left`, `split-right`, `two-thirds-left`, `overlay`, `centered` | `stacked` |
| Theme | `lessonHeader`: `plain`, `image`, `accent` | `plain` |
| Theme | `fontPairing`: `lato-merriweather`, `worksans-sourceserif`, `figtree-literata`, `atkinson` or `null` | `null` |
| Lesson | `banner: { source: cover \| image, assetId, altText, decorative } \| null` | `null` |
| Lesson | `objectives: [{ id, text, level }]`, level one of Bloom's six or `null` | `[]` |
| Process | `intro`, `summary`: `{ title, text } \| null` | `null` |
| Timeline item | `date` (a short label such as "Phase 1") | `""` |
| Continue | `hint` (shown until learners can continue) | `""` |
| Assessment | `feedbackMode`: `none`, `correct-incorrect`, `per-choice` | `correct-incorrect` |
| Assessment | `choiceFeedback` (formatted, one per option, at most as many as options) | `[]` |
| Assessment | variant `categorize` with `groups` (2–10 labels) and `placements` (each card's group) | `[]` |

The assessment variant `sorting` is renamed `ordering` so it cannot be confused with sorting cards into groups. A banner that uses the course cover names no asset; one that uses its own image must name an image asset. Section titles may be empty, in which case learner outputs show no section heading.

**Wave A blocks.** Version 4 is not yet released, so the first block wave joins it rather than starting version 5. Older files never contain these types; a version 1–3 file that names one is rejected.

| Block | Variants | Content |
| --- | --- | --- |
| `objectives` | `list`, `cards` | `heading`, `intro` (formatted), `items` (1–30 `{ id, text, level }`, level as for lesson objectives) |
| `table` | `lined`, `striped` | `caption`, `head` (0–8 plain column headings), `rows` (1–60 rows of 1–8 formatted cells), `headerColumn` |
| `reflection` | `plain`, `journal` | `prompt` and `sample` (formatted), `placeholder`, `minWords` (0–1000), `required`, `workbook` |
| `activity` | `card` | `title`, `minutes` (0–600), `steps` (1–20 formatted), `output` (writing box label, empty for none), `required`, `workbook` |
| `checklist` | `ticks` | `title`, `items` (1–50 plain), `required`, `workbook` |
| `self-assessment` | `scale` | `title`, `intro` (formatted), `scale` (2–7 labels), `items` (1–30 statements), `bands` (0–8 `{ min, max, text }`), `required`, `workbook` |
| `columns` | `1-1`, `1-1-1`, `2-1`, `1-2` | `columns` (2, or 3 for `1-1-1`), each `{ blocks }` with at most 20 heading, paragraph, list, statement, quote, image or button blocks |
| `assessment` | adds `true-false` | exactly two `options` and one `correct` answer |

**Wave B questions and survey.** Assessment content gains `selfCheck` (default `false`) and `model` (formatted, default empty) for `short-answer`; `numeric` `{ mode: exact | range, value, tolerance, min, max, unit }` for `numeric`; and `image` `{ assetId, altText } | null` with `areas` (up to 20 `{ x, y, w, h, label }` in percent of the image) for `hotspot`, where `correct` and `choiceFeedback` refer to areas instead of options. The `survey` block (variant `form`) has `title`, `intro` (formatted), `scale` (2–7 labels), `items` (1–30 `{ id, kind: rating | differential | choice | comment, prompt, options }`), `required` and `workbook`. Areas must stay inside the image, and a hotspot's image must be an image asset.

**Wave C.** The video block gains the variant `interactive` and the fields `describedAssetId` (an MP4 asset or `null`), `descriptions` (timed cues like captions), `pauseForDescriptions`, `chapters` (`{ time, title }`), `checkpoints` (`{ id, time, kind: question | note, questionId, title, note }`, where `questionId` names a question block in the same lesson) and `noSkipAhead`, all with empty defaults. New blocks: `embed-video` (variant `facade`) with `provider` (`youtube` or `vimeo`), `videoId` (an 11-character YouTube id or a numeric Vimeo id, or empty until set), `title`, `transcript` and `start`; and `software-practice` (variant `steps`) with `title`, `intro`, `steps` (1–60 `{ id, imageId, alt, instruction, target: { x, y, w, h }, typed, hint }`, the target in percent of the screenshot), `modes` (`watch`, `try`, `test`, at least one on), `required` and `workbook`. Copies of lessons and courses re-point checkpoints at the copied questions.

**Wave D and course resources.** The course gains `glossary` (up to 500 `{ id, term, definition (formatted), aliases }`), `banks` (up to 50 `{ id, name, questions }`, each question an assessment block), `certificate` (`{ title, issuer, signerName, signerTitle, logoId, signatureId, showScore }` or `null`) and `settings.glossaryLinks`, all with empty defaults. New blocks: `glossary` (variants `a-z`, `list`; `title`, `showLetters`, `search`), `action-plan` (variant `table`; `title`, `intro`, `columns` 1–6 `{ label, kind: text | date }`, `starterRows`, `maxRows`, `required`, `workbook`), `results` (variant `summary`; `title`, `showReview`, `showCertificate`) and `bank-draw` (variant `random`; `title`, `bankId`, `count` 1–50). Bank question identifiers are unique across the course; certificate pictures must be image assets. A `bank-draw` naming a missing bank is valid in the file and blocked by Checks.

**Wave E.** The course gains `characters` (up to 30 `{ id, name, role, poses }`, each pose `{ id, name, imageId, alt }`). The `scenario` block (variant `conversation`) has `title`, `intro`, `scenes` (1–20 `{ id, title, backgroundId, nodes }`), `start`, `allowTakeBack`, `showPathReview`, `scoring`, `passPoints`, `required` and `workbook`. Each node (step) is `{ id, kind: line | narration | choice | ending, characterId, poseId, text (formatted), next, choices (up to 6 `{ text, next, feedback, points }`), outcome: positive | neutral | negative }`. Links between steps are checked by Checks rather than the format, so deleting a step never makes a file unreadable. Copies give every scene and step a new id and map each link.

Integrity checks: every table row has the same number of cells as the header; the column count matches the layout; a score band's `min` is not above its `max`; identifiers are unique across blocks inside columns and objective items; images inside columns must name image assets. Learner responses to reflection, activity, checklist and self-assessment blocks are learner state, never part of the course file (see [LEARNER-RESPONSES.md](LEARNER-RESPONSES.md)).

## Version and migration policy

Version 1 is the initial development format; version 2 adds the Step 8 media/interaction families; version 3 adds assessments and exploration requirements; version 4 adds formatted text and the fields above. Migration to version 4 runs on a copy: plain text is escaped and line breaks become paragraphs or `<br>`, `sorting` becomes `ordering`, and new fields take their defaults. `parseCourse` validates supported v1 input and copies it into v3 by changing only the version. It rejects new block types incorrectly labeled v1. The original archive and stored database row remain unchanged on read; an explicit save/download targets v3. The v1/v2 schemas and original starter fixtures are retained. Unknown properties/types are never silently stripped. Version 0 and newer unsupported versions fail explicitly and preserve their sources.

Stored-course recovery retains exact legacy pending payloads. The server accepts either the current canonical digest or the matching legacy v1/v2 digest only for the latest unchanged acknowledged mutation/revision. This preserves lost-acknowledgement retry behavior without permitting stale overwrites.

A future incompatible change must increment `schemaVersion`, retain a fixture from each supported prior version, implement explicit ordered migrations on a copy, and test that content, assets, IDs, accessibility fields, and narration survive. A migration must never rewrite the only original file. Export targets the current version; downgrade conversion is not promised. Unknown fields cannot simply be stripped to make an old document validate.

## Development transport and tools

The transient workspace uses `PortableProject = { document, files }`, where `files` maps canonical paths to canonical base64 strings. This is an internal HTTP/in-memory representation, not the package format. It does not store asset blobs in `course.json`.

- `GET /api/projects/sample`: download the sample archive.
- `POST /api/projects/import`: binary archive with the project content type; returns the validated in-memory representation.
- `POST /api/projects/export`: JSON in-memory representation; returns the archive.

The export JSON body limit follows the instance's course limit, allowing for base64 expansion (221 MiB at the default 160 MiB course limit). One project request is admitted at a time per application process, including upload parsing, with HTTP 429 on contention. A request may take as long as sending the largest allowed course at about 4 Mbit/s; an idle connection closes after 30 seconds. No project route writes database records or disk assets. Files transit the instance for validation and packaging; the UI does not claim browser-only processing or durable saving.

These are development endpoints, not a public hosting security sign-off. Step 4 adds authenticated, owner-scoped durable library endpoints separately; these transient packaging endpoints still do not store data. Production resource controls and deployment review remain future work. Reverse-proxy body limits must agree with the application limits when deployed.

```sh
npm run project -- sample new-course.openscroll
npm run project -- inspect examples/welcome.openscroll
npm run project -- repack examples/welcome.openscroll reopened.openscroll
npm run schema
npm run schema:check
```

CLI writes refuse to overwrite an existing file, including the input. Inspect and repack bound input reads. Repack exercises reopen/save; it upgrades supported earlier versions on a copy; it is not a version downgrade tool.

## Step 6 editor compatibility

Step 6 introduced the original v1 families; Step 8 extends the editor with v2 media/interaction families. Content is plain text, not HTML or rich text marks. Compatible variant changes preserve hidden content and narration. Undo/redo state is session-local and excluded from packages; unused retained image assets remain valid inventory entries. Continue rules and narration scripts persist as data, with learner gating implemented in the Step 7 player and generated audio deferred. See [BLOCK-EDITOR.md](BLOCK-EDITOR.md).

## HTML publication boundary

Step 7 creates a distinct learner ZIP containing `index.html`, player runtime, `course.json`, `publication.json`, assets, and notices. It is not an editable `.openscroll` archive and does not contain editable archive metadata. It uses the current validated course document (now v3). Learner progress is stored separately in the browser; it never enters a course document. See [HTML-PUBLISHING.md](HTML-PUBLISHING.md).

See [media and interactions](MEDIA-AND-INTERACTIONS.md) for authoring, keyboard behavior, publishing accessibility checks, and static print mappings.

## Assessment and learner-state boundary

An `assessment` block uses top-level rules `{ graded, points, required, completion, maxAttempts }`. Points range 1–100, completion is `submitted` or `correct`, and maxAttempts is 0 (unlimited) or 1–20. Its content stores all supported format fields so switching variants preserves hidden authored values. Choice references must be unique and in range. Incomplete answer keys/blank entries can save as drafts but publication readiness requires usable prompts, distinct choices/pairs/order items, and the appropriate answer key. See [ASSESSMENTS-AND-COMPLETION.md](ASSESSMENTS-AND-COMPLETION.md) for exact grading and normalization rules.

Learner snapshot version 2 is separate from portable schema 3 and database migration 2. Draft answers, last/best responses, attempt counts, exploration indices, and completion are local player data, never course fields. Scores are computed from validated responses and current point/rule data. Legacy snapshot v1 remains readable. Unchanged pending author saves from portable v1/v2 retain their request identity and acknowledgement compatibility during migration.
