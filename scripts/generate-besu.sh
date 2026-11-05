#!/usr/bin/env bash
set -euo pipefail

if [ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != "infrastructure" ]; then echo "BLOCKED: explicit infrastructure execution approval required" >&2; exit 78; fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${CALLSIGN_BESU_DIR:-${ROOT_DIR}/.local/besu}"
NETWORK_CONFIG="${CALLSIGN_NETWORK_CONFIG:-${ROOT_DIR}/infra/besu/network-config.json}"
GENERATED_DIR="${OUTPUT_DIR}/generated"
PEER_ARGS=("${OUTPUT_DIR}")
PEER_MODE_ARGS=()
case "${CALLSIGN_BESU_PEER_MODE:-private-network}" in
  private-network) ;;
  host-loopback) PEER_MODE_ARGS+=(--host-loopback) ;;
  *) echo 'BESU_PEER_MODE_INVALID' >&2; exit 78 ;;
esac
if [[ -n "${CALLSIGN_ENV_FILE:-}" ]]; then PEER_ARGS+=(--env-file "${CALLSIGN_ENV_FILE}"); fi
prepare_peers() {
  if [[ -n "${CALLSIGN_TOOL_IMAGE:-}" ]]; then
    # All TypeScript and installed dependencies are inside the reviewed image, not this host checkout.
    docker run --pull=never --rm --network none --cap-drop ALL --security-opt no-new-privileges \
      --user "$(id -u):$(id -g)" --memory 256m --memory-swap 256m --cpus 1 --pids-limit 64 \
      --env-file "${CALLSIGN_ENV_FILE:?protected deployment env}" --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure \
      --mount "type=bind,src=${OUTPUT_DIR},dst=/network" \
      "$CALLSIGN_TOOL_IMAGE" pnpm exec tsx scripts/prepare-besu-peers.ts /network "${PEER_MODE_ARGS[@]}" --apply
  else
    pnpm --dir "${ROOT_DIR}" exec tsx "${ROOT_DIR}/scripts/prepare-besu-peers.ts" "${PEER_ARGS[@]}" "${PEER_MODE_ARGS[@]}" --apply
  fi
}
if [[ -f "${OUTPUT_DIR}/genesis.json" && -f "${OUTPUT_DIR}/keys/node4/key" ]]; then
  prepare_peers
  echo "Besu QBFT keys and genesis already exist; reusing ${OUTPUT_DIR}."
  exit 0
fi

if [[ -f "${OUTPUT_DIR}/genesis.json" || -f "${OUTPUT_DIR}/keys/node1/key" ]]; then
  echo "INCOMPLETE_NETWORK_REQUIRES_REVIEW: existing material will not be overwritten" >&2
  exit 78
fi
mkdir -p "${OUTPUT_DIR}"
if [[ ! -f "${GENERATED_DIR}/genesis.json" ]]; then
  docker run --pull=never --rm --network none --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" --memory 1g --memory-swap 1g --cpus 1 --pids-limit 256 \
    --env JAVA_OPTS=-Xmx512m \
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
prepare_peers
echo "Generated four local-only QBFT validator keys and genesis."
