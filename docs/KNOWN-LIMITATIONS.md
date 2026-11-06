# 현재 구현의 한계

기준 SHA·확인 날짜·공개 로그인/통화/분석의 실행 상태는 [단일 현황표](guide/05-IMPLEMENTATION-STATUS.md)에서 관리한다. 이 문서는 구현의 보장 범위와 후속 확장을 설명한다. 이전 후보·실패·제공자 호출의 상세 서술은 [이력 보관본](archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-06-문서-대조-전-현황-스냅샷)에 원문으로 보존했다.

## 검증 결과를 해석하는 경계

- 공개 IdP 로그인·업무 API 연결, 공개 통화의 양방향 음성, 실제 제공자의 분석은 서로 다른 완료 조건이다.
- 내부 실제 PBX·합성 음원·fixture 분석 PASS를 외부망·사람 마이크·한국어 모델 품질의 증거로 사용하지 않는다. 같은 호스트의 Besu/Witness는 독립 운영기관의 장애 내성을 입증하지 않는다.
- 과거 Release/GHCR는 당시 source/digest의 전달물이다. 현행 서버컴 데모와 후속 AWS 배포는 각자의 입력·신뢰 설정·실행 증거가 필요하다.
- 과거 실패·timeout·자원 중단의 원인이 미확정이면 후속 성공 뒤에도 미확정으로 남긴다. 소표본을 SLA·성공률로 일반화하지 않는다.

## 현재 서비스

- **PBX 보장 경계.** Asterisk가 DTLS-SRTP 음성 종단이다. ARI는 채널·Call-ID·bridge를 조회한다. 인증서 지문은 배치한 공개 인증서에서 고정하고 브라우저의 실제 관측과 대조한다. 서버의 독립 DTLS handshake 수집이나 원 상담원의 개인 신원 증명은 아니다. 자체 SIP 모듈은 직접 Asterisk WSS/등록/수신 dialog로 제한하며 proxy route·PSTN·임의 transfer·재협상은 거절한다. 이번 Asterisk/PJSIP·ODBC·작업 CA·Chromium 경로는 확인했다. 운영 인증서·다른 단말·외부망 호환은 검증 전이다.
- **통화 정책값.** 120초는 attempt 생성부터의 연결 시작 창이다. lease 30초·최대 4시간은 설정 가능한 초기값이며 합의된 SLA가 아니다. 업무·VC가 먼저 만료되면 더 일찍 종료한다. 기관 서비스 재시작 후 기존 PBX 통화는 정리하고 새 시도를 요구한다. 진행 통화의 무중단 복원은 보장하지 않는다.
- **원장 외부 호출.** 같은 서명 raw tx/hash를 저장한 뒤 제출·조회·재전송한다. 외부 exactly-once는 아니다. 12회 실패는 운영자 확인 상태로 남고, 결과 불명의 signer nonce가 있으면 새 nonce 발급도 차단한다. 다른 도구가 같은 관리자 계정으로 동시에 tx를 제출하는 운영은 지원하지 않는다.
- **독립 복구 기준.** anchor는 별도 장애·백업 영역에 배치해야 한다. VM 백업 안의 값만으로 차단을 풀지 않는다. 외부 CAS 진행 뒤 DB commit이 불명확하거나 기존 소비 이력과 journal이 다르면 gate를 닫는다. 완전한 최신 이력이 없으면 자동 복구하지 않으며 운영자 재신뢰 판단이 필요하다. 구 배포를 새 구조로 옮길 때 소비 journal 기준도 별도 대조해야 한다.
- **DB와 운영.** 행 잠금·공통 소비 제약·quota 예약/정산·작업 claim·retention·권한 SQL을 구현했고 격리 시험의 소비/claim/quota 경합·응답 유실과 auth LOGIN의 제한된 실제 허용/금지 SQL은 검증했다. 모든 production 역할의 SQL 전체, 영속 disk 장애/부하 내성은 미검증이다. JSONB 기관 aggregate의 실제 성장·잠금 비용도 미측정이다. 백업 도구의 chain archive는 정지된 체인의 일관 snapshot이어야 하며 이 조건을 파일 복사만으로 입증할 수 없다.
- **요금·AI.** 사용 초·요청·입력 바이트를 제한/계측하지만 STT는 연결 초/바이트와 응답을 제한하며 실제 제공자 음성 길이 과금·청구서·가격 정산은 구현하지 않았다. 제공자 콘솔 지출 한도와 짧은 입력 검토를 별도로 적용해야 한다. 원음/전사는 기본 비영구이고 모델 제공자 측 보관 설정은 별도 확인 대상이다. 36개 합성 개발 fixture의 규칙 결과는 독립 한국어 품질·실제 STT/LLM 평가가 아니다. 재연결은 새 동의·스트림을 요구하며 누락 음성을 복구하지 않는다.
- **인증·관리.** 주요 작업은 실제 OIDC auth_time이 최근인지 검사하고 토큰 iat로 재인증을 대신하지 않는다. 실제 IdP/MFA 정책은 미검증이며 로그인 진행 상태는 재시작 후 다시 로그인해야 한다. 관리 화면은 등록한 OIDC issuer/subject에 내부 역할을 연결하며 외부 IdP 계정을 생성하지 않는다. 공동 정책·공식 경로 변경은 새 계약에서 2-of-3으로 연결했지만 기존 배포가 자동 변경되지는 않는다. 공동 변경 전후 비교·제안 내보내기/서명 가져오기·로컬 digest/서명 검사를 연결했다. Chromium에서 로그인·생성/취소·역할 메뉴·390px overflow·Tab/focus·select label을 확인했으나 공동 관리 전체·다른 브라우저·보조기술 접근성은 미검증이다.
- **복구 이행.** 새 authority checkpoint 기준이 없는 구 DB는 gate를 닫는다. 별도 수명 anchor와 동일한 소비·계정/키/정책 이력을 복구하지 못하면 자동 해제하지 않는다. 기존 DB의 flag나 anchor만 임의로 초기화하는 절차는 없다. DB·Issuer·anchor 관리자는 신뢰 대상이며 이 journal이 임의 악성 DB 관리자까지 방어한다는 주장은 하지 않는다.
- **관측·알림·증거.** 내부 웹 알림의 영속/중복 억제/설정/만료는 구현했고 외부 문자·메일 채널은 미선택이다. 고정 runner는 시험·guard·환경 identity와 증거를 연결한다. 과거 MANUAL이나 파일 첨부만으로 PASS하지 않으며 assessment에서 수동/실행/판정을 구분한다. 실제 통화·복원·원격 이미지 수령의 선택 assertion과 전체 장애 조합·운영 trace·성능 표본은 다르다. 브라우저 duration은 비신뢰 단말 관측이며 체인 확정→화면 실측을 대신하지 않는다.
- **실행 준비 검사.** preflight 결과는 해당 입력·단계·시점에만 적용된다. 오프라인 PASS는 실제 DNS/TLS·DB 권한·AWS 준비 성공의 증거가 아니다. Node 자식의 네트워크/listen 차단은 OS 수준 악성 코드 sandbox가 아니며 native 도구의 모든 통신을 일반적으로 가로채지는 않는다. runner는 고정 도구·시험 소스·별도 시험 배포를 사용한다.
- **신뢰 게시.** 정책/키 확정 뒤 공개 trust·웹 pin·runtimePolicy가 맞지 않으면 신규 발급/연결을 막는다. 선택한 정책 변경과 새 trust/web 전환은 신규 리허설에서 확인했지만 여러 replica·오래된 캐시·외부 배포의 전환과 부분 실패 복구는 미검증이다. 일반 재시작에 신뢰 전환이나 키 재생성을 숨기지 않는다.
- **별도 확장.** 선택 DID의 추가 DNS/캐시 방어와 체인 헤더·commit seal·account/storage proof 직접 검증은 기본 PBX 서비스와 분리한다. Witness를 native proof로 설명하지 않는다.

