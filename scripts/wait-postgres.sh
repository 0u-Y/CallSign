#!/usr/bin/env bash
set -euo pipefail

if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ] && [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "integration" ]; then echo "BLOCKED: explicit infrastructure execution approval required" >&2; exit 78; fi

for attempt in $(seq 1 30); do
  if docker compose -f infra/compose/docker-compose.yml exec -T postgres pg_isready -h 127.0.0.1 -U institutionproof -d institutionproof >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done
echo "PostgreSQL did not become ready within 30 seconds." >&2
exit 1
