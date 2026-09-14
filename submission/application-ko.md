# CallSign 신청 문구 · TEAM Signal

- 프로젝트명: CallSign
- 한 줄 소개: 기관이 승인한 연락인지, 전화를 받는 순간 확인하는 블록체인 기반 기관 발신 인증 서비스.
- 제안 트랙: Web3 기반 사회문제 해결
- 팀명·인원·소속: TEAM Signal · 2명 · 충남대학교 컴퓨터융합학부

## 300자 소개

CallSign는 표시된 기관명을 믿는 대신 개별 연락 승인, 위탁 발신 권한, 현재 브라우저 연결을 나누어 확인하는 작동형 개념검증입니다. 모의 기관이 Alice의 업무에 한정된 승인서를 발급하면 위탁센터 브라우저가 WebRTC로 연락합니다. 수신 브라우저는 3-of-4 상태 증언과 실제 DTLS 연결을 검증하며, 원장 위임이 취소되면 통화는 유지한 채 인증 표시를 철회합니다. 민감한 서류는 별도 로그인과 객체 권한이 있는 공식 업무 화면에서만 엽니다.

## 700자 소개

기관 사칭 대응은 표시 이름이나 일반 위임만으로 끝나지 않습니다. 국민에게 필요한 질문은 “이 기관이 이 수신자에게 이 목적으로 지금 연락하도록 승인했는가, 그리고 그 승인이 현재 연결과 같은가”입니다. CallSign는 기관의 Ed25519 개별 연락 승인서, PostgreSQL의 원자적 1회 소비 영수증, 수신자 세션 challenge, 게이트웨이 로컬키, 양측 SDP fingerprint와 실제 remote DTLS certificate, 같은 datachannel의 상호 서명을 연결합니다. 권한 상태는 Besu QBFT 4노드의 계약에 기록하고 각자 자기 노드만 읽는 witness 4개 중 동일 snapshot에 대한 3개 서명을 브라우저가 직접 검증합니다. 정상 통화 뒤 실제 위임 취소를 실행하면 수신자의 확인 표시만 철회됩니다. 공식 업무는 전화 증명과 분리된 로그인·task owner 검사로 보호합니다. 이 P0은 네이티브 QBFT light client가 아니라 별도 witness quorum 프로파일이며, 실제 기관·통신사 참여나 전국 배포를 주장하지 않습니다.

## 1500자 소개

CallSign는 기관 사칭 전화를 “누가 전화했는가”만의 문제가 아니라 승인, 권한 상태, 실제 연결, 후속 행동의 연결 문제로 정의합니다. 기관의 일반 위임은 위탁센터가 임의 고객에게 연락해도 된다는 뜻이 아닙니다. 모의 A시청 담당자는 특정 테스트 이용자와 목적, 짧은 유효기간을 가진 ContactAuthorization을 업무 승인키로 서명합니다. 위탁센터 C의 게이트웨이 키는 해당 epoch와 목적 범위로 InstitutionRegistry에 위임됩니다.

Alice의 브라우저는 enrollment된 세션키로 새 nonce와 session을 확인합니다. 두 브라우저가 같은 BUNDLE PeerConnection에서 offer/answer, audio transceiver, datachannel을 협상한 뒤 authorization, 1회 ConsumptionReceipt, SessionBinding, gateway SessionProof를 대조합니다. signed SDP fingerprint뿐 아니라 Chromium의 실제 remote DTLS certificate를 hash하고, 같은 datachannel에서 양측 새 nonce에 역할을 붙인 서명을 왕복합니다. 오디오는 수락 전 sender track을 붙이지 않아 실제 E2E에서 0 bytes를 확인했고, 수락 후 생성 음원의 RTP 증가를 측정했습니다.

권한 상태는 네 개의 Besu QBFT validator가 공유합니다. 네 witness는 각자 지정된 full node 하나에서 같은 block number와 hash를 다시 확인하고 기관·위임 상태를 고정 조회해 Ed25519로 서명합니다. 집계 API는 전달자일 뿐이며 수신 브라우저가 고정 trust bundle의 서로 다른 3개 서명, freshness, monotonic deadline, rollback 방지를 검증합니다. 한 witness 중단 시 3개 서명으로 계속 동작하고 두 개 중단 시 503으로 fail-closed 되는 것을 실제 실행했습니다. 이 방식은 네이티브 QBFT header proof가 아니며 추가 witness 신뢰 가정을 분명히 표시합니다.

실제 원장 위임 취소 후 활성 브라우저의 3초 polling에서 인증 표시가 철회되지만 통화 자체는 강제로 끊지 않습니다. 민감한 서류는 `/official`의 별도 HttpOnly 세션과 객체별 owner 검사로만 접근합니다. 동의한 합성 전사문은 인증과 독립된 읽기 전용 패널에서 분석합니다. localhost 전용 Ollama adapter와 규칙 fallback을 구현했으며 모델이 없으면 반드시 “규칙 기반 분석”으로 표시합니다. 이번 환경의 실제 LLM 추론은 NOT-RUN입니다. 본선 목표는 전국 서비스가 아니라 통제 환경에서 정상·사칭·복사·취소·복구와 그 검증 증거를 재현하는 것입니다.

## 문제·해결·차별화·기술·도입

- 문제: 기관 표시 이름과 일반 위임만으로 개별 연락 승인 및 현재 연결을 판단할 수 없다.
- 해결: 수신자별 승인 → 1회 소비 → WebRTC 전송 결합 → 최신 권한 quorum → 공식 로그인 경로.
- 차별화: SIP Identity/RCD/STIR의 기존 역할을 인정하면서 애플리케이션 수준의 개별 승인, 브라우저 전송 대조, 공동 상태 전환, 공식 업무 분리를 한 흐름으로 검증한다.
- 기술: Solidity/Foundry, Besu QBFT, 3-of-4 Ed25519 witness, JCS/JWS, Fastify/PostgreSQL, WebSocket/WebRTC, React/Playwright.
- 도입 가설: 공동 권한 상태의 운영 필요와 비용 부담 의사는 미검증이며 기관·통신사 sandbox 실험이 다음 단계다.
- 팀: 양영우는 아키텍처·계약·API·보안 검증, 이가은은 UX·프론트엔드·API 연동·데모 경험을 담당한다.
- 선택 제출: 공개 GitHub 소스코드 1건 — https://github.com/0u-Y/CallSign
