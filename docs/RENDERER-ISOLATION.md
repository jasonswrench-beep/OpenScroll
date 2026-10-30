# PDF renderer isolation

PDF publishing uses a separate renderer container. The authoring server validates
the project and creates inert publication HTML, then sends only that HTML and
the paper size over a Unix-domain socket. The renderer returns bounded PDF bytes.
It receives no database connection, SMTP settings, session tokens, author account
record, host credentials or application configuration. This is a local service
for one installation, without a public HTTP endpoint or central rendering service.

Owner approval still protects every authoring and PDF API. A pending account,
anonymous visitor or revoked session cannot use the renderer through the app.
The renderer protocol itself is not an account API: filesystem permissions and
the private socket volume restrict its callers to the trusted application.

## Boundary and privileges

| Component | Access and purpose |
| --- | --- |
| App container | Runs as the unprivileged app user; has the installation's database/mail configuration; has a read-only mount of the socket volume; contains no browser or font installation |
| Renderer supervisor | Runs as UID 0 with primary GID 1000; retains only `SETUID`, `SETGID` and `KILL`; accepts one bounded request and supervises a separate browser job |
| Browser job | Fresh process for each request, UID/GID 65532, no supplementary groups or capabilities; receives a fixed minimal environment and publication input through standard input |
| Socket directory | Root-owned, GID 1000, mode 0750; the socket is mode 0660; browser UID/GID 65532 cannot connect to it or replace it |

The supervisor needs the three capabilities to start the distinct browser UID
and terminate its processes. It does not launch a browser in its own process or
inherit app secrets. The renderer image contains the worker, browser, rendering
library, fonts and required system libraries, rather than the app's server,
database/mail modules, frontend, `.env` files or course store.

The Compose renderer uses `network_mode: none`, a private PID namespace, an init
process, `no-new-privileges`, a read-only root filesystem and bounded temporary
storage. It has no published ports, database network, Docker socket or host
directory mount. The app mounts only the socket volume read-only; it cannot
replace the supervisor's socket. Browser network denial comes from the container
network namespace, independently of Playwright request interception or browser
JavaScript settings. JavaScript-disabled/offline rendering and a restrictive
document policy remain additional protections.

Do not add the app's environment mapping, `env_file`, network, secret mounts or
database volumes to the renderer. Do not use host networking, host PID mode,
`privileged`, an unconfined security profile or a Docker socket to make a broken
installation work. The normal Docker security profile remains in force. The supervisor refuses to
start unless it is the direct child of a root Docker init at PID 1 inside the
Docker container. Native host execution, missing init and shared/host PID modes
are unsupported; do not bypass this check.

## Work and resource limits

The socket protocol has one length-delimited request and response per connection.
Only publication HTML and A4/Letter paper selection are accepted. The app bounds
generated HTML while building it, including repeated references to the same
image or text attachment, before making a request. The renderer checks the frame
length before buffering/parsing it. Input and PDF output each have a 32 MiB cap;
malformed, incomplete, extra or oversized frames fail rather than being accepted
as a partial document.

