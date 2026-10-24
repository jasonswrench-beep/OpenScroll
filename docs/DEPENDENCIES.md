# Dependency review

Direct versions are exact in package.json; transitive versions and integrity hashes are captured in package-lock.json. Node is pinned in .node-version and Dockerfile. PostgreSQL is pinned by version and image digest in Compose and CI.

| Component | Use | License |
| --- | --- | --- |
| Fastify, @fastify/static | HTTP API and built asset serving | MIT |
| @fastify/cookie, @fastify/rate-limit | Cookie handling and request limits | MIT |
| Nodemailer | SMTP email delivery | MIT-0 |
| @types/nodemailer | Development mail type declarations | MIT |
| pg | PostgreSQL driver | MIT |
| Zod | Shared structural validation and JSON Schema generation | MIT |
| yauzl | Lazy, bounded ZIP import | MIT |
| yazl | ZIP project export | MIT |
| @types/yauzl, @types/yazl | Development ZIP type declarations | MIT |
| Vite | Browser development/build | MIT |
| TypeScript | Type checking/compiler | Apache-2.0 |
| tsx | Development/test TypeScript execution | MIT |
| @types/node, @types/pg | Development type declarations | MIT |
| Playwright | Browser test runner | Apache-2.0 |
| axe-core, @axe-core/playwright | Development accessibility checks | MPL-2.0 |
| Lightning CSS | Transitive Vite build tooling | MPL-2.0 |
| PostgreSQL | Separate database service | PostgreSQL License |
| Node.js | JavaScript runtime | MIT and bundled third-party notices |

MPL components are unmodified build/test dependencies, not application runtime dependencies. No MPL source is copied into OpenScroll. MPL is file-level copyleft; retain its license/source notices if distributing those tools. Production pruning excludes them. Generated CSS is application output. No GPL/AGPL package was found in the locked npm dependency metadata.

`npm run licenses` rejects missing or unreviewed license metadata and allows the explicitly reviewed MPL build/test packages. Metadata review is an initial guard, not a substitute for reviewing new code/assets or packaging obligations. Dependency license files remain in installed packages; upstream source is identified by package metadata and the lockfile. Revisit the review when adding or updating dependencies.

The foundation's production npm audit reported zero known vulnerabilities at validation time. An audit is a point-in-time database check, not a security guarantee.

Standalone HTML publications include bundled Zod validation and Vite's generated preload helper. `tools/player-notices.ts` collects their license texts during build into the exported `THIRD-PARTY-NOTICES.txt`, alongside the OpenScroll license and notice. No authoring-server dependency or test tool is shipped as a player runtime dependency.

Step 11 promotes `playwright-core@1.64.1` (Apache-2.0, already present through the test runner) to an exact production dependency for local Chromium PDF printing. No browser executable is downloaded by npm or shipped inside exported HTML/SCORM players. The Docker runtime separately installs Debian Chromium (BSD-style Chromium code and bundled component licenses), native system dependencies, and Noto fonts (SIL Open Font License and package notices). Their distribution notices remain under `/usr/share/doc`; corresponding Debian source packages are available through the Debian sources/security archive for the installed package versions. System packages have their own mixed licenses; the npm allowlist does not audit them. The generated PDF embeds font subsets under their embedding permissions. The OpenScroll application license and authored content rights are unchanged.

PDF inspection uses pypdf (BSD-3-Clause) and Poppler command-line tools in development/CI only. No Python PDF library or inspection tool is included in the application runtime. Refresh Chromium's Debian security package on rebuild and verify generated output; the system browser version is independent of the exact Playwright API version.

Question spreadsheet import adds exact `fast-xml-parser@5.11.2` (MIT) on the server to parse bounded XLSX worksheet/shared-string XML. Existing yauzl/yazl provide bounded ZIP reading and template writing. XML declarations with DTD/entities, formulas, macros and invalid cells are rejected; no spreadsheet parser is included in learner exports. Transitive licenses are checked by `npm run licenses`.
