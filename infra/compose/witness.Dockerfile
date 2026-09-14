FROM node:22.22.0-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/verifier/package.json packages/verifier/package.json
COPY services/witness/package.json services/witness/package.json
RUN pnpm install --frozen-lockfile --filter @callsign/witness...
COPY packages/protocol packages/protocol
COPY packages/verifier packages/verifier
COPY services/witness services/witness
CMD ["pnpm", "--filter", "@callsign/witness", "start"]
