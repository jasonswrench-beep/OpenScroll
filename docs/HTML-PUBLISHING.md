# Player preview and standalone HTML

Step 7 adds a learner player and HTML publishing. Open a library course and choose **Preview course** or **Export HTML ZIP**. The portable workspace also offers **Preview portable course** and **Export portable HTML ZIP**, without requiring an account. Editable `.openscroll` downloads remain separate from learner publications.

## Preview

Preview uses a cloned snapshot of the current draft, including unsaved edits and image bytes. It never changes authored blocks, library revisions, undo history, or browser recovery drafts. A recovery/conflict draft can be previewed or exported without overwriting the saved library course.

Choose Desktop, Tablet (768 px), or Phone (375 px). These are real iframe viewport widths; switching devices retains practice progress. On a small authoring screen a larger device can be horizontally scrolled. **Restart preview** resets practice state to the original snapshot. **Return to editing** restores the editor and focus to the preview opener. Reopen preview to pick up further edits.

The player uses the same semantic core block renderer and styles as the editor, with editor controls omitted. Navigation and completion use the same implementation in preview and HTML output. Preview state stays in memory and is never written to learner local storage. It starts at the currently edited lesson when free navigation permits; sequential courses start at the first lesson until earlier lessons are complete. Returning preserves the source editing context.

The iframe runs trusted OpenScroll player code and inert authored text. It permits its own scripts and origin for module loading, plus sandboxed form events for trusted assessment controls, while disallowing popups and top navigation. Message exchange verifies the parent/frame source and same origin. This is not a sandbox for arbitrary uploaded HTML or custom scripts; those remain unsupported. The built server permits same-origin framing only for `player.html`, retaining framing denial on the authoring shell.

## Navigation, review, and completion

Choose **Lesson navigation** in the course outline:

- **Free** allows any lesson to be opened. Visiting a lesson does not complete it.
- **Sequential** unlocks a lesson after all earlier lessons are marked complete. Previous completed lessons remain available.

Continue blocks reveal a lesson in sections. The first unopened Continue is shown and later blocks remain hidden. Pressing it opens the next section. The selected rule controls when it is available:

| Continue rule | Required action |
| --- | --- |
| No restriction | Press Continue when ready |
| Previous block | Review the immediately preceding content block; an earlier Continue must already be opened |
| All previous blocks | Review all earlier readable blocks and open earlier Continue sections |

Paragraphs, statements/notes, quotes, lists, images, and image/text blocks required by a rule receive a labeled **Mark as reviewed** button. Review is an explicit learner acknowledgement, not proof of reading or comprehension. Headings, dividers, and spacers need no confirmation. An empty preceding set is already satisfied, so a Continue at the start cannot deadlock. A checklist is a visual list in this version, not an assessment or required checklist interaction.

**Complete lesson and continue** finishes the current lesson and opens the next one in a single action. The last lesson uses **Complete lesson**. A Continue at the very end is folded into this action because it reveals no more content; its authored requirements still apply. Interior Continue blocks still reveal sections. Required questions/interactions/reviews must be satisfied, and remaining requirements appear as named links that jump to the relevant content. An empty lesson also finishes without deadlock. A previously completed lesson offers **Next lesson** for review navigation. Completion is separate from assessment success; assessment scoring is implemented in Step 9, while generated audio narration, LMS reporting, and secure access restrictions remain outside this player. Gates are a learner flow, not content protection: the public course JSON contains the full authored course.

## Publishing and hosting

1. Choose **Export HTML ZIP**. The service validates the complete snapshot and asset bytes, then packages the player and media. Exporting does not save or modify the library course.
2. Save `course-html.zip` and extract the entire archive.
3. Upload the extracted directory to a static web host. Open its `index.html` through HTTP/HTTPS. Nested hosting directories work with relative references.
4. Keep the editable `.openscroll` file separately. The HTML ZIP is learner output and is not accepted as an editable project import.

