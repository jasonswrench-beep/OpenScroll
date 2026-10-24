# Spreadsheet question import validation

Date: 2026-10-24 (America/New_York).

## Implemented behavior

**Import questions** in the stored lesson editor downloads CSV or genuine Excel `.xlsx` templates, uploads a spreadsheet for transient parsing, previews questions/errors and appends a validated batch as editable assessment blocks. Both original OpenStage CSV files remain compatible. No course or database schema migration is required.

The interface explicitly distinguishes Category/Value board metadata from assessment scoring. An optional Points column or the author's chosen default supplies 1–100 points per question. The preview is all-or-nothing, insertion is one history operation, and late/cancelled previews cannot edit the course.

See [author guide](QUESTION-IMPORT.md) for formats, mappings and limits.

## Source files and round-trips

- The supplied AI CSV has **20 MC questions**. Tests compare every prompt, option, answer index, correct/incorrect feedback, category and Value with the original rows. The imported blocks survive portable export/reopen.
- The supplied OpenStage template has **nine questions**, including TF. It imports with the original 12 columns and no Points column.
- A genuine `.xlsx` fixture generated independently by openpyxl contains the same 20 questions, with Questions intentionally second after Instructions. Every imported content/settings field matches the CSV results.
- Both generated downloadable templates round-trip six spreadsheet types (MC, TF, MR, FIB, MATCH, SORT). The generated Excel file was also opened/read with the independent openpyxl reader, validating its six data rows and 13 columns. Microsoft Excel desktop UI was not exercised here.

## Checks run

- `npm run build`: client, player, notices and server pass.
- `npm test`: **91 pass**, including ten new importer/API/export cases.
- `npm run test:integration`: **38 pass**; existing ownership, quota, save/recovery and import-rate protections are unchanged.
- Full Chromium browser suite: **46 pass**, including four new importer cases. A focused four-case rerun also passes after the final scoped form styling change.
- Total full-suite coverage: **175 passing tests**. Browser checks include actual grading feedback, saved/reopened blocks, portable file persistence, undo/redo, downloaded Excel template, supplied CSV and independent XLSX, invalid fields, invalid points, inert markup, mobile reflow/axe and cancelled late results.
- Imported question data is compared in HTML and both SCORM publication payloads. Actual PDF text extraction verifies all 20 prompts. Existing assessment/player/LMS harness cases remain green; no new real Brightspace tenant test is claimed.
- Production image `openscroll:question-import` builds. With networking disabled and a read-only filesystem, its compiled API imports all 20 questions from the independent Excel fixture and generates/reads the six-question Excel template. This is a local container smoke check, not a deployment.
- `npm run licenses`, `npm run schema:check`, TypeScript and whitespace checks pass. The new exact server-only XML parser and locked transitive packages have reviewed license metadata. The runtime npm audit reports zero known vulnerabilities at this check.

## Invalid input handling

Tests exercise missing/duplicate/unknown headers, unsupported types, missing choice keys, invalid points, malformed CSV quoting, UTF-16 and semicolon CSV, Excel shared/rich strings and typed boolean/numeric cells, formula rejection, XML entity/DTD rejection, macros, oversized ZIP expansion and upload/row limits. The real API checks failed parsing releases its existing processing slot. Only predefined XML entities are decoded; DTDs are rejected, parser nesting is bounded and external worksheet targets are refused. Neither spreadsheet formulas nor macros execute.

## Delivery boundary

This feature is implemented and locally tested. Jason subsequently authorized commit/push, a new private prerelease and coordinated VPS deployment. Hosted validation and the release notes must identify the exact source commit before publication. Existing alpha.1/alpha.2 releases, private visibility, network permissions and credentials must be preserved. Actual VPS mutation remains paused until the Hostinger deployment owner supplies current-state evidence and the required account/resource-specific confirmation; do not claim deployment from these local checks. Manual screen-reader, broader browser and actual Microsoft Excel desktop acceptance remain outside this automated validation.
