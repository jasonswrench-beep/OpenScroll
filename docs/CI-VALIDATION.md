# CI PDF inspection portability

The first release commit is `15ded8731dd669c66f22fbef3940afa8aa242eb4`, tagged `v0.1.0-alpha.1`. Its hosted [run 40046710692](https://github.com/jasonswrench-beep/OpenScroll/actions/runs/40046710692) failed at `npm test`; detailed logs were unavailable under the cloud network policy.

CI-only commit `3ddf11b` adds Node's JUnit reporter and bounded GitHub check annotations. The [diagnostic run 40048073708](https://github.com/jasonswrench-beep/OpenScroll/actions/runs/40048073708) finished with a failing assertion at `tests/pdf-export.test.ts`: the `pdfinfo -struct-text` output did not contain the image alternative text. Installation and build succeeded; the unit failure skipped integration/browser steps.

## Reproduction and fix

The exact assertion failure was reproduced locally by selecting native `/usr/bin/pdfinfo` (Poppler 25.03.0). The preferred local inspection command reported 26.05.0 and printed alternative text in its structure dump; native Poppler did not. Direct pypdf inspection of the same PDF's structure tree confirmed that `/Alt` entries were present.

The test now uses `pdfinfo -struct-text` for reading-order inspection and checks alternative text directly in the PDF metadata. Both learner and answer-key editions must still contain the required alternative text, marked-content tags, heading/Figure roles, language, outlines, links, complete content and correct paper dimensions. Answer leakage and external-network isolation checks remain unchanged. No exporter or application code was changed.

All 81 unit tests pass with native Poppler 25.03.0 after this change. The original failure was observed before the change, so this is a reproduced inspection-tool compatibility fix rather than a speculative exporter workaround. A real intentionally failing Node test also confirmed that the JUnit annotation helper exposes assertion details safely.

## Publication

The published alpha tag and its source/deployment ZIP are preserved. A later release that includes this CI/test correction needs a new commit/tag and a freshly checksummed package. Do not move the existing alpha tag or silently replace its archive. Hosted validation of the follow-up commit must be read from its own CI run, not inferred from local results.