## 이번 범위 밖의 구현

Registry 전역 고정 승인자 교체·기관별 승인자 집합·정족수 변경, Witness의 직접 체인 proof 대체는 미구현이다. 관리2-of-3은 특정 기관의 필수 동의를 보장하지 않는다. 후속 변경에는 새 권한 모델·서명/nonce/키 세대·구 trust 전환과 회귀가 필요하며 기존 ABI/서명 도메인은 유지한다.

상용 CTI/PSTN·금융사 앱 SDK·기본 전화 화면·외부 알림 전송은 지원을 확인하지 않았다. 현재 Sender/Asterisk/API 계약을 임의 CTI 호환성으로 확대하지 않는다. [CTI 경계](PROTOCOL.md#cti-boundary)를 따른다.

## 과거 증거와 재시작

과거 DB/application 복원·별도 cluster·EVM·세션 자연 만료·PBX 재시도는 당시 원본으로 연결하며 최신 이미지 전체 재실행으로 복사하지 않는다. 초기 시연의 철회 후 통화 유지 정책과 현재 종료 정책은 다르다. [과거 기록](archive/DEVELOPMENT-HISTORY-20261104.md)·[실행 절차](LOCAL-VALIDATION.md)에서 시점을 확인한다.

정상 분석 drain과 quota pool 종료 순서는 회귀했지만 프로세스 강제 종료의 즉시 환불을 보장하지 않는다. 기존 worker는 예약 만료 후 보수 정산하며 실제 제공자 청구 대조는 별도다. 보존 대상 환경의 영향 여부는 미확인이고 balance를 임의 초기화하는 복구 절차는 없다.


## 2026-11-06 Deepgram·분석 후속 점검

- 저장소의 공통 `DeepgramStream`에 `mip_opt_out=true`를 강제했다. 일반 `/v3/audio`, 기존 finals `/v2/audio`, `provider-smoke.ts`가 같은 연결 코드를 사용한다. 환경 옵션으로 해제하지 않는다. **코드·오프라인 검증 완료와 실행 이미지 반영은 별도다.** 후속 승인으로 실행 runtime `3db968c`에 반영하고 파일 대응·readiness를 확인했다. 실제 제공자는 꺼져 있으며 새 opt-out 유료 요청은 미실행이다.
- [Deepgram 공식 처리 설명](https://developers.deepgram.com/trust-security/your-data)에 따르면 opt-out 요청의 음성·텍스트·전사는 처리 후 보관하지 않지만 요청 메타데이터·사용 로그는 남는다. 우리 앱의 메모리/로그/보호 시험 파일 보관과 별개다. 과거 요청에 소급되지 않는다.
- 제공된 키로 프로젝트 메타데이터 GET은 200(1개 프로젝트), 해당 기간 요청 로그 GET은 **403**이었다. 원본 응답은 저장하지 않았다. 계정 강제 opt-out·과거 요청의 flag·실제 보관 여부는 **미확인**이다. 다음 승인된 유료 시험에서 Usage > Logs 또는 권한 있는 요청 메타데이터로 확인한다. 키 원문이나 새 광범위 키를 요구하지 않는다.
- STT stop은 소켓 종료와 revision 텍스트 맵·카운터를 정리하며, 이전 소켓의 늦은 결과/error/close는 새 연결에 적용하지 않는다. 이는 메모리 참조 제거이며 물리 메모리의 보안 삭제를 보장하는 표현은 아니다.
- 일반 분석 경로에서 원음/전사를 파일·application log에 쓰는 코드는 발견하지 못했다. 브라우저 recorder는 종료 후 마지막 blob을 전송하지 않고, 서버는 stop/권한 검사와 analyzer 세대로 늦은 결과를 폐기한다. 기본 요청 로그는 꺼져 있다. 분석 실패 로그에는 허용된 코드·임시 stream ID·요청 순번·시간만 남긴다. 보호 시험 입력과 UI 캡처에는 합성 음원·전사가 있을 수 있으므로 “어디에도 저장되지 않음”이라고 하지 않는다.

| 분석 단계 | 현재 코드·증거 |
|---|---|
| STT partial/final | Deepgram adapter가 segment 위치·revision·final 중복을 검사. case24 실제 전사 수신 |
| final 문맥·요청 | `ServiceRevisionAnalyzer`가 final만 선택, partial 재과금 방지, 후속 final 병합. `7c5a839`가 실행 이미지에 포함 |
| OpenAI 응답·파싱·근거 | HTTP 상태 / 응답 JSON / 분석 JSON / schema / 근거 검증을 구분. case24의 완료 응답 단계는 미관측이며 어떤 단계에서 실패했는지 확정 불가 |
| 서버 event | `isCurrent`와 재권한 확인 후 전송. 과거 실패의 완료 event는 없음 |
| 브라우저·화면 | 현재 controller·분석 세대·contextRevision·정책 검사 뒤 표시. 기존 fixture와 오프라인 회귀이며 최신 실제 제공자 화면 성공은 미확인 |

case29는 05:38:23.983Z 시작, 약29.2초 실행이며 browser 요청 실패 기록 순서는 sender claim → recipient workspace → recipient auth/me다. 각 실패의 시각은 원본에 없어 복원하지 않는다. case24(05:12:47.652Z)와 별개이며 그 당시 runtime은 `547290b`였다. 기존 netlink 표본은 14:19:12~14:20:15 KST(05:19 UTC), **case29와 동시 표본이 아니다**. Docker/Playwright 시작은 같은 호스트 wall clock이나 callback 지연 오차는 미측정이다. ingress access log와 API request log가 꺼져 있어 실패 요청의 서버 도착 여부도 미확인이다. `ERR_NETWORK_CHANGED`는 HTTP 401/503이나 PBX/TURN 장애 확정이 아니다.

다음 승인된 관측은 통화보다 먼저 같은 인증 세션의 읽기 전용 auth/me·workspace를 제한 횟수 조회해 오류가 미디어 없이 재현되는지 확인한다. observer에 wall UTC 기준점과 단일 monotonic 경과시간·HTTP status를 추가했으며 원음·쿼리·cookie·헤더는 기록하지 않는다. 별도 시계의 netlink와 정확한 지연값을 계산하지 않는다. 이번에는 새 브라우저·통화·유료 호출을 실행하지 않았다.
