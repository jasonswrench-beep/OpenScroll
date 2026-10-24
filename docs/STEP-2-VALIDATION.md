# Step 2 validation

Validated on 2026-10-22 in the managed Linux development environment. These results concern the foundation only.

## Passed

- Frozen installation with `npm ci`.
- `npm run licenses`: locked dependency metadata matches reviewed policy.
- `npm run build`: strict TypeScript checks, Vite assets, and compiled server.
- `npm test`: 2 tests passed; configuration rejection and readiness success/failure responses.
- `npm run test:integration`: 1 test passed against real PostgreSQL, including a temporary-table write/read transaction and API readiness.
- `npm run test:browser`: 2 tests passed using installed Chromium. Verified connected status, keyboard skip link/focus, no axe violations in the shell, 375px reflow without horizontal overflow, and recovery after a simulated service failure.
- Development startup: real browser connected through Vite's API proxy.
- Built application startup: exercised by the browser test runner.
- Docker image build with TLS verification and a build-only session CA mount.
- Compose application/database startup: both healthy; real browser loaded served assets and confirmed database connectivity. Application ran under its configured non-root runtime user.
- Compose configuration validation and Git whitespace checks.
- Production dependency audit: zero known vulnerabilities at time of check.

The optional container application was stopped after verification; PostgreSQL remains available for development. Live processes must be restarted in later tasks.

## Diagnosed setup issues

The default npm cache was not writable, so the repository uses an ignored local cache. Docker buildx also needed a writable cache location in this cloud machine. The Playwright download domain was denied by network policy; existing Chromium was used instead, without bypassing that policy or disabling TLS checks.

## Not yet validated

CI workflow has been added but has not run on GitHub. Firefox, WebKit/Safari, Edge, physical mobile devices, NVDA, and VoiceOver have not been tested. An automated accessibility scan is not conformance certification. No VPS deployment, production security audit, account flow, course format, learner player, or publishing system exists yet.
