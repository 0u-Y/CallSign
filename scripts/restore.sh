#!/usr/bin/env bash
set -euo pipefail
if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo 'BLOCKED: restore requires separate approval' >&2; exit 78; fi
: "${RESTORE_DATABASE_URL:?URL of a NEW empty database, never the live database}"
: "${RESTORE_DUMP:?backup dump path}"
: "${RESTORE_CONFIRMATION:?set NEW-EMPTY-DATABASE after reviewing target}"
if [ "$RESTORE_CONFIRMATION" != 'NEW-EMPTY-DATABASE' ]; then exit 78; fi
# pg_restore without --clean never drops existing objects; collision fails.
pg_restore --dbname="$RESTORE_DATABASE_URL" --exit-on-error --single-transaction "$RESTORE_DUMP"
