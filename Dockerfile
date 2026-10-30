# syntax=docker/dockerfile:1
FROM node:26.7.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; else npm ci --strict-ssl=true; fi
COPY tsconfig*.json vite.config.ts index.html player.html ./
COPY src ./src
COPY tools/player-notices.ts ./tools/player-notices.ts
RUN npm run build && npm prune --omit=dev

FROM node:26.7.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# Chromium prints trusted, inert course HTML; keep distribution license notices.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    node -e "require('fs').writeFileSync('/tmp/openscroll-apt-ca.pem',require('tls').rootCertificates.join('\\n')+'\\n')"; \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /tmp/openscroll-apt-ca.pem; fi; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem update; \
    apt-get -o Acquire::http::Proxy="${HTTP_PROXY:-}" -o Acquire::https::Proxy="${HTTPS_PROXY:-}" -o Acquire::https::CaInfo=/tmp/openscroll-apt-ca.pem install -y --no-install-recommends ca-certificates chromium fonts-noto-core fonts-noto-cjk; \
    rm -rf /var/lib/apt/lists/* /tmp/openscroll-apt-ca.pem
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node LICENSE NOTICE ./
RUN mkdir /app/local-mail && chown node:node /app/local-mail
USER node
EXPOSE 3000
CMD ["node", "dist/server/src/server/index.js"]
