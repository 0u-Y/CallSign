#!/usr/bin/env bash
set -euo pipefail
if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo 'BLOCKED: separate deployment approval required' >&2; exit 78; fi
: "${CALLSIGN_ENV_FILE:?path to protected deployment.env}"
command="${1:-}"
case "$command" in
  start) docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml --profile https up -d --no-build --pull never ;;
  stop) docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml --profile https stop ;;
  restart) docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml --profile https restart ;;
  *) echo 'Usage: deployment.sh start|stop|restart (no init, build, pull, seed, reset)' >&2; exit 64 ;;
esac
