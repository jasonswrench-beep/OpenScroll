# PDF publishing

Choose **Export PDF** in a library course or **Export portable PDF** in the portable workspace. Select A4 or US Letter. **Include answer key and assessment feedback** is off by default. Download PDF uses a snapshot of the current course, including current unsaved editor content; it does not save a library revision or alter the editable project. Keep the `.openscroll` project for future editing.

The PDF includes a cover (title, displayed author, description and optional cover image), linked contents, section/lesson headings, PDF outline/bookmarks, and Page n of N footers. All sections and lessons are printed in authored order. Each lesson begins on a new page; sections begin with their first lesson. The contents links navigate within the PDF; the contents itself does not list page numbers. Headings, selectable text and image alternative text are retained in tagged output. PDF uses a consistent publication layout rather than reproducing the web player's columns, theme backgrounds, controls or progress.

## Static content mapping

| Authored content | PDF representation |
| --- | --- |
| Headings, paragraphs, statements and notes | Structured headings and readable paragraphs/callouts |
| Quotes, lists and checklists | Quotation/attribution and semantic lists; checklists are static |
| Images, image/text and galleries | Canonical images, authored alternative text and captions, followed by accompanying copy |
| Accordion, tabs, timeline and process | Every panel/item expanded in authored order |
| Flashcards | Both front and back of every card; these are course content, not part of the assessment-key option |
| Labeled graphic | Image with visual numbered markers and all marker labels/descriptions as an ordered list |
| Audio and video | Title, source filename and full transcript; video also includes all timed captions as text |
| Attachments | Label, description and filename; TXT file contents are included as text |
| Link buttons | Descriptive clickable HTTP/HTTPS link and its printed URL |
| Continue, dividers and spacers | Static separators and spacing; no learner clicks or progress required |
| Multiple choice/response | Prompt, point/practice label, instructions and numbered choices |
| Fill in the blank | Prompt and an answer line; accepted responses appear only in the optional key |
| Matching | Separate term and reversed match lists with a written matching instruction |
| Sorting | Items in the same initial reverse order used by the player, with spaces for ordering |
| Authored narration | Nonempty narration scripts as readable text |

Assessment answers and feedback are omitted from the learner copy. The optional answer-key appendix includes correct choices, accepted text/case rules, matched pairs, correct ordering and authored feedback. An author's prompt or ordinary course text can itself reveal an answer; the option does not redact authored prose. No learner responses, attempts, scores, review acknowledgements, author account information or LMS state enter the PDF.

PDF has no playable media, working learner interactions, assessment tracking, embedded PDF attachments, or original media/resource files. Supply companion files separately when needed. A TXT attachment's readable text is preserved, but the file itself is not embedded. Browser-printing a learner player is separate from this export; the dedicated PDF renderer prints everything, including content hidden behind web gates.

## Engine and limits

The authoring server validates the course and generates inert semantic HTML from course text and canonical images. A separate, credential-free renderer container prints this HTML using exact-version `playwright-core`, its installed browser and Noto fonts. Only publication HTML and A4/Letter selection cross the private Unix-domain socket. The renderer has no database, mail, session or infrastructure credentials and no public HTTP endpoint. [Renderer isolation](RENDERER-ISOLATION.md) describes the process, filesystem and network boundary.

The renderer's container uses `network_mode: none`, so browser processes cannot reach the application, database or Internet through a network interface. This enforcement is outside browser JavaScript. JavaScript-disabled/offline contexts, blocked service workers, aborted requests and a restrictive document policy remain additional controls. Authored links become PDF annotations and are not fetched during rendering. No remote image URL, browser endpoint or executable path can be supplied through PDF request options.

`POST /api/projects/pdf` accepts `{project: <portable project>, options: {paper: 'A4' | 'Letter', includeAnswers: boolean}}`; omitted options default to A4 and no key. Verified email and current owner approval are required before processing the request. Shared publication checks reject malformed assets, unready questions and configured media lacking transcripts/captions. The existing 90 MiB JSON request and portable project limits apply. Generated publication input is separately bounded to 32 MiB, including repeated image/text references; PDF output is limited to 32 MiB. Exceeding a limit produces an error rather than a truncated document.

One project operation at a time owns the app's shared processing slot. Each renderer accepts one job and refuses additional work as busy instead of creating an unbounded queue. Its trusted supervisor enforces a 45-second connection/job deadline outside the browser process, including input, output and cleanup; the app imposes a separate 47-second socket deadline. Expiration exits/restarts the renderer and produces a safe failure, rather than returning a partial PDF. A fresh unprivileged browser job is cleaned up before reuse, or the container restarts if cleanup is uncertain. These wall timers are subject to host/kernel scheduling and are not hard real-time guarantees. Container CPU, memory, process and temporary-storage limits bound its resource use. Canceling the browser dialog cancels the download; an already-started render can continue until it finishes or reaches its deadline.

## Installation and command line

Production uses two images from the same reviewed commit: the app image and the separate `renderer` Docker target. The app image does not install a browser or fonts. The renderer retains browser/native package notices and Noto font licenses. Build and configure both images using [the self-hosting guide](SELF-HOSTING.md) and [renderer operator guide](RENDERER-ISOLATION.md). The current Bookworm browser package remains below the newer upstream security release; see [patch availability and remaining release requirements](RENDERER-ISOLATION.md#browser-patch-availability). Refresh the reviewed browser package and retain regression/scan evidence for the actual final image; the browser version is independent of the exact Playwright API version.

Direct Node development and the CLI need a running isolated renderer and an absolute `PDF_RENDERER_SOCKET` path. The old `PDF_CHROMIUM_EXECUTABLE_PATH` app setting does not enable in-process rendering. No remote rendering provider or new secret is required. Missing, busy, crashed or unreachable renderers cause PDF publishing to fail closed while preserving the editable course. Size the host using representative courses and the renderer's explicit resource limits.

With that socket configured, export an existing project locally:

```sh
npx tsx tools/pdf.ts course.openscroll course.pdf
npx tsx tools/pdf.ts course.openscroll instructor.pdf --answers --letter
```

The command refuses to overwrite an existing output. The original project stays intact.

PDF verification uses Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and Python `pypdf==6.10.0`. These inspection tools are development/CI dependencies, not production runtime services. A virtual environment can supply pypdf; place its `bin` directory on PATH before running the unit suite. Run the unit/browser suites against the isolated renderer, not an app-process browser fallback. See [development setup](DEVELOPMENT.md) and [container validation](CONTAINER-SECURITY.md).

## Accessibility evidence and limits

The capability probe and generated-course tests verify marked structure trees, heading/list/image structure, document language, alt text, bookmarks, text extraction order, logical structure text order, live contents links and both paper sizes. Browser tests scan the export dialog and verify keyboard cancellation/focus return. Representative pages are rasterized and inspected for legibility and pagination; a bounding-box check detects text outside safe page bounds. Short assessment blocks/key entries stay together when they fit, while oversized content can span pages.

This is **tagged PDF output, not a PDF/UA or WCAG conformance certification**. Automated structure checks and human visual/logical-text inspection do not replace real screen-reader testing. Manual validation with a desktop PDF/UA checker, screen-reader navigation, and language/font checks for a target publication remain pending. Alternative text and transcripts still depend on the author's content quality. No PDF/UA conformance identifier is asserted.

See [Step 11 evidence](STEP-11-VALIDATION.md). The sample learner and instructor PDFs and their editable source are in `artifacts/pdf-publishing`.
