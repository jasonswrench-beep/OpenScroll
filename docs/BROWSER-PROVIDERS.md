# Browser providers and the optional Chrome renderer

The `renderer` Docker target remains the default PDF worker and selects Debian's
open-source Chromium package, subject to the required browser security floor.
The separate `renderer-chrome` target is an explicit
option for an operator who builds an image for its own installation using Google's
official Chrome Stable package. The app image, publication protocol and renderer
isolation do not change with this choice. OpenScroll does not publish a Chrome
binary, `.deb`, or prebuilt Chrome-containing image through this option.

The Chrome target is a candidate until its actual final image has passed the
validation below. Package availability and a successful build alone do not prove
that PDF output or the isolation boundary works. Installation, compatibility,
both Linux architectures and final-image scan results must be recorded for the
specific reviewed commit; any unrun checks remain pending.

The October 30 AMD64 candidate based on PR #6 installed the authenticated official
Chrome Stable package `156.0.8078.79-1`. Its image identity is
`sha256:ab2d6491c088ee90066235d0c97554c783655d532a3a0727322c3d331f8dcc97`.
The direct Chrome executable's numeric version passed the security-version check;
its literal `unknown` channel marker reflects bypassing Google's launcher. The
direct executable adds no launcher environment keys. The paired app/API test
passed authorization and container-configuration checks and produced a
47,934-byte PDF with embedded Latin/CJK fonts. All **15 targeted native-PDF and
question-import tests passed**, including tags, language, outlines, alternative
text, reading order, A4/Letter paper and answer privacy.

All **12 isolation checks passed** for that candidate. Actual browser process
identities were cross-checked against CDP and retained UID/GID 65532, zero
capabilities, no-new-privileges and seccomp. Chrome's internally generated
`FC_FONTATIONS=1` flag was observed; it was not supplied through the worker
environment. The external deadline cases restarted and recovered at 45,009 ms
and 45,459 ms. All disposable test containers, networks and socket fixtures were
removed and cleanup was verified.

The October 30 21:46:18 UTC final-image scan with Trivy 0.76.1 passed the existing
fixable high/critical gate. It retained **536 OS findings**: 4 critical, 100 high,
205 medium, 217 low and 10 unknown, all without a reported published fix. There
were zero Node application findings, with two application inventory records;
the Chrome inventory reported `156.0.8078.79`. The scan used the database revision
updated at 13:06:28 UTC, within its declared next-update window ending October 31.
It did not require a newly published database revision during the scan hour.
These residual findings still require review.

ARM64 signed index metadata and package checksum pins were verified, but no
native ARM64 image build or runtime test has been completed. These results cover
the PR #6-based browser candidate only; they do not certify the subsequent
integrated database/browser changes. The final integrated commit must be rebuilt
and revalidated through CI. No deployment or browser-image publication has
occurred.

