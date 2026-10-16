FROM node:26-slim AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

# Node.js ignores the system store by default; point npm/pnpm and the app at it
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# npm registry to install from. Point this at an internal mirror when
# registry.npmjs.org is blocked. npm reads npm_config_*, pnpm 11 reads pnpm_config_*.
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV npm_config_registry=${NPM_REGISTRY} \
    pnpm_config_registry=${NPM_REGISTRY}

# domhandler-5.0.3.tgz is refused by some proxies on registry.npmjs.org, so it is
# pre-fetched from a mirror. pnpm still checks it against the lockfile integrity hash.
ARG DOMHANDLER_REGISTRY=https://registry.npmmirror.com/
ENV DOMHANDLER_REGISTRY=${DOMHANDLER_REGISTRY}

RUN npm install -g pnpm@11.28.2

FROM base AS builder

WORKDIR /app

COPY . .

RUN pnpm store add domhandler@5.0.3 --registry=${DOMHANDLER_REGISTRY} \
  && pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

# drop npm and corepack
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -rf /usr/local/lib/node_modules/corepack \
  && rm -rf /usr/local/bin/npm \
  && rm -rf /usr/local/bin/npx \
  && rm -rf /usr/local/bin/corepack \
  && rm -rf /root/.npm \
  && rm -rf /root/.node-gyp

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/client/package.json /app/apps/client/package.json
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json
COPY --from=builder /app/packages/base-formula/dist /app/packages/base-formula/dist
COPY --from=builder /app/packages/base-formula/package.json /app/packages/base-formula/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN chown -R node:node /app

USER node

# client package.json is only copied for the lockfile check; its deps are bundled in dist
RUN pnpm store add domhandler@5.0.3 --registry=${DOMHANDLER_REGISTRY} \
  && pnpm install --frozen-lockfile --prod --filter '!./apps/client' && rm -rf /home/node/.cache/pnpm

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
