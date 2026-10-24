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

The server uses exact-version `playwright-core` with an installed Chromium binary and fonts. It generates inert semantic HTML from validated course text and canonical images. Browser JavaScript is disabled, service workers are blocked, requests are aborted, the context is offline, and a restrictive document policy allows only inline application styles and embedded images. Authored links become PDF annotations and are not fetched during rendering. No remote image URL, browser endpoint or executable path can be supplied through PDF request options.

`POST /api/projects/pdf` accepts `{project: <portable project>, options: {paper: 'A4' | 'Letter', includeAnswers: boolean}}`; omitted options default to A4 and no key. Shared publication checks reject malformed assets, unready questions and configured media lacking transcripts/captions. The existing 90 MiB JSON request and portable project limits apply. PDF output is limited to 32 MiB. One project operation at a time owns the shared processing slot. The render has a 45-second deadline (browser launch has its own 15-second timeout), closes its fresh browser on success/failure, and reports actionable failure rather than truncating output. Canceling the browser dialog cancels the download; an already-started server render can continue until it finishes or reaches its deadline.

## Installation and command line

The production Dockerfile installs Debian Chromium, CA certificates, Noto core/CJK fonts and native dependencies. `playwright-core` remains installed after production pruning. The build retains Debian package/license notices and uses the cloud proxy/CA only during installation; the session-specific trust file is removed in that layer. Chromium's Debian security version can change on rebuild, so retain regression evidence for the actual deployed browser version.

For a direct Debian installation, install `chromium fonts-noto-core fonts-noto-cjk`, run `npm ci`, then use normal startup/build commands. Default binary: `/usr/bin/chromium`. Set `PDF_CHROMIUM_EXECUTABLE_PATH` only to a trusted local installation when a different path is required. No remote browser service, new secret, database migration or portable schema change is needed. PDF rendering adds browser CPU/memory requirements; size a VPS using representative courses. Runtime browser launch uses Playwright's default sandbox setting with only application-generated inert HTML; this is not a general web-browsing endpoint.

To export an existing project locally:

```
npx tsx tools/pdf.ts course.openscroll course.pdf
npx tsx tools/pdf.ts course.openscroll instructor.pdf --answers --letter
```

The command refuses to overwrite an existing output. The original project stays intact.

PDF verification uses Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) and Python `pypdf==6.10.0`. These inspection tools are development/CI dependencies, not production runtime services. A virtual environment can supply pypdf; place its `bin` directory on PATH before running the unit suite. CI installs these and sets the PDF executable path to its downloaded Playwright Chromium. The managed workspace already had Chromium and these inspection tools; its published startup commands remain usable.

## Accessibility evidence and limits

The capability probe and generated-course tests verify marked structure trees, heading/list/image structure, document language, alt text, bookmarks, text extraction order, logical structure text order, live contents links and both paper sizes. Browser tests scan the export dialog and verify keyboard cancellation/focus return. Representative pages are rasterized and inspected for legibility and pagination; a bounding-box check detects text outside safe page bounds. Short assessment blocks/key entries stay together when they fit, while oversized content can span pages.

This is **tagged PDF output, not a PDF/UA or WCAG conformance certification**. Automated structure checks and human visual/logical-text inspection do not replace real screen-reader testing. Manual Acrobat/PAC or equivalent validation, screen-reader navigation, and language/font checks for a target publication remain pending. Alternative text and transcripts still depend on the author's content quality. No PDF/UA conformance identifier is asserted.

See [Step 11 evidence](STEP-11-VALIDATION.md). The sample learner and instructor PDFs and their editable source are in `artifacts/pdf-publishing`.