As checked on October 30, 2026, signed Bookworm security metadata still offers
Chromium `156.0.8078.73-1~deb12u1`. Google's upstream Linux security release
`156.0.8078.79` contains the subsequently announced fixes. The default Debian
renderer therefore refuses a package below the `.79` minimum; its build remains
blocked until compatible signed Debian metadata supplies that update. This is the
browser patch prerequisite described in
[renderer isolation](RENDERER-ISOLATION.md#browser-patch-availability). The optional
Chrome package does not make those fixes present in the default image.
[The official October 29 bulletin](https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_02107719452.html)
identifies the upstream release and fixes.

Read the [Chrome executable terms](https://www.google.com/chrome/terms/) and the
incorporated [Google Terms of Service](https://policies.google.com/terms?hl=en&gl=US)
before choosing this target. Google Chrome is not the same distribution as
Debian Chromium. Google's terms address use of its executable, include a personal,
nonassignable software license and restrict copying and distribution, while
recognizing separately applicable open-source licenses. Business use is
contemplated by the terms; the software is not described here as limited to
noncommercial use.

The build requires `ACCEPT_GOOGLE_CHROME_TERMS=true` to acknowledge the operator's
choice before obtaining Chrome. This build argument grants no additional rights
and does not establish permission to redistribute the resulting image. A private
operator-built image for the operator's own installation and an image supplied to
other people are different distribution decisions. Before sharing an image,
binary, package or Chrome-containing build cache, the operator must establish an
applicable distribution basis and comply with the required notices and component
licenses. Do not treat OpenScroll's Apache license or this acknowledgment as a
license for Google's whole binary. Preserve the installed package's copyright and
license notices.

Chrome for Testing is not substituted for Chrome Stable. Its repository's Apache
license covers repository code; a Google maintainer explains that the Chrome for
Testing executable follows [Chrome's terms](https://github.com/GoogleChromeLabs/chrome-for-testing/issues/21).
Google also describes Chrome for Testing and `chrome-headless-shell` as intended
for trusted content, with no automatic updates. See the
[official security FAQ](https://chromium.googlesource.com/chromium/src/+/lkgr/docs/security/faq.md#what-is-the-threat-model-for-chrome-for-testing).
A versioned testing download is not, by itself, a suitable replacement for a
maintained production browser that processes author-supplied content.

Build the app and opt-in renderer from the same reviewed source commit:

```sh
export OS_SECURITY_REFRESH="$(date -u +%Y%m%dT%H%M%SZ)"
docker build --pull --target runtime \
  --build-arg OS_SECURITY_REFRESH --tag openscroll:app-local .
docker build --pull --target renderer-chrome \
  --build-arg OS_SECURITY_REFRESH \
  --build-arg ACCEPT_GOOGLE_CHROME_TERMS=true \
  --tag openscroll:renderer-chrome-local .
```

The build acknowledgment is not an app environment variable or an end-user
account setting. Selecting the default `runtime` or Debian `renderer` target does
not opt in to Chrome. Production already accepts a retained renderer image through
`OPENSCROLL_RENDERER_IMAGE`; select the tested local image there only as part of a
separately authorized deployment. Building or testing these images does not deploy
them. The normal [self-hosting procedure](SELF-HOSTING.md), backups and release
checks still apply.

The [Dockerfile](../Dockerfile) contains the reviewed Chrome package version and
architecture-specific SHA-256 pins. These pins must identify packages from
Google's signed Linux repository metadata, authenticated with the reviewed Google
Linux signing key. The [official Linux repository page](https://www.google.com/linuxrepositories/)
publishes the repository and key information. The package URL, architecture,
version and checksum must agree with that authenticated metadata. A download
over HTTPS alone, or a new key obtained from the same download without checking
its expected fingerprint, does not replace this verification. Package authenticity
does not establish licensing permission or absence of vulnerabilities.

Only the explicitly supported `amd64` and `arm64` package mappings may be built;
an unknown architecture must fail. Keep the version and both architecture pins
together during review, with the signed metadata evidence. If a pinned package
disappears or a checksum changes, investigate and review a replacement. Do not
fall back silently to an unpinned latest package, another architecture or an
unverified mirror. Preserve the privately retained image identity and its build
provenance for the installation that will use it.

The Chrome pin is deliberate: it does not automatically follow Google releases.
Neither a running network-denied renderer nor a cached build installs later
security fixes. Updating the Node base digest also does not update the pinned
browser. Review newer official Stable releases and signed package metadata, update
the pins, then rebuild and revalidate. `--pull` alone does not invalidate cached
APT installation steps. The commands above supply a fresh `OS_SECURITY_REFRESH`
value to invalidate the operating-system package update cache; that value is a
build cache key, not a browser version or security assertion. A full `--no-cache`
build can also refresh those steps. Final Debian package versions
are still determined at build time, so retain the full image inventory.

Both browser choices retain the same security controls: a credential-free worker,
root supervisor under Docker init, browser jobs as UID/GID 65532 with no
capabilities, no network, a private PID and IPC namespace, read-only root
filesystem, restricted Unix socket, empty proxies, fixed minimal job environment,
and bounded memory, swap, processes, temporary storage and deadlines. The app has
only a read-only socket mount and contains no browser or native fonts. Keep the
Noto core/CJK fonts and required IPC cleanup tools in either renderer. No PDF
request can choose an executable, flags, environment or remote browser endpoint.
Do not add capabilities, enable networking, relax the host security profile or
move rendering into the app to make an alternative browser work. Chromium's
internal sandbox is not asserted as verified protection by this configuration.

Validate the exact local image pair before considering it for release:

```sh
node tools/container-smoke.mjs openscroll:app-local openscroll:renderer-chrome-local
node tools/renderer-isolation-smoke.mjs openscroll:renderer-chrome-local openscroll:app-local
```

Also run the full source unit, integration and browser suites with this renderer
and a disposable database/outbox, following the [development guide](DEVELOPMENT.md).
Check actual Chrome package and executable versions, all native dependencies,
repeated renders and cleanup, malformed/oversized input, busy handling, crashes,
timeouts and memory limits. Preserve the existing access-denial and owner-approval
checks. PDF checks must cover embedded Latin/CJK fonts, text and images, tagged
structure, outlines, reading order, A4/Letter layout and absence of answer leakage.
Run native validation on each architecture claimed as supported; results from
one architecture do not validate the other.

Scan both final images and retain their exact identities and complete inventories,
including findings without an available fix. Keep the existing fixable high and
critical finding gate. A scanner may report Google's browser package differently
from Debian Chromium, so fewer or missing Chrome records are not evidence that
the browser fixes are present. Verify the installed version against the official
security release independently. Do not suppress findings to approve this option.
No image, package or Chrome-containing cache needs to be published for these
checks; reports can record versions, hashes and test results without distributing
the browser binary. Opt-in Chrome CI is ephemeral evaluation only and publishes
no browser-containing image or cache. Its success does not resolve the default
Debian browser gate. Default Chromium CI results do not certify the Chrome target.

The browser remains exposed to native parsing risks and shares the host kernel
with the other containers. A patched Chrome version addresses the named browser
update gap for that specific image; it does not resolve every Debian/native
finding, certify every possible document, or authorize a deployment. Follow the
[container validation guidance](CONTAINER-SECURITY.md) for residual findings and
release evidence.
