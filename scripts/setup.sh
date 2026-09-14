#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
forge build
"${ROOT_DIR}/scripts/generate-besu.sh"
echo "CallSign setup complete. Run 'pnpm demo:up' next."
