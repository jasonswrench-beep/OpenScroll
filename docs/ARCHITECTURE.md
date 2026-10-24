# OpenScroll architecture plan

Status: Steps 2–5 foundation, portable project format, accounts, private library, and outline autosave implemented and validated locally. Production deployment remains Step 13 work.

## System boundaries

Use TypeScript for the browser application, shared course model/validation, rendering, and server API. PostgreSQL stores users, course records, ownership, and version metadata. An asset adapter supports local persistent storage first and S3-compatible storage later. Docker Compose provides a reproducible application/database deployment behind an HTTPS reverse proxy.

Step 2 selected Vite with framework-independent TypeScript for the initial browser shell, Fastify for the API, and node-postgres for PostgreSQL. Exact dependencies and integrity hashes are locked. PostgreSQL 17 runs through Compose; the application also has a non-root container build. Local Linux validation passed; actual Hostinger capacity and compatibility remain to be checked in Step 13. See DEVELOPMENT.md and DEPENDENCIES.md.

## Proposed components

| Component | Responsibility |
| --- | --- |
| Web editor | Library, outline, block authoring, preview controls, save state |
| Shared course model | Versioned types, validation, migrations, asset references |
| Block registry | Type-specific defaults, editor controls, validation, renderer, print mapping |
| Shared player | Responsive blocks, navigation, interactions, completion and assessment state |
| Server API | Authentication, ownership checks, persistence, asset access, export requests |
| Export pipeline | Portable project packaging, static HTML, SCORM adapters, PDF generation |
| Infrastructure | Database, persistent assets, email adapter, backups, health checks |

Share block rendering between editor and player. Editor controls wrap the rendered content rather than creating an independent presentation implementation. PDF uses explicit print mappings from the same content model; it does not require identical interactive markup.

Keep learner state separate from course content. Use adapters for preview state, standalone progress where supported, and SCORM persistence. A receiving LMS owns centralized tracking. OpenScroll does not store learner activity merely because it authored a course.

## Persistence and asset lifecycle

Use stable IDs and relative package asset references. The server translates authorized references into delivery URLs. Never rely on an unguessable URL as ownership enforcement. Define transactional save/version behavior and optimistic conflict handling before autosave is complete.

Duplication, snapshots, deletion, and export must have explicit asset-reference semantics. Garbage collection cannot remove assets still needed by another course version or an in-progress export. Large exports may require a bounded background worker; decide from measurements rather than making all requests unbounded server operations.

## Security and operational requirements

Use established authentication primitives, secure session cookies, password hashing, reset-token expiration, request validation, rate limits, and CSRF protection appropriate to the chosen framework. Enforce ownership on course, asset, snapshot, import, and export routes. Avoid revealing whether an inaccessible resource exists.

Validate uploads and imports, including archive traversal, decompression limits, executable content, and missing asset references. Sanitize authored rich text and restrict embed destinations/content. Arbitrary scripts are deferred. Secrets belong in deployment configuration, not course files, browser bundles, repository files, or logs.

Keep registration policy, application URL, email, database, storage, quotas, and proxy behavior configurable. No credentials or VPS changes are required for Step 1.

## Deployment and self-hosting

Provide a production Compose configuration, persistent volumes, health checks, explicit migrations, and documented upgrades. Serve application traffic over HTTPS. Document filesystem permissions and backup/restore for both database and media. Verify recovery with an actual restoration exercise.

The initial deployment targets Jason's Hostinger VPS; capacity and existing workloads must be inspected before deployment. Later self-hosting must not depend on Jason's domain, credentials, hosted API, or storage account. Configuration documentation and a fresh-install check are release requirements.

## Verification approach

- Unit checks: schema validation, migrations, assessment evaluation, completion rules, export mappings.
- Integration checks: database saves, account isolation, asset authorization, archive import/export, SCORM adapters.
- Browser checks: complete authoring workflows, recovery, preview, keyboard operation, responsive layouts.
- Manual checks: screen readers, actual LMS interoperability, PDF structure/readability, backup restoration.

Use representative tests with real assertions. Distinguish mock validation from real integrations and automated accessibility scans from manual accessibility verification.

## Implementation constraints

Review dependency licenses and maintain attribution. Keep project data independent of rendering frameworks and AI providers. Prefer a small working vertical slice over an extensive empty block catalog. Record material architecture choices and their consequences as decision records when they are made.

## Step 3 implementation boundary

`src/shared/course.ts` defines the independent versioned course contract. `src/project/archive.ts` provides bounded ZIP packaging and validation; `src/server/project-routes.ts` exposes transient operations without database or filesystem persistence. The browser keeps one open project in memory and renders user text through safe DOM properties. See [FORMAT-SPEC.md](FORMAT-SPEC.md) for the format and migration policy. Step 4 adds explicit account-owned library copies; Step 5 adds the full outline and save workflow.

## Step 4 persistence and accounts

Transactional migrations create authors, hashed-token sessions, one-time account tokens, owned courses, and binary course assets. Account routes establish identity and CSRF checks before library body parsing. Library queries scope reads and mutations to the authenticated owner. Creation/import/duplication commit the document and assets together; deletion cascades asset rows. See [accounts and library](ACCOUNTS-AND-LIBRARY.md) for protections, defaults, and remaining deployment requirements.

