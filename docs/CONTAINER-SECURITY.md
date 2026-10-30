# Container security validation

The Docker build and source checks use Node 24.22.2. Docker stages pin the
official `24.22.2-bookworm-slim` multi-platform image digest. Keep the Dockerfile,
`.node-version`, package engine requirement and lockfile engine requirement in
sync when updating Node. Node 24.22.1 contains the October 2026 security fixes;
24.22.2 is the compatible patch selected here.

Build and validate **both** final images. The app target does not install a
browser or fonts; the separate `renderer` target contains Debian Chromium,
Noto core/CJK fonts and required native libraries. The renderer copies its worker,
protocol and `playwright-core`, without the app, database/mail modules or private
configuration. Both targets update installed Debian packages and remove runtime
npm, npx, Corepack and Yarn. Dependency installation occurs in the build stage;
startup and deployment operations invoke Node directly. The Perl/PCRE2 minimum
package checks remain in the builds.

Debian packages remain current at build time; the Node base digest does not pin
every final package. Keep the final scan inventories and image identities for
the actual image pair being considered for release. The current Bookworm
Chromium `.73` package is below the upstream `.79` security release. Do not read
containment or a passing scan gate as installing the missing fixes. See
[browser patch availability and residual exposure](RENDERER-ISOLATION.md#browser-patch-availability).

## Local validation

Use Docker, Node from `.node-version`, and Poppler's `pdftotext` and `pdffonts`:

```sh
docker build --pull --target runtime --tag openscroll:checked .
docker build --pull --target renderer --tag openscroll:renderer-checked .
node tools/container-smoke.mjs openscroll:checked openscroll:renderer-checked
node tools/renderer-isolation-smoke.mjs openscroll:renderer-checked openscroll:checked
```

The optional second image argument supplies a smaller trusted Node image for
builtins-only local network canaries; renderer-boundary checks still target the
first image. This avoids unnecessary browser filesystem copies on VFS hosts.

In a managed environment that requires a proxy CA, pass the supported secret to
each build: `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"`. The certificate is not
copied into final image layers. Keep the platform's supported proxy settings for
build downloads; production renderer jobs have no network route or proxy use.

The container smoke test creates uniquely named disposable services, a private
database, a socket volume and a renderer with `network_mode: none`. It uses no
host database, published host port, `.env` file, real email provider or live
installation. It checks migrations, health, the built application, unprivileged
app startup, anonymous API denial, explicit synthetic owner access, a real PDF
request, embedded fonts and extracted Latin/CJK text. Test resources are removed
afterward.

The isolation smoke test checks the actual worker boundary separately from
browser policy: process identity/capabilities, credential absence using synthetic
fixtures, private mounts/PID namespaces, denied network access and bounded job
failure/cleanup. Its evidence must identify exactly which probes ran. An aborted
Playwright request or an inert authored script alone does not prove kernel
network denial, and sanitizing `process.env` alone does not prove isolation.

The renderer's root supervisor is distinct from the unprivileged browser job;
see [the UID/capability and deadline design](RENDERER-ISOLATION.md). Do not remove
resource limits or weaken the host security profile to make a test pass. Browser
and Fontconfig caches use writable temporary storage in the renderer, without
making its root filesystem writable.

## Runtime database role checks

The production app receives only the restricted `DATABASE_URL`/`openscroll_app`
connection. Bootstrap provisioning and backup/restore use the existing
administrator separately; migrations and the maintenance admin CLI use
`ADMIN_DATABASE_URL`/`openscroll_migrator`. Neither privileged connection or its
password is passed to the running app, and the renderer receives no database
configuration. Direct host startup uses the filtering `npm start`/`npm run dev`
launchers; raw app startup requires an explicitly runtime-only environment.

Validation must demonstrate real denial through the restricted login, rather
than merely checking its configured role name: no privileged attributes or
memberships, object ownership, DDL, schema/temporary/large-object creation,
migration-history changes, audit update/delete or account owner-role writes.
Normal account/session/course operations and audit insertion must still work.
Migrations/admin commands must use the separate schema-owner connection. Also
verify the app rejects an administrative login or privileged database variables
before opening its HTTP listener.

The provisioning/upgrade/restore checks use unique disposable databases and
synthetic data, including preserved account/course identities and an isolated
restore without old owners/ACLs followed by role/grant reapplication. A source
unit assertion or a successful app query alone does not prove the database
privilege boundary. Test helpers with bootstrap/admin credentials are trusted
fixtures; their connections must not be reused by the app under test. See
[database privileges, credential input and recovery](DATABASE-PRIVILEGES.md).

This role change adds no browser patch or application data migration beyond the
existing schema 5. Unknown objects or unsafe designated roles must fail closed
and remain available for investigation; tests must not delete them or grant
superuser privileges to make setup succeed.

## CI scans and interpretation

The `container` job builds and tests both final images, then uses pinned Trivy
0.76.1 to scan all installed OS and Node packages in each image. The
`final-container-vulnerabilities` artifact retains complete `app-trivy.json` and
`renderer-trivy.json` inventories for 14 days, including findings without a
published fix. The existing report step runs for each inventory and rejects
high/critical findings with a reported published fix. Scanner/database failures
also fail CI; a missing scan is not a clean scan. No finding is suppressed to
obtain a green check.

Keep app and renderer findings separate. Removing native browser packages from
the app reduces their presence there; those packages still need review in the
renderer image. Do not add the two images' record counts and call the result a
unique-CVE total: shared packages and CVEs can occur in both inventories. Review
vendor status, source-package families and actual component reachability as well
as severity and fix availability. Missing scanner records for an alternative
browser package would not establish that the browser is safe.

The six original screenshot reports exposed only ten individual findings and
overlapped one Dockerfile/base-image report. Complete final-image scans include
installed native and application dependencies and use a different scanner
inventory. Their counts cannot be treated as a direct before/after comparison to
the screenshots' 121 findings. A package finding alone does not establish
reachability or exploitability in OpenScroll. Equally, no packaged fix or no
obvious JavaScript import does not establish that a native library is unreachable.

These checks build and test disposable local images. They do not push images,
merge branches or deploy the application. Hostinger settings and external
deployment hooks are outside the repository's checks and must be inspected
separately before deployment. Browser patch availability, full residual review,
production host isolation/capacity and the normal operator release checks remain
prerequisites for a live release.
