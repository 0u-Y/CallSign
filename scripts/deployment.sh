#!/usr/bin/env bash
set -euo pipefail
if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo 'BLOCKED: separate deployment approval required' >&2; exit 78; fi
: "${CALLSIGN_ENV_FILE:?path to protected deployment.env}"
command="${1:-}"
compose=(docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml --profile https --profile pbx --profile media)
case "$command" in
  start)
    # Validate actual generated image identities without sourcing env as executable shell text.
    node --input-type=module - "$CALLSIGN_ENV_FILE" <<'JS'
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const env={...parseEnv(readFileSync(process.argv[2],'utf8')),...process.env};
for(const key of ['CALLSIGN_APP_IMAGE','CALLSIGN_WEB_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'])if(!/^[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}$/.test(env[key]??''))throw new Error(`REVIEWED_IMAGE_DIGEST_REQUIRED:${key}`);
if(!/^[0-9a-f]{64}$/.test(env.VITE_SERVICE_TRUST_SHA256??''))throw new Error('PUBLISHED_TRUST_PIN_REQUIRED_BEFORE_START');
JS
    "${compose[@]}" up -d --no-build --pull never postgres besu1 besu2 besu3 besu4 witness1 witness2 witness3 witness4 issuer sender worker platform web https turn asterisk ;;
  stop) "${compose[@]}" stop ;;
  restart) "${compose[@]}" restart ;;
  *) echo 'Usage: deployment.sh start|stop|restart (no init, build, pull, seed, reset)' >&2; exit 64 ;;
esac
