#!/usr/bin/env bash
set -euo pipefail
# Explicit infrastructure guard and non-overwriting bundle creation live in the typed entrypoint.
exec pnpm exec tsx scripts/backup-bundle.ts
