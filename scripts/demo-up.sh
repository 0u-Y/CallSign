#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
"${ROOT_DIR}/scripts/generate-besu.sh"
docker compose -f infra/compose/docker-compose.yml up -d postgres besu1 besu2 besu3 besu4
bash scripts/wait-postgres.sh
corepack pnpm tsx scripts/migrate.ts
for port in 18545 28545 38545 48545; do
  for attempt in $(seq 1 60); do
    if curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "http://127.0.0.1:${port}" >/dev/null; then break; fi
    if [ "${attempt}" -eq 60 ]; then echo "Besu RPC ${port} did not become ready" >&2; exit 1; fi
    sleep 1
  done
done
forge build
corepack pnpm tsx scripts/init-demo-keys.ts
corepack pnpm tsx scripts/deploy-registry.ts
docker compose -f infra/compose/docker-compose.yml up -d --build witness1 witness2 witness3 witness4
for port in 4201 4202 4203 4204; do
  for attempt in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null; then break; fi
    if [ "${attempt}" -eq 60 ]; then echo "Witness ${port} did not become ready" >&2; exit 1; fi
    sleep 1
  done
done
corepack pnpm tsx scripts/check-ledger.ts
corepack pnpm tsx scripts/generate-web-trust.ts
echo "PostgreSQL, 4-node QBFT, deployed registry, and 4 witnesses are ready. Run 'pnpm demo:seed' and 'pnpm dev'."
