#!/usr/bin/env bash
set -euo pipefail

if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "integration" ]; then echo "BLOCKED: explicit integration execution approval required" >&2; exit 78; fi

export DATABASE_URL="${DATABASE_URL:-postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof}"
export MIGRATOR_DATABASE_URL="${MIGRATOR_DATABASE_URL:-${DATABASE_URL}}"

if [ "${SKIP_DB_START:-0}" != "1" ]; then
  docker compose -f infra/compose/docker-compose.yml up -d postgres
  bash scripts/wait-postgres.sh
fi
corepack pnpm tsx scripts/migrate-finals.ts --apply
corepack pnpm vitest run --config vitest.integration.config.ts --reporter=verbose --reporter=json --outputFile.json=artifacts/integration-results.json
