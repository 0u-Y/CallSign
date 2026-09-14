#!/usr/bin/env bash
set -euo pipefail

for attempt in $(seq 1 30); do
  if docker compose -f infra/compose/docker-compose.yml exec -T postgres pg_isready -U institutionproof -d institutionproof >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done
echo "PostgreSQL did not become ready within 30 seconds." >&2
exit 1
