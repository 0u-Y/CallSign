#!/usr/bin/env bash
set -euo pipefail
if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo 'BLOCKED: backup requires separately approved database access' >&2; exit 78; fi
: "${CALLSIGN_ENV_FILE:?required}"
: "${BACKUP_DIR:?new protected backup directory}"
# mkdir fails if the destination already exists; never overwrite evidence.
umask 077
mkdir "$BACKUP_DIR"
docker compose --env-file "$CALLSIGN_ENV_FILE" -f infra/deploy/compose.yml exec -T postgres pg_dump -U callsign_migrator -d callsign -Fc > "$BACKUP_DIR/callsign.dump"
sha256sum "$BACKUP_DIR/callsign.dump" > "$BACKUP_DIR/SHA256SUMS"
echo 'DB backup created. Quiesced disk snapshots and encrypted key/trust backups must use the same deployment checkpoint; see docs/RUNBOOK.md.'
