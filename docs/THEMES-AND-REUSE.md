# Themes and reusable content

Step 12 adds theme controls, original course templates, composed learning layouts, private reusable content, and named course snapshots. Portable schema 3 remains current; no new block types or linked external content are required.

## Themes and templates

Use **Course theme** in the outline or portable project workspace. Four presets set accent color, sans/serif font and standard/wide reading width. Individual controls also support custom settings. Preview, HTML and SCORM share the settings. Light accents use readable foregrounds and a darker navigation/progress color. PDF carries the accent and font; paper size determines its width.

In the library choose **Start from a course template** for Focused short course, Welcome and orientation, or Guided workshop. These are original OpenScroll content. Each creates an independent course with fresh content and asset IDs. **Save as course template** saves a compact copy of the current draft to your private reusable library, including referenced assets. Saving a reusable draft does not confirm the active course's autosave. Browse saved templates from the same template dialog to create a new editable course.

## Groups, layouts and assets

Inside a lesson, **Learning layouts** inserts Concept and example, Compare and reflect, or Practice and feedback. These combine existing editable blocks; authors can change or remove every part. Image/text layouts reflow on narrow screens and become ordered static content in PDF.

Select the Reuse checkboxes on block headers, then **Save selected blocks**. **Saved groups** searches saved names and inserts a copy in authored order. Each insertion receives fresh block IDs, remaps asset references and participates in lesson undo/redo. Editing an inserted copy leaves the saved source unchanged. Deleting a saved item leaves existing inserted copies unchanged.

**Asset library** searches the open course by filename or media type. Insert an image, audio, video or attachment block, or save an asset to the private library with a descriptive name. **Browse saved assets** searches names, filenames and media types. Compatible identical bytes are reused instead of duplicated. Supported uploads retain safe original filenames; archive storage paths remain canonical IDs. Set alternative text, transcripts and captions for the context where you use the asset. Reuse does not bypass publishing checks.

Saved items can also be downloaded as portable editable projects. Private saved libraries require an author account; portable projects retain theme settings and copied content without requiring a connection to their source account.

## Snapshots and restoration

Choose **Snapshots** in a stored course. A named snapshot captures the confirmed saved revision and all its asset bytes, not an unfinished recovery draft. Resolve save conflicts before creating or restoring snapshots. Snapshots can be downloaded as `.openscroll` projects.

**Restore snapshot** first saves a **Before restore** safety snapshot of the current server revision. It then restores historical content through the normal revision-checked save path. The course retains its identity and creation date, and restoration creates a new revision. Concurrent edits cause a conflict rather than being silently overwritten. Historical asset bytes remain available even if the active course has since removed them; current assets are retained during restoration as well. If the combined project exceeds the normal project budget, restoration refuses before editing. Download the snapshot and import a separate course instead.

A failed or uncertain save remains subject to the normal draft/retry recovery controls. Snapshots capture authored content, not learner progress or LMS attempt state. Changing a published course does not migrate existing learner attempts.

## Retention and installation

Database migration **3** adds reusable items and snapshots. Run `npm run db:migrate` on an existing installation before using this step. No new dependency, external service, secret or portable schema version is introduced.

Limits are 100 reusable items per author, 10 snapshots per course and 256 MiB of stored JSON across that author's reusable items and snapshots. These records include encoded asset bytes. Normal project/archive/upload limits still apply. Creation is transactional and account-serialized, with stable request IDs for safe retries. Quota exhaustion requires explicitly deleting unneeded records; nothing is automatically evicted. Leave a snapshot slot available for restoration's safety copy.

Deleting a course permanently deletes its snapshots. Reusable items are independent and remain until explicitly deleted or the owning account is removed. Database backups must include these tables. Snapshots in the same database are not an independent disaster recovery backup.

See the [block compatibility matrix](BLOCK-COMPATIBILITY.md), [validation evidence](STEP-12-VALIDATION.md), and [autosave guide](COURSE-ORGANIZATION.md).
