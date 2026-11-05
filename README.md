# OpenScroll

[Roadmap & Feature Requests](https://app.productbridge.io/widget/784db895-cb64-45f4-9bde-4645df4aa083?tab=roadmap)

<img src="src/assets/openscroll.svg" width="96" height="96" alt="OpenScroll official icon">

An open-source, web-based tool for authoring responsive, block-based eLearning courses. Part of the OpenStage product family.

Authors will organize courses into sections and lessons, edit prebuilt blocks, preview the learner experience, and publish standalone HTML, SCORM, or PDF. Editable projects will be portable. Author accounts support the hosted website, with independent self-hosting documented and tested locally. OpenScroll is an authoring tool, not an LMS.

## Project status

Steps 1–12 are implemented; Step 13 production preparation is available, with live VPS deployment pending access and configuration. Validation evidence and remaining external checks are documented below. Authors can manage a private library and organize course metadata, covers, sections, and lessons with autosave, conflict protection, and browser recovery drafts. Portable `.openscroll` projects retain course content and assets. The lesson editor now supports core blocks, in-place text editing, image settings, ordering, compatible templates, and undo/redo. Desktop/tablet/phone preview and standalone HTML ZIP publishing now use the shared learner player, with lesson progress and Continue behavior. Galleries, uploaded media with transcripts/captions, attachments, link buttons, and accessible interactive blocks are implemented. Assessments now support feedback, retries, weighted scoring, required interactions, and resumable learner state. SCORM 1.2 and SCORM 2004 4th Edition exports now include LMS tracking and resume; both editions passed user acceptance in Brightspace, while detailed gradebook/resume/retake evidence remains unrecorded. PDF publishing now includes cover, linked contents, page numbers, expanded static content and an optional answer key; tagged-output checks pass, with manual screen-reader validation still pending.

- [Spreadsheet assessment import: Excel and CSV templates](docs/QUESTION-IMPORT.md)
- [Production installation, backups and operator guide](docs/SELF-HOSTING.md)
- [Database runtime/migration privileges and credential separation](docs/DATABASE-PRIVILEGES.md)
- [Current security draft deployment handoff](DEPLOYMENT-HANDOFF.md)
- [Step 13 preparation and validation](docs/STEP-13-VALIDATION.md)
- [Themes, templates, reusable assets and snapshots](docs/THEMES-AND-REUSE.md)
- [Block compatibility matrix](docs/BLOCK-COMPATIBILITY.md)
- [Step 12 validation results](docs/STEP-12-VALIDATION.md)
- [Assessments and completion](docs/ASSESSMENTS-AND-COMPLETION.md)
- [PDF publishing](docs/PDF-PUBLISHING.md)
- [Separate PDF renderer boundary and operator guide](docs/RENDERER-ISOLATION.md)
- [Step 11 validation results](docs/STEP-11-VALIDATION.md)
- [SCORM publishing and Brightspace checks](docs/SCORM-PUBLISHING.md)
- [Step 10 validation results](docs/STEP-10-VALIDATION.md)
- [Step 9 validation results](docs/STEP-9-VALIDATION.md)
- [Media and interactions](docs/MEDIA-AND-INTERACTIONS.md)
- [Step 8 validation results](docs/STEP-8-VALIDATION.md)
- [Preview and HTML publishing](docs/HTML-PUBLISHING.md)
- [Step 7 validation results](docs/STEP-7-VALIDATION.md)
- [Core block editor](docs/BLOCK-EDITOR.md)
- [Step 6 validation results](docs/STEP-6-VALIDATION.md)
- [Course organization and autosave](docs/COURSE-ORGANIZATION.md)
- [Step 5 validation results](docs/STEP-5-VALIDATION.md)
- [Accounts and course library](docs/ACCOUNTS-AND-LIBRARY.md)
- [Step 4 validation results](docs/STEP-4-VALIDATION.md)
- [Development and startup instructions](docs/DEVELOPMENT.md)
- [Editable project format](docs/FORMAT-SPEC.md)
- [Starter project](examples/welcome.openscroll)
- [Step 3 validation results](docs/STEP-3-VALIDATION.md)
- [Step 2 validation results](docs/STEP-2-VALIDATION.md)
- [Product specification](docs/PRODUCT-SPEC.md)
- [Architecture plan](docs/ARCHITECTURE.md)
- [Implementation checklist](docs/IMPLEMENTATION-PLAN.md)

Initial production hosting is planned for a Hostinger VPS. Accessibility, original content and design, and portable course files guide implementation.

## License

Apache License 2.0. See [LICENSE](LICENSE).

Hosted authoring requires verified email and approval from that installation’s owner. The public homepage links to independent self-hosting; see [instance access and owner activation](docs/INSTANCE-ACCESS.md). No central approval service is required.

PDF generation runs in a separate credential-free container with no network access, bounded resources and a supervisor deadline. The app has no in-process browser fallback. Review [renderer isolation and its limits](docs/RENDERER-ISOLATION.md) before enabling PDF publishing.

The running app uses a restricted PostgreSQL role; schema migration and host account maintenance use a separate non-superuser role, while bootstrap credentials are reserved for provisioning and backup/restore. See [database privilege boundaries and cutover requirements](docs/DATABASE-PRIVILEGES.md). This engineering draft is not a deployment approval.