One request occupies a worker; another is refused as busy instead of entering an
unbounded queue. The supervisor's 45-second wall deadline starts with the
connection, including upload, process startup, output and cleanup. It runs
outside the browser UID and process. On deadline expiration the supervisor exits
and the production Compose restart policy restarts the container, ending the
old PID namespace; the app receives a safe
failure rather than partial PDF bytes. The app has its own 47-second socket
deadline. On normal completion, the supervisor uses Linux
`kill(-1, SIGKILL)` inside that private PID namespace to terminate every peer
except PID 1 and its own thread group. The kernel serializes this signal sweep
with process insertion, avoiding a `/proc` snapshot race with forking descendants
([Linux signal implementation](https://raw.githubusercontent.com/gregkh/linux/v6.18.57/kernel/signal.c),
[fork insertion and fatal-signal check](https://raw.githubusercontent.com/gregkh/linux/v6.18.57/kernel/fork.c)).
Bounded process checks then verify browser-UID processes have been reaped before
the worker accepts another job. Extra diagnostic or health-check processes in
the renderer can also be interrupted by this sweep; run diagnostics while idle. A trusted cleanup process then removes browser-owned
files in `/tmp`, `/dev/shm` and `/dev/mqueue`, and clears and verifies the private
namespace's System V IPC objects. No new job is admitted with leftover state. Uncertain cleanup also forces supervisor exit and
container restart instead of reusing questionable state. A manually launched
renderer without a restart policy stays stopped and must be restarted by its
operator/helper. These are externally
supervised wall timers, not hard real-time scheduling guarantees under arbitrary
host/kernel failure or exhaustion.

The provided production limits are 1 CPU, 1 GiB memory with no additional swap allowance, 256 processes, 256 MiB
temporary storage and 256 MiB shared memory. They bound this renderer's impact;
they do not reserve spare capacity for other services on a shared host. Large
courses can exceed these limits and fail cleanly. Split such a course or reduce
its image sizes. Do not remove the limits to accept an unmeasured workload.

An app-side cancellation or timeout can discard a result while the worker finishes
or reaches its own deadline. Previously authorized work can also finish after an
account is revoked. Neither event grants permission for a subsequent request.

## Installation and configuration

The provided renderer requires Linux Docker Engine. The direct-Node test helper
is intended for Linux hosts; on Docker Desktop, keep the app and renderer in the
same Linux Compose environment rather than assuming a host/VM Unix socket works.

Build and retain both images from the same reviewed commit:

```sh
docker build --pull --target runtime --tag openscroll:release-isolation .
docker build --pull --target renderer --tag openscroll:release-isolation-renderer .
```

In the private production environment, set `OPENSCROLL_IMAGE` and
`OPENSCROLL_RENDERER_IMAGE` to those retained tags or digests. The renderer image
defaults to `openscroll:renderer` if no override is supplied. The production
Compose file supplies `PDF_RENDERER_SOCKET` and the private volume; no new secret
or remote service account is required. Keep the app and renderer from the same
release so their protocol and bounds agree.

Use [the self-hosting procedure](SELF-HOSTING.md) for the database, owner
bootstrap, mail, HTTPS and backup checks. Starting the production stack also
starts the renderer and waits for its health. A successful app `/api/health`
response checks the database; verify a real authorized PDF as well before
accepting a release. Never expose the renderer separately through the web proxy.

For disposable local development/tests, start a built renderer and load only its
socket path into the shell:

```sh
node tools/renderer-test-service.mjs start openscroll:release-isolation-renderer
. .local/renderer-test.env
# Run npm test, browser checks or the PDF CLI with this explicit socket.
node tools/renderer-test-service.mjs stop
```

The helper creates only its own local service resources and writes a generated
`PDF_RENDERER_SOCKET` export, without database or mail configuration. Stop the
helper after checks. CI also receives that path through `GITHUB_ENV` when present.

Direct Node development and the PDF CLI require this isolated renderer and an
absolute `PDF_RENDERER_SOCKET` path. Installing a browser in the app process or
setting the old `PDF_CHROMIUM_EXECUTABLE_PATH` does not restore in-process
rendering. A missing/unavailable renderer fails closed for PDF export; other
authorized authoring and publication features can continue.

## Upgrade and recovery

Build, test and retain both replacement images before changing either production
tag. Keep the current image pair and take the normal database backup before an
upgrade. The renderer has no database or durable course data to back up; its
socket volume is service state, not a content backup. Never include the renderer
in a database credential mapping to simplify an upgrade.

Use the normal operator upgrade procedure to apply compatible migrations and
restart the app and renderer. This isolation change does not introduce a course
schema or database migration. Validate owner access, denial of an anonymous PDF
request and a representative PDF with Latin/CJK text and embedded fonts after
the upgrade. Retain full scans for both final images, with their exact identities.

For repeated renderer timeouts, crashes or OOM events, inspect the bounded
renderer logs and host resource counters without logging publication HTML or
credentials. Restart/recreate the renderer from its retained trusted image and
retry a small course. A permission or socket ownership error requires correcting
the documented service configuration; do not make the directory world-writable
or grant extra capabilities. If recovery fails, leave PDF unavailable and
investigate. Do not fall back to rendering in the app container.

## Browser patch availability

The reviewed renderer retains Debian Bookworm's open-source Chromium package.
The signed Debian security repository currently supplies
`156.0.8078.73-1~deb12u1`; it is below the upstream Linux security release
`156.0.8078.79`. [The official October 29 release bulletin](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_02107719452.html)
reports 21 fixes, including critical/high issues. The container boundary does
not make those missing browser fixes present. Check the
[Debian Chromium tracker](https://security-tracker.debian.org/tracker/source-package/chromium)
and signed package metadata again before a release, then rebuild, scan and
regression-test the actual image when an updated compatible package is available.

A switch to Trixie would not currently supply the missing browser update and
would change native-library requirements. A separately available Google Chrome
Stable package is governed by its own whole-binary terms; it is not introduced
as a proprietary default or represented as open-source Debian Chromium here.
Resolving the supported browser patch path remains a release prerequisite;
there is no suppression or scanner exception for the known upstream fixes.

## Residual risks and release evidence

This boundary reduces what a compromised browser can reach. It does not repair
browser/native-library CVEs, validate every possible PDF, or turn containers into
virtual machines. The renderer and app still share the host kernel. The small
root supervisor and its framing/cleanup code are trusted components. Keep the
browser and native packages patched and review the full findings for both images;
an advisory without an available package fix is not evidence of safety.

Chromium's internal sandbox must not be claimed as verified protection merely
because rendering succeeds. The provided containment relies on the documented
container boundary and separate supervisor/browser UIDs. Do not weaken the host
security profile to make an additional browser sandbox available.

Run the actual image isolation checks, final-container quality checks, source
regressions and both final-image scans for the reviewed commit. Evidence should
distinguish process/UID/mount/network controls observed in the container from
browser policy, and list failures or unrun checks. A green scanner gate based on
fix availability does not establish application reachability or eliminate
residual exposure. See [container validation](CONTAINER-SECURITY.md).

No public sample courses are added by the isolation change. Future examples can
be reviewed standalone learner publications, without opening authoring or PDF
APIs to anonymous use.