## Step 5 outline writes

Stored course revisions and the last mutation digest are server metadata, not part of the portable format. A locked transaction validates owner, expected revision, immutable identity, references, and asset inventory before replacing the document and optional asset rows. Browser saves are serialized and retry the same mutation after ambiguous failures. IndexedDB recovery is keyed by author/course and retains pending request identity; conflicts require an explicit recovery choice rather than forced overwrite. See [course organization](COURSE-ORGANIZATION.md).

## Step 6 block composition

`src/shared/block-catalog.ts` provides original typed defaults, compatible variants, and block duplication. `block-renderer.ts` and `blocks.css` expose semantic rendering with optional text bindings; editor controls wrap that content. `src/client/block-editor.ts` connects per-lesson session history, insertion, appearance, and media settings to the existing save controller. Block history deliberately retains course assets and does not alter server revision semantics. Portable v1 and migration 2 remain unchanged. See [BLOCK-EDITOR.md](BLOCK-EDITOR.md); the learner player and exports are still subsequent work.

## Step 7 player and static publication

`src/player/state.ts` owns learner navigation, gate release, review acknowledgement, completion, and validated resume without mutating the document. `player.ts` wraps the shared renderer with learner controls. Author preview passes a cloned snapshot through a verified same-origin iframe exchange; its state stays in memory. Static output loads relative course/publication JSON and assets and stores optional progress under a content fingerprint. `src/project/html-export.ts` validates snapshots and follows the trusted Vite player dependency graph, including runtime notices and excluding authoring code. The route shares transient archive-processing limits. No author account or API is required by published output. See [HTML-PUBLISHING.md](HTML-PUBLISHING.md).

## Step 8 media and structured content

Portable schema 2 extends the discriminated block union; `parseCourse` copies valid v1 input into v2 without rewriting files or stored rows. New asset references are validated and remapped during course duplication. `extended-renderer.ts` supplies semantic media/interaction DOM and static print flattening, while `extended-settings.ts` and guarded nested content paths support structured authoring. Native caption tracks are generated from validated cue data; uploads remain bounded course assets. Learner disclosure/playback state is transient; existing Continue acknowledgement state stays separate. Legacy pending-save digests remain valid for an exact v1 acknowledgement. See [MEDIA-AND-INTERACTIONS.md](MEDIA-AND-INTERACTIONS.md).

## Step 9 assessment state

Portable v3 stores a typed assessment family and optional required exploration flags; supported earlier versions migrate on copies. Shared assessment validation and grading are independent of DOM/player state. The learner engine tracks drafts, attempts, best/last answers, unique item visits, gate releases, and completion, and computes weighted success separately. Version 2 learner snapshots normalize through the same rules on restore, including older v1 snapshot support. Disclosure callbacks update gates without rebuilding interaction DOM. Author state, recovery, and SQL revisions never contain learner responses. See [ASSESSMENTS-AND-COMPLETION.md](ASSESSMENTS-AND-COMPLETION.md).

## Step 10 SCORM adapter

`src/project/scorm-export.ts` reuses validated HTML publication files, replaces publication metadata, and adds an edition-specific single-SCO manifest. `src/player/scorm.ts` discovers an LMS API, owns its lifecycle, validates fingerprint-bound indexed checkpoints, derives aggregate outcomes with CourseFlow, and reports time/status/score. `main.ts` provides save, error/retry, recovery download and exit controls outside the player render root. SCORM bypasses HTML local storage; author preview bypasses LMS discovery. Read-only launches never write learner outcomes. Brightspace tenant validation remains a separate gate; see SCORM-PUBLISHING.md.

## Step 11 PDF pipeline

`src/project/readiness.ts` centralizes publication readiness for HTML, SCORM and PDF. `pdf-html.ts` provides an exhaustive static mapping of the discriminated block union, escapes authored text, embeds only validated image data and expands all course content without CourseFlow. It parses strict paper/key options and builds a learner copy or optional answer-key appendix. `pdf-export.ts` prints it in a fresh isolated local Chromium context using playwright-core, with tags/bookmarks and footer pagination, a deadline and output size bound. The project-route processing slot bounds concurrent jobs. `publishing.ts` owns an accessible options dialog and cloned editor snapshot; generated PDFs never enter the author database or learner state. Portable schema 3 and migration 2 are unchanged. See PDF-PUBLISHING.md for engine assumptions, resource behavior and accessibility limits.

## Step 12 reusable content and snapshots

Database migration 3 stores owner-private reusable project packets and per-course immutable snapshots, including their own encoded asset bytes. Account-row locking serializes quota checks and creation across both tables; stable request IDs make exact retries idempotent. Restoration creates a safety snapshot and uses the existing revision-checked course save path. Normal course-asset pruning cannot remove historical snapshot bytes. Course deletion cascades snapshots while independent reusable items remain. See [themes and reuse](THEMES-AND-REUSE.md) for limits, deletion and backup behavior.
