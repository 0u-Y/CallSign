#!/usr/bin/env bash
set -euo pipefail
# Restores only a new database and directory, with recovery gates closed.
exec pnpm exec tsx scripts/restore-bundle.ts
