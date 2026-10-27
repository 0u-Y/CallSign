# ADR 0002: 업무 권위, 분리된 키, v2와 오프라인 개발

상태: 부분 대체. 2026-10-26 결정 중 DID 기본·짧은 통화 수명·외부 Edge 전제는2026-10-27 사용자 확정으로 대체됐다. 등록 URI/키 기본·DID 선택,120초 시작과 lease 분리, Asterisk 양측 웹 종단, native 후속 확장을 따른다. [MASTER 확정 결정](../MASTER-DEVELOPMENT-SPEC.md). 기존 v1 계약·fixture·시험 증거를 보존한다.

1. **기존 스택 유지.** 별도 프레임워크나 VC SDK를 추가하지 않는다. 기존 jose/JCS/zod/viem을 재사용한다. 모의 금융 FDS는 실제 기관 연동이 아니다.
2. **업무가 권한의 시작점이다.** 기관 레코드에 소속·역할·서비스·수신자·상담원 할당을 저장한다. 입력의 수신자나 목적을 발신자가 덮어쓰지 못한다. 운영 규모에 맞춘 정규화 대신 기관 단위 JSONB aggregate를 선택했다. 기관 행의 `FOR UPDATE`가 취소·소비·키 회전의 공통 직렬화 경계다. 규모가 커지면 테이블별 모델과 잠금 순서를 설계해야 한다.
3. **기관/서비스 키를 플랫폼과 브라우저 밖에 둔다.** 기존 API는 로컬 v1 회귀용이다. 본선 실행 파일은 role에 따라 Platform, Issuer Gateway, Sender Agent로 분리된다. Platform은 DB·기관키·서비스키를 열지 않는다. Sender는 Issuer가 검사한 상담원·시도·브라우저 공개키만 짧게 허가한다. issuer_v2 쓰기는 별도 DB group role로 한정한다.
4. **VC와 연락 승인은 다른 객체다.** VC 2.0 JSON을 JOSE `vc+jwt`로 서명하고, 연락 승인은 CallSign v2 strict schema를 사용한다. VC digest 문자열을 기존 계약의 delegation ID 입력으로 사용한다. 정책 hash·키 버전·epoch를 별도로 결합한다. v1로의 자동 fallback은 없다.
5. **영수증은 commit 전에 서명해서 함께 저장한다.** 재시도는 저장된 JWS를 반환한다. 취소가 먼저 commit되면 소비를 거절한다. 소비가 먼저 commit돼도 이후 상태 질의에서 취소를 반영한다. PostgreSQL의 실제 격리/경합 보장은 후속 검증 전 미검증이다.
6. **witness 후보를 분산한다.** 집계기는 단일 RPC나 가장 낮은 응답 높이를 채택하지 않고 각 witness의 후보 블록을 다른 witness에게 검사시킨다. 같은 payload의 유효 서명 3개를 모으면 느린 나머지 요청을 취소한다. 블록 timestamp와 최초 monotonic deadline을 유지한다. 네이티브 QBFT 증명은 아니다.
7. **음성과 분석은 동의로 연다.** 수락 전 RTP sender에 마이크 track을 부착하지 않는다. 음소거·종료·오류에서 track을 정리한다. 새 PeerConnection/ICE 변경은 새 승인과 검증을 요구한다. STT는 상대 stream만 받으며 provider 장애를 안전으로 표현하지 않는다. 규칙은 보수적이고 정확도 주장을 하지 않는다.
8. **실환경은 별도 실행 계약이다.** light에 인프라와 외부 API를 섞지 않는다. 수동 CI도 별도 승인·protected environment가 필요하다. 이 작업에서는 차단을 해제하지 않는다.
