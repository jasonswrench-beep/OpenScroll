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
ENV NODE_ENV=production
WORKDIR /app
# Keep OS security updates in both credential-bearing app and isolated renderer.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem update; \
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
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends chromium fonts-noto-core fonts-noto-cjk; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libpcre2-8-0)" ge '10.42-1+deb12u1'; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem; \
    mkdir -p /run/openscroll-renderer; chown 0:1000 /run/openscroll-renderer; chmod 0750 /run/openscroll-renderer
ENV PDF_RENDERER_SOCKET=/run/openscroll-renderer/renderer.sock
COPY --from=renderer-files /renderer/ ./
# Only the supervisor runs as root; it starts each browser job as UID/GID 65532.
# Runtime grants only SETUID, SETGID and KILL; no network or Docker socket.
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
