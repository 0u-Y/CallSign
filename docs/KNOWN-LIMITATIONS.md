# Known limitations

- `native-qbft` P2는 NOT-RUN이다. `eth_getProof` 응답 파싱, QBFT commit seal, validator quorum, stateRoot 연결을 구현 완료했다고 주장하지 않는다.
- Chromium 153 localhost에서만 실제 remote certificate API와 WebRTC를 검증했다. Firefox/Safari, 실제 모바일, TURN, HTTPS 다중 기기는 NOT-RUN이다.
- 같은 호스트의 네 Docker witness는 키·프로세스·RPC가 분리됐지만 독립 조직 운영 증거가 아니다.
- trust bundle은 생성 스크립트가 웹 소스에 고정한다. 체인을 reset하면 `pnpm demo:up`으로 새 bundle을 만들고 Vite를 재시작해야 한다.
- 공동 운영 화면은 실제 긴급 정지와 서로 다른 승인자 2명의 EIP-712 서명을 Besu 복구 트랜잭션까지 연결한다. 다만 키는 재현 가능한 한 로컬 환경에 있고 독립 기관이 각자 보관한다는 운영 증거는 아니다. 복구는 관리자·정지키를 교체하지만 실행 중 issuer와의 정합성을 위해 승인용 Ed25519 키는 유지한다.
- 개별 승인 취소는 DB 상태, 위임 취소는 원장 상태다. 현재 데모는 한 승인에 새 위임 하나를 발급해 취소 장면을 명확히 한다.
- active page 상태 polling은 3초이며 마지막 E2E의 취소 요청→표시 철회는 6.691초였다. 이는 체인 확정·witness 관측·브라우저 polling을 포함하며 매 실행 달라진다. monotonic deadline 이후 UI timer jitter J≤1초는 반복 측정하지 않았고 백그라운드에서는 보장하지 않는다.
- 서버가 issuer key와 enrollment key를 보관한다. 실제 배포에는 HSM/기관별 분리와 key rotation 절차가 필요하다.
- 동의한 합성 전사문에 대한 규칙 fallback과 localhost 전용 Ollama structured-output adapter는 구현했다. 이번 환경에서는 `OLLAMA_MODEL`을 설정하거나 모델을 다운로드하지 않아 실제 LLM 추론은 NOT-RUN이다. 규칙/모델 미검출은 안전 보장이 아니다.
- 실제 기관·통신사 연동, 채택 의사, 효과·비용, 피싱 탐지 정확도, 공개 LIVE 인프라는 검증되지 않았다.
- Vercel 공개 배포는 정적 `PUBLIC · UI PREVIEW`다. 브라우저 안에서 실행되는 Ed25519/3-of-4 검증 fixture와 저장된 로컬 시험 결과를 보여주지만, Vercel에서 PostgreSQL·Besu 4노드·witness 4개·두 브라우저 WebRTC LIVE 흐름을 실행하지 않는다. 해당 LIVE 흐름은 저장소의 localhost 실행 절차로 재현한다.
