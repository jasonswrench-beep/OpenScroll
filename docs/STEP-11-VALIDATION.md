# Step 11 validation

Date: 2026-10-22 (America/New_York). PDF publishing is implemented and validated locally and in the production container. See [PDF publishing guide](PDF-PUBLISHING.md).

## Delivered scope

Both library and portable workspaces export complete static PDFs with cover, displayed author/description/cover image, linked contents, section/lesson headings, bookmarks, and Page n of N footers. Options select A4 or US Letter and an answer-key/feedback appendix, off by default. The source is an isolated snapshot; no saved revision, portable format, asset inventory, or learner state is changed. CLI export is also available without overwriting existing files.

Every current block family has an exhaustive static mapping, including all hidden panels, flashcard backs, marker descriptions, media transcripts/captions, TXT attachment text, links, all five assessment formats, and authored narration scripts. Content after Continue gates and in later lessons/sections is always included. Media and original companion files are not embedded; their static representations and filenames are explicit. Matching/sorting learner copies do not print the answer-key arrangement. All assessment keys and feedback appear only when explicitly requested, except any answers the author independently puts in ordinary content.

## Engine selection and document evidence

A Chromium capability probe demonstrated a marked structure tree, document language, H1/H2 roles, image Figure alternative text, outline/bookmark destinations and readable text/structure order before engine selection. The chosen engine is local Chromium via exact `playwright-core@1.64.1` (Apache-2.0), which was already present through browser testing and is now a production dependency. It prints dedicated inert semantic HTML, not the interactive player's currently visible state.

Generated-course checks use pypdf 6.10.0 and Poppler to verify tagging, H1/H3/Figure roles, original image alt text, language, bookmarks, link annotations, all expanded content, learner/key separation, both page sizes and page numbering. Poppler's logical structure text confirms the order of tab content, flashcard backs and later-lesson content. Representative cover, media/body, question and long-text pages were rasterized and visually inspected. Text bounding boxes fall within safe page bounds; long paragraphs preserve their ending marker rather than clipping or silently truncating. Short question/key blocks are kept together when they fit.

These checks establish useful tagged output and visible/structural quality, **not PDF/UA or WCAG certification**. No PDF/UA identifier is asserted. Manual screen-reader and Acrobat/PAC-style conformance checks remain pending; authors still need meaningful alternative text and transcripts. Languages/fonts beyond the inspected samples require target-publication review.

## Automated checks

- `npm run build`: pass for browser, player, static PDF renderer and server.
- `npm run licenses`: pass; playwright-core's reviewed Apache-2.0 license is retained.
- `npm run schema:check`: pass; portable schema 3 and database migration 2 remain current.
- `npm test`: **75 pass**, including five new PDF checks: every block family, source immutability, key exclusion/inclusion, safe escaped content/options, real tagged PDFs/paper sizes/logical order, actual endpoint validation, and no network requests to authored external links or script-looking text.
- `npm run test:integration`: **23 pass** against PostgreSQL, preserving ownership, save concurrency, legacy acknowledgements and source/asset persistence.
- Chromium suite: **37 pass**, including private-library PDF source/revision isolation, actual portable PDF download with expanded content and no key leakage, default-off/explicit answer option, Letter output, keyboard cancel/focus return, failed-export recovery and dialog accessibility scanning. All existing authoring, media, HTML, SCORM/complete-course resume and player usability checks pass.

Total: **135 automated checks pass**. An initial pair of new browser assertions matched both a hidden outline title input and the visible portable title input; those test selectors were corrected to use the visible textbox, and the final full run passes. No production validation or rate limits were weakened. CI installs browser/PDF inspection prerequisites before the unit suite; the updated GitHub workflow itself was not run remotely in this session.

## Production container and samples

The Docker image builds with system Chromium, CA certificates, Noto core/CJK fonts and production-pruned playwright-core. Installation uses normal proxy routing and TLS trust; the temporary combined certificate file is removed, and distribution package notices are retained. The runtime executes as the existing unprivileged application user. The final built server renders learner and answer-key PDFs through its real `/api/projects/pdf` endpoint, demonstrating that browser/native dependencies are present after pruning.

The final review artifacts are `artifacts/pdf-publishing/learning-that-travels.pdf`, `learning-that-travels-with-answers.pdf`, and the editable `learning-that-travels.openscroll`. They include representative media, interactive and assessment content plus long-form pagination. Sample PDFs were generated by the production container rather than relying only on the development browser version.

## Operational boundaries

PDF jobs share the existing one-at-a-time project-processing slot, enforce project/request/output limits, have a 45-second deadline, and close their fresh browser on success or failure. JavaScript/service workers are disabled, authored HTTP links are not fetched, and canonical images are embedded as data. Browser rendering is not a general URL-to-PDF endpoint. Canceling a client download does not instantly terminate an already-running server job, which remains bounded by the deadline. No remote browser credential, new database service, migration or portable schema version was introduced.

PDFs contain static authored content rather than a playable or tracked learner course. Companion PDF/media files are not embedded, TXT attachment text is readable, and the PDF answer appendix is intentionally distributable when enabled. Production hosting, VPS resource sizing/quotas and broader release/accessibility review remain later steps. The existing cloud workspace already has the required Chromium and inspection tools; no local-computer move or setup approval was needed.


Final production smoke: Chromium 155.0.8059.79 in the Debian 12 runtime generated the 12-page learner A4 PDF and 15-page Letter PDF with answers. Tags/language/bookmarks and full ending content passed; final text bounds were within safe margins. Chromium also downloaded a PDF through the production UI at 375 px width without overflow. The container app was stopped afterward, preserving PostgreSQL volumes, and the development app was restored on port 5173/API 3000 with ready/database-connected health.

The final narrow-dialog checkbox alignment adjustment also passes both focused PDF browser flows after rebuild. The Docker image was rebuilt with that UI change; PDF content generation is unchanged. The CLI successfully exported the sample project with answer-key/Letter options.