For a local check, serve the extracted directory using an available static HTTP server, for example `python3 -m http.server 8080 --directory /path/to/extracted-course`. Direct `file://` execution is not supported because modules and JSON loading require a web origin.

The published player needs no OpenScroll service, author/learner account, database, CDN, or external runtime. All supported course media are included. Standalone output was tested with the authoring service stopped. Hosting the authoring application on a production VPS is separate later work.

Exports include:

| Path | Purpose |
| --- | --- |
| `index.html` | Learner launch page with relative runtime references and a restrictive content security policy |
| `course.json` | Validated current course document (v3; v1/v2 imports migrate); no account/session/recovery data |
| `publication.json` | HTML publication version and SHA-256 content fingerprint |
| `runtime/` | Player JavaScript, shared renderer/validator, and CSS; excludes the authoring bundle |
| `assets/` | Course asset bytes under canonical asset IDs |
| `README.txt` | Hosting, progress, and editing guidance |
| `LICENSE.txt`, `NOTICE.txt`, `THIRD-PARTY-NOTICES.txt` | Runtime and bundled-dependency notices; authored content retains its own rights |

The archive is limited to 32 MiB compressed and 64 MiB expanded, including runtime and notices. A project near its maximum may need smaller media or fewer unused assets to fit the additional runtime. Validation/export failures leave the draft intact and display an actionable message. Only one transient project-file operation runs at a time per server instance; another request can return a retryable busy response.

## Local learner progress

HTML output stores lesson completion, review IDs, opened Continue IDs, and the current lesson in local storage, keyed by the course document fingerprint. It stores no authored text or account information in that progress record. It resumes in the same browser and origin; another browser/device does not share progress. Changed course content gets a different key. Clearing site data removes progress. **Reset progress** confirms before starting over.

If storage is disabled, full, or unavailable, the player reports that progress lasts only in the current session. It still navigates and completes lessons in memory. Resume data is validated against current lesson/block IDs and gate order. It is editable local browser data, not trusted scoring or LMS reporting. SCORM persistence is Step 10 work.

## Build and verification

`npm run build` builds both authoring and player entries, emits a manifest, and creates the dependency notices before compiling the server. The HTML exporter follows only the player dependency graph and packages validated assets without extracting user ZIP paths. Development exports require a current build in `dist/client`; rerun build after changing player code. Production containers include the built artifacts and license files.

Unit tests cover gates, navigation, safe resume, empty courses, immutable source data, export contents, license inclusion, fingerprints, invalid requests, and unsafe runtime-path rejection. Browser tests serve the actual downloaded ZIP from an independent static origin, test resume/reset and storage failure, compare all core template content with preview, exercise real device widths, check focus, and scan desktop/mobile with axe. See [Step 7 validation](STEP-7-VALIDATION.md). Manual screen reader and Firefox/Safari verification remain pending.

## Step 8 extension

[Media and interactions](MEDIA-AND-INTERACTIONS.md) adds native audio/video playback, timed captions, transcripts, galleries, PDF/TXT downloads, safe link buttons, and structured interactions. Configured audio/video requires a transcript at publication; configured video also requires timed captions. These checks do not block saving an incomplete draft. Additional disclosure/playback state is transient, while existing review/lesson completion still resumes. Print styles flatten panels and include transcripts for rendered content; they do not create a PDF or reveal gated content that has not been rendered.

## Step 9 assessment extension

[Assessments and completion](ASSESSMENTS-AND-COMPLETION.md) adds question feedback, retries, weighted points, passing status, required questions, and exploration requirements. Completion and passing are independent. Learner snapshot version 2 persists drafts, attempts, best/last responses, and unique item visits; version 1 snapshots remain readable. Preview resets only practice state; exported courses confirm before clearing persistent progress. Question forms use sandboxed native form events while the player's content policy still forbids actual form navigation. No learner answers are sent to the authoring API.
