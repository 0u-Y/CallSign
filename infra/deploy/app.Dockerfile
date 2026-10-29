ARG NODE_IMAGE=node:22.22.2-bookworm-slim
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
FROM nginx:1.28.0-alpine AS web
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY infra/deploy/nginx.conf /etc/nginx/conf.d/default.conf
