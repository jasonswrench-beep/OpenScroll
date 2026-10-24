# OpenScroll deployment handoff — 2026-10-23

This archive contains the source and deployment files prepared in the **Set up OpenScroll** cloud workspace through Step 13. It is the reviewable handoff, not a claim that these changes have been pushed to GitHub.

Repository: https://github.com/jasonswrench-beep/OpenScroll

## Target

Deploy alongside Pressbooks and other applications on Jason's existing Hostinger VPS. Inspect its workloads, listeners, reverse proxy, free disk and memory first. Preserve existing services, ports, database volumes and routes. Product name: OpenScroll. A public subdomain will be chosen later; do not invent one or change DNS now.

## Review first

- `docs/SELF-HOSTING.md`: complete installation, configuration, operator, upgrade and recovery instructions.
- `docs/STEP-13-VALIDATION.md`: evidence and remaining live acceptance gates.
- `deploy/compose.yaml`: independent production project, private database, localhost app port (default 3100), optional HTTPS edge profile.
- `deploy/env.example` and `deploy/configure.py`: configuration template and exclusive private-secret initialization.
- `deploy/ops.sh`: start, health/status, SMTP connectivity, operator, backup, restore and backup-first upgrade commands.
- `Dockerfile`: build production image; runtime includes Chromium/fonts for PDF.

Use the existing reverse proxy if ports 80/443 are already occupied. Do not enable the optional edge service until the host/hostname arrangement is reviewed. Configure a private, unused app port first. The environment has no real VPS, SMTP or DNS credentials in this archive.

## Proven locally

81 unit tests, 37 PostgreSQL integration tests and 42 Chromium browser tests pass (160 total). The real production-image drill passes fresh install, backup-first upgrade, restart persistence, checksum rejection, restore into a separate empty database, retained asset bytes/revisions/snapshots/reusable content, old-session revocation, HTTPS with an explicitly trusted local test CA and hardened-runtime PDF generation.

The official uploaded SVG is `src/assets/openscroll.svg`; it is integrated in the header/favicon. Current database migration is **4**; portable course schema remains **3**. This is a single app instance, not a distributed architecture.

## Build and verify

Inspect `SOURCE-MANIFEST.sha256` before changing files. From the extracted OpenScroll directory, `sha256sum -c SOURCE-MANIFEST.sha256` verifies package contents. Build a uniquely tagged image with `docker build -t openscroll:release-13 .`. Follow the self-hosting guide for configuration and deployment; the local development Compose files are not the production stack.

The packaged `.npmrc` intentionally contains only public, non-secret npm settings. Credentials, local mail/recovery state, node_modules, Git metadata, database dumps, and development build output are excluded. No binary Docker image is included.

## Pending live checks

Inspect the actual VPS, select an unused port, choose public hostname later, verify real SMTP/reset/verification delivery, establish encrypted off-host backup retention/alerts, and accept a restore drill on the final installation. Public DNS/certificate issuance and live deployment have not been performed. Review the concrete target configuration with Jason before modifying Hostinger resources.
