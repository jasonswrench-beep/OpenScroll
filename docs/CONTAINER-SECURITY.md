# Container security validation

The Docker build and source checks use Node 24.22.2. Both Docker stages pin the
official `24.22.2-bookworm-slim` multi-platform image digest. Keep the Dockerfile,
`.node-version`, package engine requirement and lockfile engine requirement in
sync when updating Node. Node 24.22.1 contains the October 2026 security fixes;
24.22.2 is the compatible patch selected here.

The runtime updates installed Debian packages before installing Chromium and Noto
fonts. The build refuses Perl older than `5.36.0-7+deb12u4` or PCRE2 older than
`10.42-1+deb12u1`. Debian updates remain current at build time; the base digest
alone does not pin every final package. Preserve the final scan inventory for the
specific image that will be deployed. Runtime npm, npx, Corepack and Yarn are
removed because application startup and deployment operations invoke Node
directly. Dependency installation still occurs in the separate build stage.

Run the final-image checks locally with Docker, Node from `.node-version`, and
Poppler's `pdftotext` and `pdffonts` installed:

```sh
docker build --pull --tag openscroll:checked .
node tools/container-smoke.mjs openscroll:checked
```

In a managed environment that requires a proxy CA, pass the supported secret to
the build: `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"`. The certificate is not
copied into the image.

The smoke test creates uniquely named disposable containers and an internal
network. It uses no host database, host port, `.env` file, email provider, or live
installation. It verifies migrations, health, the built application, runtime
package versions, a real PDF request through system Chromium, embedded fonts,
and extracted Latin/CJK text. The app runs as its unprivileged user with a
read-only filesystem. Test resources are removed afterward.
Chromium and Fontconfig use the image's XDG cache/configuration paths under `/tmp`,
which must remain writable in read-only deployments.

The `container` CI job builds and tests the final image, then uses pinned Trivy
0.76.1 to scan all installed OS and Node packages. It retains the complete JSON
inventory as `final-container-vulnerabilities` for 14 days, including findings
without a published fix. The report step rejects high/critical findings with a
published fix. Scanner/database failures also fail CI; a missing scan is not a
clean scan.

The six original screenshot reports exposed only ten individual findings and
overlapped one Dockerfile/base-image report. A complete final-image scan also
includes Chromium, fonts and application dependencies, and uses a different
scanner database. Its counts cannot be treated as a direct before/after
comparison to the screenshots' 121 findings. A package finding alone does not
establish reachability or exploitability in OpenScroll. Review remaining Debian
findings and their vendor status before deployment; do not suppress them merely
to obtain a green check.

These checks build and test local images. They do not push images or deploy the
application. Hostinger settings and external deployment hooks are outside the
repository's checks and must be inspected separately before deployment.
