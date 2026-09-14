#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
COMPOSE=(docker compose -f infra/compose/docker-compose.yml)
api_pid=""
cleanup() {
  "${COMPOSE[@]}" start witness3 witness4 >/dev/null 2>&1 || true
  if [ -n "${api_pid}" ]; then kill "${api_pid}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

DEMO_MODE=true corepack pnpm --filter @callsign/api start >.local/witness-failover-api.log 2>&1 &
api_pid=$!
for attempt in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null; then break; fi
  if [ "${attempt}" -eq 40 ]; then echo "API did not become ready" >&2; exit 1; fi
  sleep 0.25
done
query="$(corepack pnpm tsx scripts/latest-state-query.ts)"

"${COMPOSE[@]}" stop witness4 >/dev/null
three_bundle="$(curl -fsS "http://127.0.0.1:4100/state-bundles?${query}")"
if [ "$(printf '%s' "${three_bundle}" | jq '.signatures | length')" -ne 3 ]; then echo "Expected a 3-signature bundle with one witness stopped" >&2; exit 1; fi

"${COMPOSE[@]}" stop witness3 >/dev/null
status="$(curl -sS -o .local/two-witness-response.json -w '%{http_code}' "http://127.0.0.1:4100/state-bundles?${query}")"
if [ "${status}" != "503" ] || [ "$(jq -r '.error.code' .local/two-witness-response.json)" != "WITNESS_THRESHOLD_UNAVAILABLE" ]; then echo "Expected fail-closed 503 with two witnesses stopped" >&2; exit 1; fi

mkdir -p artifacts
printf '%s\n' "${three_bundle}" | jq '{checkedAt: now | todateiso8601, oneWitnessStopped: {status: "PASS", signatures: (.signatures | length), blockNumber: .snapshot.blockNumber}, twoWitnessesStopped: {status: "PASS", httpStatus: 503, error: "WITNESS_THRESHOLD_UNAVAILABLE"}}' > artifacts/witness-failover.json
echo "Witness failover PASS: one stopped => 3 signatures; two stopped => fail-closed 503"
