# 본선 현재 한계

2026-10-27 최신 상태는 [서비스 이행 기록](FINALS-IMPLEMENTATION-PLAN.md#service-20261027)과 [멘토링 현황](mentoring/05-IMPLEMENTATION-STATUS.md)을 따른다. 아래 기존 v2 한계를 새 v3에서 해결 완료한 것으로 승계하지 않는다.

- 실제 PostgreSQL 권한/취소·소비 경합, Issuer/Sender 서비스 간 연결, Besu/witness, 브라우저 마이크/TURN, STT/LLM 제공자, GCP 이전은 미실행이다. 단위/정적 검사 결과만 [진행표](FINALS-IMPLEMENTATION-PLAN.md)에 기록한다.
- PBX 기본 종단은 Asterisk다. 새 ARI 채널/Call-ID·mute/bridge·별도 JWS/SDK·SIP 브라우저 모듈은 부분 구현이며 역할 UI·ARI event/watchdog·자동 회수·실제 설정·배포·전체 시험이 없다. 기존 외부 Edge helper를 서버 완료로 보지 않는다. v2 직접 인증으로 PBX를 수락하지 않는다.
- 원장 VC 등록/복구는 실제 실행하지 않았다. `RegistryOperations`는 별도 승인자 EIP-712 서명을 검증하고 전송하는 코드이며 외부 장애 내성/트랜잭션 재시도/최종성 보장은 미검증이다.
- 기관 단위 JSONB aggregate는 작고 제한된 시연 규모를 위한 것이다. 보관 정책/용량 제한/행 잠금 대기/감사 retention과 DB 역할 권한의 운영 검증이 필요하다.
- STT/LLM 호출별 시간/크기/요청 수는 제한하지만 계정 전체 월간 과금 한도와 다중 프로세스 공유 quota는 v2에 없고 v3에 SQL 예약 코드를 추가했으나 호출/프로세스 경합·실제 비용 검증은 없다. 제공자 콘솔 한도를 병행해야 한다. Deepgram 재접속은 새 stream과 재동의를 요구하며 누락 구간 복구를 보장하지 않는다.
- 한국어 규칙은 부정/인용/자기정정의 일부 패턴을 보수적으로 처리한다. LLM·STT 정확도와 위험 탐지율은 측정하지 않았다. 경고 없음/분석 불가는 안전 판정이 아니다.
- OIDC·HTTPS 도메인/키/trust bundle은 사전 준비가 필요하다. OIDC authorization-code/S256 PKCE·state/nonce·별도 client/audience 로그인 경로를 구현했으나 실제 IdP 통합은 미검증이다. pending state는 프로세스 메모리이므로 다중 인스턴스/재시작 시 다시 로그인해야 한다. 직접 ID token 입력은 개발 모드에서만 보이고 공개 배포 API에서는 차단된다.
- 기존 v2 UI는 짧은 승인 만료에 통화를 종료한다. v3 시작120초/진행 lease API는 작성했으나 UI·양측 연결/갱신·재접속 복구는 미완성이다. v3 임시4시간 cap·lease30초는 운영 확정/실측값이 아니다.
- v2 high-watermark는 메모리뿐이고 v3는 DB checkpoint/recovery gate 코드를 추가했다. 실제 PG·독립 외부 anchor·복원 gate 해제·전체 최신성 복구는 미구현/미검증이다. native header/storage proof는 기본 gate에서 제외한 미구현 확장이다.
- GCP Terraform은 작성했으나 Terraform init/validate/plan/apply하지 않았다. Compose schema 정적 검증은 이미지의 존재·설정·기동을 보장하지 않는다. 기존 PBX overlay는 외부 Edge 전제가 남아 확정 Asterisk 구성으로 수정이 필요하다.

## 기존 v1 한계 기록

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
