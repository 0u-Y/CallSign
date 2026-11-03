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
# Only the new image cache directory changes owner; host files and base images stay untouched.
USER 0
RUN chown 1000:1000 node_modules
USER 1000:1000
RUN node --version && pnpm --filter @callsign/api exec tsx --version
