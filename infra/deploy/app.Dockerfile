ARG NODE_IMAGE=node:22.22.2-bookworm-slim
ARG LOCAL_RUNTIME_BASE=ubuntu@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
ARG PREPARED_RUNTIME_IMAGE=node:22.22.2-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/verifier/package.json packages/verifier/package.json
COPY services/api/package.json services/api/package.json
COPY services/witness/package.json services/witness/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages packages
COPY services services
COPY scripts scripts
COPY apps/web apps/web
COPY artifacts/test-results.json artifacts/test-results.json
RUN pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit
FROM dependencies AS web-build
ARG VITE_SERVICE_TRUST_SHA256
ARG VITE_FINALS_TRUST_SHA256
ENV VITE_FINALS_TRUST_SHA256=${VITE_FINALS_TRUST_SHA256} VITE_SERVICE_TRUST_SHA256=${VITE_SERVICE_TRUST_SHA256} VITE_PROTOCOL_PROFILE=service
RUN pnpm --filter @callsign/web build
FROM dependencies AS runtime
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@callsign/api", "exec", "tsx", "src/finals-server.ts"]
# Reuse reviewed installed dependencies without downloading or mounting the developer checkout at runtime.
FROM ${PREPARED_RUNTIME_IMAGE} AS prepared-runtime
ARG SOURCE_COMMIT
LABEL org.callsign.source-commit=${SOURCE_COMMIT}
COPY packages packages
COPY services services
COPY scripts scripts
COPY apps/web apps/web
COPY infra/deploy infra/deploy
COPY infra/besu/network-config.json infra/besu/network-config.json
RUN node --version && pnpm --filter @callsign/api exec tsx --version
FROM nginx:1.28.0-alpine AS web
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY infra/deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Offline rehearsal: exact installed Node/dependencies supplied as a reviewed local build context.
# The normal runtime/web targets above remain the registry build path.
FROM ${LOCAL_RUNTIME_BASE} AS local-runtime
ARG LOCAL_WORKSPACE_ROOT=/app
ENV NODE_ENV=production COREPACK_HOME=/opt/local-runtime/corepack-cache COREPACK_ENABLE_NETWORK=0
WORKDIR ${LOCAL_WORKSPACE_ROOT}
COPY --from=local-runtime-inputs /runtime /opt/local-runtime
COPY --from=local-runtime-inputs /app ${LOCAL_WORKSPACE_ROOT}
RUN ln -s /opt/local-runtime/node /usr/local/bin/node \
 && ln -s /opt/local-runtime/corepack/dist/pnpm.js /usr/local/bin/pnpm \
 && cp /opt/local-runtime/lib/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/ \
 && cp /opt/local-runtime/lib/libgcc_s.so.1 /usr/lib/x86_64-linux-gnu/ \
 && node --version && pnpm --version \
 && pnpm --filter @callsign/witness exec node --version
USER 1000:1000
CMD ["pnpm", "--filter", "@callsign/api", "exec", "tsx", "src/finals-server.ts"]
