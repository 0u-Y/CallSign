#!/usr/bin/env bash
set -euo pipefail
command="${1:-}"
case "$command" in start|status|stop|restart|resource-stop) ;; *) echo 'Usage: deployment.sh start|status|stop|restart|resource-stop (no init, build, pull, seed, reset)' >&2; exit 64 ;; esac
if [[ "$command" != status && "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != infrastructure ]]; then echo 'BLOCKED: separate deployment approval required' >&2; exit 78; fi
: "${CALLSIGN_ENV_FILE:?path to protected deployment.env}"
deployment_target="$(node --input-type=module - "$CALLSIGN_ENV_FILE" <<'JS'
import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';
const value=process.env.CALLSIGN_DEPLOYMENT_TARGET??parseEnv(readFileSync(process.argv[2],'utf8')).CALLSIGN_DEPLOYMENT_TARGET??'';
if(!['','aws','server'].includes(value))throw new Error('DEPLOYMENT_TARGET_INVALID');process.stdout.write(value);
JS
)"
# Server mode can only reuse reviewed existing host-network containers; it never invokes Compose up.
if [[ "$deployment_target" == server && ( "$command" == start || "$command" == restart ) ]]; then
  exec node scripts/deployment-control.mjs "server-$command" "$CALLSIGN_ENV_FILE" docker compose
fi
compose=(docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml --profile https --profile pbx --profile media)
if [[ "$deployment_target" == aws ]]; then
  [[ "$command" == status || "${CALLSIGN_AWS_TARGET_CONFIRMATION:-}" == AWS-ONLY ]] || { echo 'BLOCKED: AWS target confirmation required; never run on development host' >&2; exit 78; }
  if [[ "$command" == start || "$command" == restart ]]; then
    mountpoint -q "${CALLSIGN_AWS_MOUNT:?AWS persistent mount to check}" || { echo 'BLOCKED: AWS EBS mount missing' >&2; exit 78; }
  fi
  compose=(docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml -f infra/deploy/compose.aws.yml --profile https --profile pbx --profile media)
fi
# The shipped Compose creates bridges/published ports. It is not the no-network-change development-host launcher.
if [[ "$deployment_target" != aws && ( "$command" == start || "$command" == restart ) ]]; then echo 'BLOCKED: development host network preservation requires a separately reviewed ingress/topology; this Compose creates bridges and publishes ports' >&2; exit 78; fi
provider_config="$(node --input-type=module - "$CALLSIGN_ENV_FILE" <<'JS'
import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';
const env={...parseEnv(readFileSync(process.argv[2],'utf8')),...process.env};const value=env.CALLSIGN_PROVIDER_CONFIG||'none';
if(!['none','deepgram-openai'].includes(value))throw new Error('PROVIDER_CONFIGURATION_INVALID');process.stdout.write(value);
JS
)"
if [[ "$provider_config" == deepgram-openai ]]; then compose+=(-f infra/deploy/compose.providers.yml); fi
oidc_provider="$(node --input-type=module - "$CALLSIGN_ENV_FILE" <<'JS'
import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';
const env={...parseEnv(readFileSync(process.argv[2],'utf8')),...process.env};const provider=env.CALLSIGN_OIDC_PROVIDER||'external';
if(!['external','keycloak'].includes(provider))throw Error('OIDC_PROVIDER_INVALID');process.stdout.write(provider);
JS
)"
if [[ "$oidc_provider" == keycloak ]]; then compose+=(-f infra/deploy/compose.oidc.yml --profile oidc); fi
if [[ "$command" == status ]]; then exec node scripts/deployment-control.mjs status "$CALLSIGN_ENV_FILE" "${compose[@]}"; fi
control=owned
if [[ "$command" == start || "$command" == restart ]]; then control=check; fi
if [[ "$command" == resource-stop ]]; then control=latch; fi
node scripts/deployment-control.mjs "$control" "$CALLSIGN_ENV_FILE" "${compose[@]}"
applications=(https web platform sender issuer worker witness1 witness2 witness3 witness4 asterisk turn)
data=(besu1 besu2 besu3 besu4 postgres)
if [[ "$oidc_provider" == keycloak ]]; then applications+=(oidc); data+=(oidc-db); fi
case "$command" in
  start|restart)
    # Validate actual generated image identities without sourcing env as executable shell text.
    node --input-type=module - "$CALLSIGN_ENV_FILE" <<'JS'
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {immutableImageReference} from './scripts/image-reference.mjs';
const env={...parseEnv(readFileSync(process.argv[2],'utf8')),...process.env};
if(env.CALLSIGN_DEPLOYMENT_TARGET==='aws'){
  const {awsPreflight}=await import('./scripts/preflight-aws.ts');
  if(awsPreflight(env,'runtime',(env.CALLSIGN_FORBIDDEN_HOSTS??'').split(',').filter(Boolean)).some(c=>c.status==='FAIL'||c.status==='BLOCKED'))throw new Error('AWS_RUNTIME_CONFIGURATION_BLOCKED');
}
if(env.CALLSIGN_OIDC_PROVIDER==='keycloak'&&!immutableImageReference(env.KEYCLOAK_IMAGE))throw Error('REVIEWED_KEYCLOAK_IMAGE_REQUIRED');
for(const key of ['CALLSIGN_APP_IMAGE','CALLSIGN_WEB_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'])if(!immutableImageReference(env[key]))throw new Error(`REVIEWED_IMAGE_DIGEST_REQUIRED:${key}`);
if(!/^[0-9a-f]{64}$/.test(env.VITE_SERVICE_TRUST_SHA256??''))throw new Error('PUBLISHED_TRUST_PIN_REQUIRED_BEFORE_START');
JS
    if [[ "$command" == restart ]]; then
      node scripts/deployment-control.mjs stop "$CALLSIGN_ENV_FILE" "${compose[@]}"
    fi
    "${compose[@]}" up -d --no-build --pull never "${data[@]}" "${applications[@]}" ;;
  stop|resource-stop)
    # Manual stop suppresses unless-stopped restart policies; volumes and identities remain intact.
    node scripts/deployment-control.mjs stop "$CALLSIGN_ENV_FILE" "${compose[@]}" ;;
esac
