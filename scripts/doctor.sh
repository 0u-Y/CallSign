#!/usr/bin/env bash
set -uo pipefail

failures=0
check_command() {
  local name="$1"
  local command="$2"
  if command -v "$command" >/dev/null 2>&1; then
    echo "PASS  ${name}: $($command --version 2>&1 | head -n 1)"
  else
    echo "FAIL  ${name}: '${command}' 명령을 찾지 못했습니다."
    failures=$((failures + 1))
  fi
}

check_command "Node" node
check_command "Docker" docker
check_command "Foundry" forge
check_command "LibreOffice" libreoffice

if corepack pnpm --version >/dev/null 2>&1; then
  echo "PASS  pnpm: $(corepack pnpm --version)"
else
  echo "FAIL  pnpm: Corepack으로 pnpm을 실행할 수 없습니다."
  failures=$((failures + 1))
fi

if docker info >/dev/null 2>&1; then
  echo "PASS  Docker daemon"
else
  echo "FAIL  Docker daemon에 연결할 수 없습니다."
  failures=$((failures + 1))
fi

for port in 4100 4173 4201 4202 4203 4204 18545 28545 38545 48545 55432; do
  if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :${port}" | tail -n +2 | grep -q .; then
    echo "WARN  port ${port}: 이미 사용 중입니다. 기존 CallSign 서비스인지 확인하세요."
  else
    echo "PASS  port ${port}: available"
  fi
done

memory_kib=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
if (( memory_kib >= 4194304 )); then
  echo "PASS  memory: $((memory_kib / 1024)) MiB available"
else
  echo "WARN  memory: $((memory_kib / 1024)) MiB available; 4-node Besu may be unstable."
fi

if (( failures > 0 )); then
  exit 1
fi
