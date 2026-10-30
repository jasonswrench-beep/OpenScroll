# CI PDF inspection portability

The first release commit is `15ded8731dd669c66f22fbef3940afa8aa242eb4`, tagged `v0.1.0-alpha.1`. Its hosted [run 40046710692](https://github.com/jasonswrench-beep/OpenScroll/actions/runs/40046710692) failed at `npm test`; detailed logs were unavailable under the cloud network policy.

CI-only commit `3ddf11b` adds Node's JUnit reporter and bounded GitHub check annotations. The [diagnostic run 40048073708](https://github.com/jasonswrench-beep/OpenScroll/actions/runs/40048073708) finished with a failing assertion at `tests/pdf-export.test.ts`: the `pdfinfo -struct-text` output did not contain the image alternative text. Installation and build succeeded; the unit failure skipped integration/browser steps.

## Reproduction and fix

The exact assertion failure was reproduced locally by selecting native `/usr/bin/pdfinfo` (Poppler 25.03.0). The preferred local inspection command reported 26.05.0 and printed alternative text in its structure dump; native Poppler did not. Direct pypdf inspection of the same PDF's structure tree confirmed that `/Alt` entries were present.

The test now uses `pdfinfo -struct-text` for reading-order inspection and checks alternative text directly in the PDF metadata. Both learner and answer-key editions must still contain the required alternative text, marked-content tags, heading/Figure roles, language, outlines, links, complete content and correct paper dimensions. Answer leakage and external-network isolation checks remain unchanged. No exporter or application code was changed.

All 81 unit tests pass with native Poppler 25.03.0 after this change. The original failure was observed before the change, so this is a reproduced inspection-tool compatibility fix rather than a speculative exporter workaround. A real intentionally failing Node test also confirmed that the JUnit annotation helper exposes assertion details safely.

## Publication

The published alpha tag and its source/deployment ZIP are preserved. A later release that includes this CI/test correction needs a new commit/tag and a freshly checksummed package. Do not move the existing alpha tag or silently replace its archive. Hosted validation of the follow-up commit must be read from its own CI run, not inferred from local results.

## Browser fixture rate budget

The [follow-up run 40049816499](https://github.com/jasonswrench-beep/OpenScroll/actions/runs/40049816499) passed unit tests, migrations and database integration, then finished with 41 browser cases passing and one template case failing. Its template course title stayed empty. The same symptom was reproduced locally by consuming ten real imports, then creating a template through the UI: the next import returned HTTP 429 and the dialog displayed the rate-limit error.

Block and outline editor tests previously imported a starter through the public API for every fixture. Together with real import flows elsewhere, this consumed the shared per-IP budget on a faster CI run before template creation. Their setup now transactionally seeds only their own synthetic course and asset rows, consistent with the other editor/media suites; actual authoring operations still use the real application. Template creation explicitly asserts a successful real import response. Production rate limits are unchanged, and a PostgreSQL regression case checks ten accepted imports followed by an eleventh rejected import with no extra record. No wait or weakened limit is used to hide the problem.

## Isolated PDF renderer checks

Current PDF checks require the separate renderer service, rather than a browser
started inside the app process. CI builds that image and starts its disposable
network-disabled socket service before running source/unit/browser tests. The
container job builds the final app and renderer images, checks actual authorized
PDF output and unauthorized denial, runs isolation probes, and scans both images.
The source suites still inspect PDF structure/answer separation and learner
behavior; they do not replace the container/process/network evidence.

Read [container validation](CONTAINER-SECURITY.md) for the current commands, scan
artifact names and gate. Results from the historical runs above are evidence for
those commits only. Record terminal checks for the actual reviewed isolation
head before accepting it. A successful scan gate does not resolve the documented
upstream Chromium package gap or remaining native-library findings.
