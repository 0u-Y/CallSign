#!/usr/bin/env bash
set -euo pipefail

if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo "BLOCKED: explicit infrastructure execution approval required" >&2; exit 78; fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${CALLSIGN_BESU_DIR:-${ROOT_DIR}/.local/besu}"
NETWORK_CONFIG="${CALLSIGN_NETWORK_CONFIG:-${ROOT_DIR}/infra/besu/network-config.json}"
GENERATED_DIR="${OUTPUT_DIR}/generated"
if [[ -f "${OUTPUT_DIR}/genesis.json" && -f "${OUTPUT_DIR}/keys/node4/key" ]]; then
  pnpm --dir "${ROOT_DIR}" exec tsx "${ROOT_DIR}/scripts/prepare-besu-peers.ts" "${OUTPUT_DIR}" --apply
  echo "Besu QBFT keys and genesis already exist; reusing ${OUTPUT_DIR}."
  exit 0
fi

if [[ -f "${OUTPUT_DIR}/genesis.json" || -f "${OUTPUT_DIR}/keys/node1/key" ]]; then
  echo "INCOMPLETE_NETWORK_REQUIRES_REVIEW: existing material will not be overwritten" >&2
  exit 78
fi
mkdir -p "${OUTPUT_DIR}"
if [[ ! -f "${GENERATED_DIR}/genesis.json" ]]; then
  docker run --pull=never --rm \
    -v "${NETWORK_CONFIG}:/config/network-config.json:ro" \
    -v "${OUTPUT_DIR}:/output" \
    "${BESU_IMAGE:-hyperledger/besu:26.8.1}" \
    operator generate-blockchain-config \
    --config-file=/config/network-config.json \
    --to=/output/generated \
    --private-key-file-name=key \
    --public-key-file-name=key.pub
fi

cp "${GENERATED_DIR}/genesis.json" "${OUTPUT_DIR}/genesis.json"
mapfile -t KEY_DIRS < <(find "${GENERATED_DIR}/keys" -mindepth 1 -maxdepth 1 -type d | sort)
if [[ "${#KEY_DIRS[@]}" -ne 4 ]]; then
  echo "Expected four generated validator directories, found ${#KEY_DIRS[@]}." >&2
  exit 1
fi
for index in 0 1 2 3; do
  node=$((index + 1))
  mkdir -p "${OUTPUT_DIR}/keys/node${node}"
  cp "${KEY_DIRS[$index]}/key" "${OUTPUT_DIR}/keys/node${node}/key"
  cp "${KEY_DIRS[$index]}/key.pub" "${OUTPUT_DIR}/keys/node${node}/key.pub"
  chmod 600 "${OUTPUT_DIR}/keys/node${node}/key"
done
pnpm --dir "${ROOT_DIR}" exec tsx "${ROOT_DIR}/scripts/prepare-besu-peers.ts" "${OUTPUT_DIR}" --apply
echo "Generated four local-only QBFT validator keys and genesis."
