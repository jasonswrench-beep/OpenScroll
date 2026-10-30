# syntax=docker/dockerfile:1
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; else npm ci --strict-ssl=true; fi
COPY tsconfig*.json vite.config.ts index.html app.html account.html player.html ./
COPY src ./src
COPY tools/player-notices.ts ./tools/player-notices.ts
RUN npm run build && npm prune --omit=dev

# Assemble only public renderer code/dependencies and normalize readable modes.
# One copy into the browser layer also avoids duplicating that large filesystem.
FROM build AS renderer-files
COPY --chmod=0644 LICENSE NOTICE /renderer/
RUN set -eu; \
    mkdir -p /renderer/node_modules /renderer/dist/server/src/project; \
    cp /app/package.json /renderer/; \
    cp -a /app/node_modules/playwright-core /renderer/node_modules/; \
    cp -a /app/dist/server/src/renderer /renderer/dist/server/src/; \
    cp /app/dist/server/src/project/pdf-protocol.js /renderer/dist/server/src/project/; \
    chmod -R a+rX /renderer

FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS os-base
ARG OS_SECURITY_REFRESH=2026-10-30
ENV NODE_ENV=production
WORKDIR /app
# Keep OS security updates in both credential-bearing app and isolated renderer.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    test -n "$OS_SECURITY_REFRESH"; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem -o APT::Update::Error-Mode=any update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem upgrade -y --no-install-recommends; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends ca-certificates; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' perl-base)" ge '5.36.0-7+deb12u4'; \
    if dpkg-query -W libpcre2-8-0 >/dev/null 2>&1; then dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge '10.42-1+deb12u1'; fi; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem
# Dependency installation happens only in the build stage; runtime invokes node directly.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
# The renderer has no app server, database/mail libraries, configuration or credentials.
FROM os-base AS renderer
COPY --from=renderer-files /renderer/ ./
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem -o APT::Update::Error-Mode=any update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends chromium fonts-noto-core fonts-noto-cjk util-linux; \
    test -x /usr/bin/ipcrm; \
    node --input-type=module -e "import {execFileSync} from 'node:child_process'; import {assertBrowserVersion} from './dist/server/src/renderer/browser.js'; const output=execFileSync('/usr/bin/chromium',['--version'],{encoding:'utf8',timeout:2000,maxBuffer:1024}); console.log(output.trim()); console.log(assertBrowserVersion(output));"; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge '10.42-1+deb12u1'; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem; \
    mkdir -p /run/openscroll-renderer; chown 0:1000 /run/openscroll-renderer; chmod 0750 /run/openscroll-renderer
ENV PDF_RENDERER_SOCKET=/run/openscroll-renderer/renderer.sock
# Only the supervisor runs as root; it starts each browser job as UID/GID 65532.
# Runtime grants only SETUID, SETGID and KILL; no network or Docker socket.
USER 0:1000
CMD ["node", "dist/server/src/renderer/server.js"]

# This opt-in target is built by an operator for its own installation. It is
# never published as a prebuilt OpenScroll image. See docs/BROWSER-PROVIDERS.md.
FROM os-base AS chrome-package
ARG ACCEPT_GOOGLE_CHROME_TERMS=false
ARG TARGETARCH
# Immutable package hashes verified against Google's signed Release metadata
# on 2026-10-30. Primary signing key EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    test "$ACCEPT_GOOGLE_CHROME_TERMS" = true || \
      { echo 'Review https://www.google.com/chrome/terms/ and explicitly set ACCEPT_GOOGLE_CHROME_TERMS=true for your own build.' >&2; exit 1; }; \
    case "$TARGETARCH" in \
      amd64) package_sha=be1a1e161419f5c8272432f6860912550d8e29985e925913fa800493a0d0c955 ;; \
      arm64) package_sha=dc66f2d96853153e350c4a0944da4503cae39c2fcbcdb4e0057c64f6c49202ff ;; \
      *) echo 'The Chrome renderer supports only amd64 and arm64.' >&2; exit 1 ;; \
    esac; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem -o APT::Update::Error-Mode=any update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends curl; \
    mkdir /package; \
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 --cacert /tmp/openscroll-apt-ca.pem \
      "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_156.0.8078.79-1_${TARGETARCH}.deb" \
      --output /package/google-chrome.deb; \
    printf '%s  %s\n' "$package_sha" /package/google-chrome.deb | sha256sum --check -; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem

# Deliberately start from os-base so no vulnerable Debian Chromium layer is
# retained underneath Chrome. The application image remains browser-free.
FROM os-base AS renderer-chrome
COPY --from=renderer-files /renderer/ ./
RUN --mount=type=secret,id=proxy_ca \
    --mount=type=bind,from=chrome-package,source=/package,target=/run/chrome-package \
    set -eu; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem -o APT::Update::Error-Mode=any update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends /run/chrome-package/google-chrome.deb fonts-noto-core fonts-noto-cjk util-linux; \
    test -x /usr/bin/ipcrm; \
    test "$(dpkg-query -W -f='${Version}' google-chrome-stable)" = '156.0.8078.79-1'; \
    test ! -e /usr/bin/chromium; \
    ln -s /opt/google/chrome/chrome /usr/bin/chromium; \
    node --input-type=module -e "import {execFileSync} from 'node:child_process'; import {assertBrowserVersion} from './dist/server/src/renderer/browser.js'; const output=execFileSync('/usr/bin/chromium',['--version'],{encoding:'utf8',timeout:2000,maxBuffer:1024}); console.log(output.trim()); console.log(assertBrowserVersion(output));"; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge '10.42-1+deb12u1'; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem /etc/apt/sources.list.d/google-chrome.list /etc/cron.daily/google-chrome /opt/google/chrome/cron; \
    mkdir -p /run/openscroll-renderer; chown 0:1000 /run/openscroll-renderer; chmod 0750 /run/openscroll-renderer
ENV PDF_RENDERER_SOCKET=/run/openscroll-renderer/renderer.sock
USER 0:1000
CMD ["node", "dist/server/src/renderer/server.js"]

# The default image contains no browser or font/native rendering packages.
FROM os-base AS runtime
ENV HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node LICENSE NOTICE ./
RUN mkdir /app/local-mail && chown node:node /app/local-mail
USER node
EXPOSE 3000
CMD ["node", "dist/server/src/server/index.js"]
