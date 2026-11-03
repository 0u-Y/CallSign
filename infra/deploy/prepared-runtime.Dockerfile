# Separate first stage: the legacy builder must not execute dependency-install stages.
ARG PREPARED_RUNTIME_IMAGE
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
