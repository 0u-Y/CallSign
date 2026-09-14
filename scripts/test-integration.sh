#!/usr/bin/env bash
set -euo pipefail

docker compose -f infra/compose/docker-compose.yml up -d postgres
bash scripts/wait-postgres.sh
corepack pnpm tsx scripts/migrate.ts
corepack pnpm vitest run tests/integration --reporter=verbose --reporter=json --outputFile.json=artifacts/integration-results.json
