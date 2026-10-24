# Import assessment questions from a spreadsheet

Open a stored course, open the target lesson, and choose **Import questions** in the lesson toolbar. Download the Excel or CSV template from that dialog. Replace/delete its six example rows, add your own questions, then upload a `.xlsx` workbook or `.csv` file and choose **Preview questions**.

Preview changes no course content. It lists every valid question and identifies invalid rows. **All rows must be valid** before adding; no valid subset is silently imported. Choose default points and whether imported questions count toward the course score, then choose **Add N questions to lesson**. Questions are appended in file order as normal editable assessment blocks. One Undo removes the batch; Redo restores it. Autosave, revision conflict handling, recovery, portable projects, preview and publishing use the existing course mechanisms.

The workbook's visible **Questions** sheet is read when present; otherwise the first visible sheet is read. Other sheets are not imported. Files are sent to this instance for transient validation, not saved as spreadsheet uploads. Closing the dialog, changing the file or a failed preview leaves course content unchanged. A result from an earlier file/account/lesson cannot be inserted into another scope.

## OpenStage compatibility

Both supplied files use `Category, Value, Type, Question, A, B, C, D, E, Correct, Feedback if right, Feedback if wrong`. That format is accepted unchanged. Headers are case-insensitive, and the optional OpenScroll **Points** column is also supported. Type, Question and Correct headers are required. Unknown/duplicate columns are reported so data is not silently discarded.

**Category and Value are quiz-board metadata.** They are displayed in the import preview but are not added to assessment content or used as scores. This is stated in the dialog before insertion. In particular, the sample's board Values of 100–400 do not become assessment weights. Each question defaults to one point, or the author's chosen default; an explicit Points cell overrides it with a whole number from 1 to 100. Feedback if right/wrong maps directly to the existing correct/incorrect feedback fields.

| Type | A–E | Correct | Created block |
| --- | --- | --- | --- |
| MC | Two to five distinct choices | One letter, such as B | Single choice |
| TF | Blank | True or False | Single choice with automatic True/False options |
| MR | Two to five distinct choices | Letters separated by `\|`, such as `A\|C` | Multiple response |
| FIB | Blank | Accepted answers separated by `\|` | Fill in the blank |
| MATCH | Two to five `left \| right` pairs | Blank | Matching |
| SORT | Two to five items | Blank for A–E order, or each provided letter once in the desired order | Sorting |

Sparse choice columns are supported: an answer keyed D still refers to D when C is blank. Invalid/missing keys, duplicate choices, unsupported types, oversized fields and invalid points are row errors. Imported questions have unlimited attempts and are optional for completion until the author changes their normal assessment settings. Grading can be disabled in the dialog.

## File limits and behavior

- Up to 500 questions and a 2 MiB uploaded file. Normal lesson/course/project budgets still apply; insertion refuses an oversized combined course before changing content.
- CSV supports quoted commas, multiline fields, UTF-8/BOM, UTF-16 BOM and semicolon-delimited Excel CSV. CSV cell text is treated literally.
- Real `.xlsx` workbooks support inline/shared strings, rich-text strings and numeric/boolean cell values. Use plain text/values rather than formulas. Cached formula results are rejected to avoid importing stale or ambiguous answers. Excel error cells, macros, encrypted files, external worksheet references, invalid XML and unsafe archives are rejected.
- Legacy binary `.xls` and `.xlsm` are not supported. Save as `.xlsx` or UTF-8 CSV. No spreadsheet code, formula or macro is executed, and no external resource is fetched.
- XLSX processing is bounded to 128 ZIP entries, 4 MiB per entry, 8 MiB expanded, 2,000 physical rows and 32,000 cells. Very large formatting ranges should be removed or copied into a clean template.
- Assessment choice/accepted-answer labels retain the existing 300-character limit. This feature does not alter the portable schema or database schema.

## Verification

The author's 20-question AI CSV is checked row by row for every prompt, option, correct key, feedback and board metadata. An independently generated `.xlsx` copy places Questions second after Instructions and is checked against the same 20 source rows. The supplied nine-question OpenStage CSV, including true/false questions, is also tested. Both downloadable templates round-trip, and an independent openpyxl reader validates the generated Excel template.

Browser checks cover preview without edits, insertion, grading, persistence after reopening, portable export, undo/redo, template download, CSV and real XLSX, errors, cancellation/late results, inert markup, mobile reflow and axe checks. Imported content is verified through HTML, both SCORM editions and actual PDF text extraction. Existing manual accessibility, broader-browser and real-LMS release limitations still apply; this feature does not claim a new tenant test or deployment.

See [validation evidence](QUESTION-IMPORT-VALIDATION.md) for exact checks and delivery boundaries.
