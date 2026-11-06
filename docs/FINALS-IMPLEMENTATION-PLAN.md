# 개발 현황과 검증 기록

## 현재 상태와 다음 단계

현재 구현·실행 범위는 [기준 SHA와 확인 날짜가 있는 현황표](guide/05-IMPLEMENTATION-STATUS.md)에서 관리한다. 이 문서의 날짜별 “현재”·PASS·미완료는 당시 소스·환경의 기록이다. 과거 실패와 후속 성공은 각각 보존한다. 이전 상단 표는 [이력 보관본](archive/DEVELOPMENT-HISTORY-20261104.md#같은-기준의-개발-진행표-상단)에 옮겼다.

## 2026-11-06 Risk-only grounded analysis (offline implementation)

Implemented from user-supplied core requirements and actual code. The separate ChatGPT prompt/design originals were not available or reviewed. `callsign-risk-2` replaces the active service prompt with an English, four-code classifier; purpose-deviation analysis is excluded, while signed purpose/delegation/authorization checks remain unchanged. The active `/v3/audio` path, OpenAI/Anthropic request, smoke tool, server validation and recipient panel use the new contract. Legacy purpose schemas/functions remain only for explicit old-event compatibility and historical offline regressions; the old purpose evaluator refuses paid execution.

- Prompt/evidence: `services/api/src/risk-assessment.ts`; contract: `packages/protocol/src/analysis.ts`. Server snapshot IDs resolve to full exact segment/revision text, including repeated sentences. Only policy-enabled codes are analyzed; omitted codes are not safe verdicts. Empty, invented, duplicate or known contradictory references fail validation. This does not establish semantic correctness of a model explanation.
- Lifecycle: the existing scheduler handles final/partial, coalescing, abort and limits. Rules and LLM results remain distinct; explicit withdrawal retains the occurrence, incomplete/unrelated corrections do not erase it, and changed STT revisions invalidate old evidence. Valid previous detected evidence is memory-only and marked with its evaluated context revision; stop clears it. No audio/transcript persistence was added.
- Follow-up regression: a later segment mentioning OTP and cancelling a transfer incorrectly withdrew the earlier OTP evidence. Reproduced before the fix; cancellation now binds to the nearest named request in the cancellation sentence. Focused risk/lifecycle tests (33) and API types pass. This is a bounded rule correction, not semantic model-quality proof.
- UI: the Recording layout/controller remains; the analysis panel shows code, exact quote, Korean explanation, server criterion, source and execution status. No purpose `not-detected` filler, safety score, automatic suspension or model-generated links. Old events are labeled as old format, not new risk assessments. End/withdraw controls retain their separate lifecycle.
- Offline evidence: focused unit/SSR regressions, all four project type checks, source hygiene and web production build passed. These are not real model-quality or authenticated-browser results. Exact checks and counts are in `artifacts/risk-analysis-20261106.json`.
- Evaluation: `tests/fixtures/risk-analysis-v2.json` separates synthetic development and held-out families. Held-out model calls are NOT_RUN, expectations are not independent human labels. The existing `scripts/evaluate-service-analysis.ts` accepts this v2 fixture; without `--provider` it emits NOT_RUN, not invented results. Provider execution still requires the existing numeric cost/call/source/image guards and fresh authorization. Per-type metrics, abstentions, failures, missing runs and human evidence/explanation review are separate.
- Running service was not replaced or restarted. Last pre-change issuer source remains `1ac1c0d`, provider OFF, original expiry 2026-11-07 08:37 KST. New runtime/public authenticated verification and actual STT→LLM→screen are pending coordinated approval; previous case33 is unchanged. Requested next execution remains one call, DG≤20s/one connection, LLM≤2 requests/700 output tokens/4000 transcript characters, no retries or TTS, then OFF. The versioned system prompt/policy/JSON overhead is additional input; these limits are not a billing guarantee.

## 2026-11-06 승인된 분석 완료 시험 case33

사용자가 수정 issuer 반영과 한정 통화/유료 시험1회를 승인했다. `1ac1c0d`의 runtime config ID `57e22e97…`를 issuer에만 반영하고 소스 hash·readiness를 확인했다. 다른20개 서비스·DB/키/원본 latch와 운영 만료는 유지했다. 기존 합성 PCM15.3초를 재사용했다.

case33은 실제 업무·승인·독립 수락, TURN relay/양방향 합성 음원 디코딩·페이지 이동, 파일 선택/송출 표시, remote-track recorder와 Deepgram ready까지 진행했다. 이후 전사0으로20초 대기 timeout, OpenAI 호출0·완료 event/제품 표시 미실행이다. 자동 재시도0. quota 정산은 STT1연결/연결 경과4초이며 실제 전송 음성초·청구액은 미확인이다. provider-enabled issuer 로그를 OFF 교체 전에 보존하지 못했고 recorder/visibility/WS 종료 타임라인도 없으므로 원인을 확정하지 않는다. 후속 observer에 bounded lifecycle·WS close/error를 추가하고 단위3건·light 타입 검사로 확인했다. 다음 보호 launcher는 교체 전 로그를 보존하되 관측 실패가 OFF 복귀를 막지 않게 준비했다.

finally 제공자OFF·수정 issuer readiness200, 활성통화/예약0·outbox done212·trial 제거를 확인했다. 세 역할의 첫 로그아웃 요청은 purpose 누락으로400이었으며 정확한 work scope 요청으로200·후속401 확인했다. [현재 실행 결과](../artifacts/demo-ui-20261106/recording/result.json)의 analysisCompletion20261106을 따른다. 새로운 통화/유료 연결은 추가 승인 없이는 실행하지 않는다.

## 2026-11-06 분석 완료 표시 준비 (실행 승인 대기)

17:59 KST 읽기 전용 확인: API readiness 3개 200, 감시 fresh/stop 없음, 소유 관측 약4.73GiB, 제공자 `none`, 기존 만료11월7일08:37 유지. case32 `ea423456`와 frontend 제품 `db32c555`의 diff는 문서/화면 증거뿐이며 제품 파일 변경은 없다. 연속 전사 coalescing 수정 `547290b`·`7c5a839`는 실행 runtime `e267dbf`에 포함된다. 과거 분석 실패와 case31/ERR_NETWORK_CHANGED의 근본 원인은 계속 미확정이다.

이번에는 완료된 분석 뒤 다른 segment의 partial이 같은 확정 문맥의 목적 결과를 `undetermined/partial`로 지우는 결함을 오프라인에서 재현했다. 확정 문맥이 그대로인 partial은 분석 이벤트를 덮지 않으며 전사 이벤트는 계속 보낸다. 새 final/정정/만료/철회는 기존대로 무효화한다. 신규 회귀 수정 전 FAIL·수정 후 PASS. 관련 분석/provider/controller/전사/파일송출 단위51건 및 API/light 타입·소스 검사 통과. 실제 runtime 반영과 유료 재검증은 아직 하지 않았다.

유료 observer는 `rules+llm/analyzed` 이벤트와 수신자 제품의 완료 문구·결과 패널을 모두 요구한다. 파일 종료를 기다리다 20초 제공자 한도가 먼저 닫히는 일을 피하도록 완료 표시를 먼저 관측하고 즉시 철회/마이크 복귀한다. 원본 합성 WAV의 streaming 길이 헤더는 보존하고 실제 PCM15.3초와 동일한 데이터의 정상 길이 사본을 보호 경로에 준비했다. TTS/외부 호출0. 이 변경은 모델 품질이나 실제 완료 표시 PASS가 아니다.

## 2026-11-06 Recording 적용과 동일 기한 재개

Recording 원본을 직접 렌더링하고 업무 표·상태 검색·흰 상세 drawer·휴대폰 구성, 순차 연락 준비를 실제 API/controller에 반영했다. 독립 역할·마이크·분석 동의 경계는 유지한다. 혼합 label 때문에 안전 중단까지 막히던 경로는 latch/stop에서 개별 소유권이 확인된 persistent 자원만 처리하도록 수정했다. start/status는 계속 전체 불일치를 거절한다. trial project 분리·full ID 정리·persistent+trial+host 합산 예산을 실제 launcher/guard에 적용했다.

새 감시와 기존21개 서비스의 재개, 공개 실제 역할 로그인·조회·Recording 화면을 확인했다. case31은 업무 생성 전 브라우저 진입에서 실패해 통화 시작0건으로 보존했고 재시도하지 않았다. 실패 전 대기 Promise가 종료 오류로 원인을 가리는 진단 누락을 보완했다. 별도 GET-only 동일 컨테이너 진단은200/인증 화면이지만 최초 원인은 미확정이다. read-only DB 감사는 활성통화·예약·기한 지난 pending/claim0, outbox done192·영수증13이었다. 사용자의 별도 추가1회 승인 case32는 새 업무·간소화 준비·실제 양방향 합성 음원·TURN relay·화면 이동·기관 UI 취소·양측 음성 회수·PBX 부재·취소 후 재발신409를 통과했다. 최종 감사는 활성통화/예약/overdue pending/만료claim0·done200·영수증14이며 trial은 정리했다. 유료 제공자 OFF, 기존 만료 유지. [화면·실행 경계](../artifacts/demo-ui-20261106/recording/result.json).

## 2026-11-06 조회 대기 중 분석 철회

일반 UI action의 busy/pending이 철회 버튼까지 막고, controller가 동의 응답 전에 analysisWanted를 켜는 결함을 오프라인으로 재현했다. 철회는 일반 작업 대기와 분리해 즉시 로컬 녹음/전송을 정리한다. 동의 쓰기는 controller 내 순서대로 보내고, 실패 또는 이전 generation 응답은 분석을 켜거나 최신 상태를 덮지 않는다. 반복 철회 클릭은 같은 controller의 진행 요청을 공유한다. 신규 회귀3건은 수정 전 실패·수정 후 통과, 기존 controller 포함8건 통과. 실제 provider·브라우저 회귀는 서비스 중단 및 비용 승인 대기로 미실행이며, 서버 저장소의 응답 유실 처리 전체를 이번 단위 시험으로 입증하지 않는다.

## 2026-11-06 Recording 후속 시험의 소유권 충돌

case30의 trial browser를 persistent Compose project에 잘못 넣어 감시와 중지 controller가 소유권 불일치를 거절했다. 실제 업무 생성 후 시험이 중단됐으며 통화 성공은 미확인이다. 시험 container는 정확한 ID로 제거했고 후속 resource-stop으로 persistent21개를 중지했다. 데이터·중단 증거는 보존한다. 로컬 launcher의 project를 분리하고 trial 메모리를 전체16GiB 관측에 합산하도록 준비했으나 재실행하지 않았다. 감시는 controller의 안전한 오류 코드만 보존하도록 수정했으며 관련 단위6건 통과. 재개·유료 실행·최신 Recording 디자인 반영은 완료하지 않았다. [증거](../artifacts/demo-ui-20261106/recording-trial-30.json).

## 2026-11-06 문서 통합과 역할별 UI

문서 `09af92b`·`f0f4e4a`를 최신 실행 기록과 병합했다. 별도 문서 worktree에서 R2 관리 조회 실패/늦은 응답, R3 미조회와 실패의 거짓 빈 목록, R4 callback 실패 Promise 잔류를 수정했다. 업무 관리·연락 검증·공동 관리의 실제 API 연결과 역할 제한을 재사용하며 controller·미디어·분석 내부 구현과 지속 운영 설정은 변경하지 않았다.

변경 검사와 실행 근거·캡처는 [UI 검증 기록](../artifacts/demo-ui-20261106/result.json), 현재 판정은 [현황표](guide/05-IMPLEMENTATION-STATUS.md)를 따른다. 아래 읽기 전용 감사의 R2~R4는 당시 발견 기록이며 이 후속 수정으로 처리했다. 공개 통화 성공 범위는 다른 개발 세션의 기록과 구분한다.

## 2026-11-06 실제 공개 경로 통화와 병렬 보완

`20cbd65` frontend·기존 `0a62aef` runtime에서 승인·소비·lease와 양방향 서로 다른 합성 음원 디코딩, 페이지 이동 유지, 정상 종료·양측 음성 중단을 확인했다. 원래 시험은 종료 후 정리 코드가 이미 ended인 통화를 failed로 바꾸려 해 FAIL이었으며 그대로 보존했다. 같은 통화의 후속 읽기 조회는 ended/user-ended·소비 영수증·PBX 부재 및 ARI channel/bridge0을 확인했다. 검사 기준은 낮추지 않았고, Chromium 권고대로 합성 WAV의 capture processing만 시험 경계에서 끈 결과다. 독립 외부 단말·사람 마이크·실제 STT/LLM 성공은 아니다. 상세는 [기동 증거](../artifacts/persistent-idp-start-20261105.json)의 normalPublicCall20261106을 따른다.

서로 다른 파일 소유 범위로 공동 복구 요청/공개 서명 검토 화면, 유한 AI 승인 ID quota, 기존21개 자원의 guard 적용 start/restart를 병렬 보완했다. 실제 통화 캡처에서 확인한 긴 URI·제어 위치·중복 안내도 줄였다. 새 UI·녹음 파일 송출·실제 재시작은 아직 후속 실행 대상이며 AI는 기존 한도 소진으로 추가 승인 전까지 비활성이다. 현재 DB 순간 읽기 조회에서 overdue outbox·만료 claim·미정산 예약은0이지만 과거 pending1건의 원인은 원본 부족으로 계속 미확정이다.

## 2026-11-06 공개 통화 협상 진단

공개 SIP 등록·INVITE 이후 5초 ICE 완료 대기가 종료 원인이었다. 사용 불가 interface 오류와 relay 후보를 분리 관측하고, 완료 필수 조건을 유지한 15초 대기로 양측 ICE 완료·ACK를 확인했다. 관련 단위6건·타입 검사 통과, `b59fd16` Production/CI 확인. 이후 수락 뒤 `verification-unavailable`로 종료되어 최초 수신자 실패를 추가 진단 중이며, 상대 측 `PBX_BINDING_CONTEXT_INVALID`는 원인으로 확정하지 않는다. 후속 첫 오류 진단에서는 한쪽 relay 미획득·15초 ICE_TIMEOUT도 남았다. 이번 논리적 시도6건은 모두 미완료/실패로 보존했고 자동 재시도는 없다. 내부 서버 브라우저가 검증한 공개 DNS 경로를 사용했으며 독립 외부 네트워크·음성 디코딩·실제 AI 성공은 아니다. [기동 증거](../artifacts/persistent-idp-start-20261105.json)의 publicMediaInvestigation20261106을 따른다. 지속 서비스·영속 자료는 유지하고 종료된 임시 브라우저 helper10개만 full ID로 정리했다.

## 2026-11-06 공개 로그인과 제품 API 연결

Production source `80a6df1`에서 실제 Keycloak PKCE callback·cookie·CSRF·역할별 업무 조회·로그아웃을 브라우저로 확인했다. 실제 업무 생성·재조회·배정 확인과 상담원의 생성403은 공개 HTTPS API로 검증했다. 새 제품 DB의 migration11개와 비특권 LOGIN4개, 별도 TLS Anchor·복구 gate를 기존 도구로 준비했다. 상세는 [기동 증거](../artifacts/persistent-idp-start-20261105.json)의 publicProductConnection20261106을 따른다. 통화·유료 AI·회수·복구는 이 결과에 포함하지 않는다.

## 2026-11-06 명시적 재가동

사용자의 재가동 요청으로 기존 중단·review·DB·realm·키·genesis를 보존한 채 재개했다. 이미지의 과거 시험 label을 지속 컨테이너에서 제거하고 각 후속 중단마다 별도 SHA 연결 review를 요구한다. 관련 회귀2건 통과. 60초 자원 사전 관측 뒤 기존 IdP·ingress·Besu4·Witness4를 기동해 readiness/공개 discovery200·노드 head157을 확인했다. 제품 API·Vercel 로그인·통화는 아직 미완료다. [실제 기동 결과](../artifacts/persistent-idp-start-20261105.json)의 explicitRestart20261106을 따른다.

## 2026-11-05 초기화 종료와 감시 관측 경계

초기화 프로세스 종료와 `/proc`/cgroup 조회가 겹칠 때 같은 full container ID의 종료를 Docker에서 재확인하도록 보완했다. 실행 중 관측 누락·OOM·identity/강제 한도 변경·권한 오류는 계속 중단한다. 관련 단위4건과 이미 종료된 소유 IdP 컨테이너2개의 읽기 전용 조회를 통과했다. 새 서비스 기동·중단 latch 해제·제공자 호출은 하지 않았다.

## 2026-11-05 서버 전용 loopback 준비

API/Witness의 명시적 `LISTEN_HOST=127.0.0.1`과 Besu peer 준비의 `--host-loopback`을 추가했다. 기존 container 기본 listen·private-prefix 검사는 유지하며 노드별30311~30314를 구분한다. 관련 무기동 단위28건과 API/Witness/light 타입 검사를 통과했다. 실제 bind·기동·공개 연결 검증은 아니며, 기존4201~4204 listener를 변경하지 않았다. IdP 관측 중단의 원본 latch/DB를 보존한 재개 승인과 공개 frontend/WS 배치 결정은 대기 중이다.

## 2026-11-05 지속 IdP 첫 기동과 관측 결함

loopback 전용 host-mode overlay와 기존 소유권 제어를 사용해 별도 영속 IdP DB를 기동했다. DB healthy, NEW import exit0이며 공개 로그인은 미실행이다. healthcheck 없는 컨테이너의 Docker template 조회가 실패하면서 monitor와 자동 중지도 실패했다. 조회식을 수정해 실제 health=null/소유권/중지 동작을 확인했고 두 소유 컨테이너는 exited다. 원본 최초 오류·영속 DB·latch는 보존했으며 자동 재기동하지 않았다. [결과](../artifacts/persistent-idp-start-20261105.json). 수정한 감시/소유권/IdP 단위5건 통과. 이미지 config가 보고하는 실제 Keycloak 버전은26.8.1이며 보호 실행 설정은 config ID에 고정한다.

## 2026-11-05 실제 IdP 이미지 준비 완료

검증된 OCI blob을 Docker archive로 스트리밍 변환하고 각 압축 해제 layer hash를 이미지 config의 diff_id와 대조했다. 추가 다운로드 없이 `callsign-keycloak-received:26.6.4` 로드와 amd64/config ID 일치를 확인했다. 최초 OCI archive 직접 로드 실패는 보존했다. 이미지 로드는 기동·realm import·공개 로그인 성공이 아니다.

## 2026-11-05 Vercel 프록시 연결 진단

기존 프로젝트의 전용 Preview에서 동일 Funnel 진단 서버로 HTTPS는200·JSON, WSS는404였다. Funnel 직접 WSS는 성공했다. [관측](../artifacts/vercel-ingress-transport-20261105.json). 이 rewrite 구성의 결과이며 모든 Vercel WebSocket 기능의 불가능을 주장하지 않는다. 제품 계정/음성 시험이 아니다. 소유 Preview2개 삭제·임시 automation 자격 폐기·확인 서버/ingress 정상 종료를 확인했다. Vercel 진입 후 같은 origin의 전용 서비스 주소로 이동하는 방안과 Vercel 주소를 유지하는 별도 인증 연결 중 사용자 선택을 요청했다.

## 2026-11-05 녹음 송신 경계 재확인

기존 파일 전환 실패는 측정기 FFT 평활화가 이전 마이크 peak를 남긴 시험 결함이었다. 파일 stream RMS와 sender track 일치를 확인한 뒤 평활화만 끄자 실제 두 RTCPeerConnection 사이에서 마이크445.31Hz→파일878.91Hz→음소거RMS0→마이크445.31Hz가 확인됐다. [결과](../artifacts/recording-switch-20261105.json). 공개 PBX/TURN·인증·실제 제공자 경로로 확대하지 않는다. 파일 자연 종료 시 재생/context/track을 정리하도록 보완했고 단위 회귀를 통과했다.

## 2026-11-05 지속 운영 조건 승인

사용자가 최초 기동 가용32GiB·실행 여유16GiB·소유 전체 관측16GiB 상한, 기존 구성요소 강제 한도와 PSI/swap-out/OOM 중단 유지, 자원 중단 후 자동 재시작 금지, 정상 기동 확인부터24시간 유지를 승인했다. 기존 전체 시험40GiB guard는 그대로 둔다. 이는 운영 조건 승인이고 지속 서비스가 이미 기동됐다는 뜻은 아니다.

## 2026-11-05 공개 ingress 활성화 확인

사용자 계정에서 전용 노드 등록, 해당 노드의 Funnel 권한, HTTPS 인증서 발급을 승인했다. 보존 identity `callsign-demo-l-fixed.tail37b235.ts.net`으로 실제 공개 HTTPS와 WSS 왕복을 확인했다. 증거는 작업 보호 경로 `ingress-public-cert-20261105T2155/result.json`이며 제품 인증·API·PBX/TURN 검증은 아니다. 확인용 서버와 소유 ingress 프로세스는 정상 종료했고 등록 state는 보존했다. 기존 daemon·443 서비스·호스트 네트워크 설정은 변경하지 않았다. 인증서 최초 발급 대기 없이 요청했던 TLS timeout은 별도 실패로 보존했다.

Keycloak 공식 linux/amd64 이미지의 manifest와 모든 blob 검증을 완료했다(누적 다운로드 425,908,101 bytes, 승인 상한 500MiB). 이미지 기동과 공개 로그인은 아직 미실행이다. 실제 공개 origin을 사용한 보호 OIDC 입력은 한 번 생성해 보존했으며 계정이 이미 운영 중이라는 뜻은 아니다. 지속 backend는 미기동이며 HTTPS/WSS 성공을 TURN relay·외부 음성·실제 분석 성공으로 확대하지 않는다.

## 2026-11-05 단계별 메모리 실측

현재 실행 장소는 개발 서버의 전용 지속 환경으로 결정했고 AWS 이전은 후속이다. 이번 실측은 임시 환경이며 지속 환경으로 전환하지 않았다. [실측 원본 요약](../artifacts/staged-memory-20261105.json): 첫 시도는 중복 상태 문구의 observer strict locator 실패, 수신 상태 영역으로 수정 후 같은 원래 deadline에서 정상2·취소1·정지/공동복구1 통과(실행5, 성공4, 실패1). 소유 cgroup+host 5초 표본 최대4.557GiB, 호스트 가용 최소30.558GiB, 자원 중단 없음. Keycloak·공개 ingress·유료 AI·장시간 사용은 미포함이며 서비스 최소 RAM으로 확대하지 않는다. 최종 DB 감사는 overdue pending1건으로 FAIL; 미종료 통화0·미정산 예약0·소비 영수증4는 확인했다. 전체 PASS로 기록하지 않으며 원인 미확정 pending을 수동 삭제하지 않았다. 두 환경 소유 컨테이너/volume 정리 및 기존 interface/route/network/컨테이너 보존 비교 통과.

사용자는 이번 새 소유 batch 1회에 한해 시작40GiB 대신 `--start-policy staged-memory-v1`을 승인했다. 가용16GiB·소유 전체24GiB·host1GiB·기존 PSI/swap-out/OOM 중단·90분/마지막10분 정리는 유지한다. 기본40GiB 정책과 과거 중단 기록은 변경하지 않는다. 동일 runtime과 기존 실제 통화 runner로 측정하며 실제 Keycloak/공개 ingress/외부 제공자는 포함되지 않는다. 기동·통화별 관측과 미포함 구성요소를 구분해 결과를 여기에 연결한다.

## 2026-11-05 첨부 디자인의 실제 이식

| 요구사항 | 구현·실행 근거 | 다음 행동·차단 |
|---|---|---|
| 디자인 HTML 이식 | 제공 HTML 직접 렌더·비교, 실제 제품 컴포넌트와 핸드폰 배치, desktop/390px/CSS2배·drawer focus 확인 | 공개 배포 후 metadata·경로·마이크 정책 확인; 인증 화면과 component fixture 구분 |
| 분석 오경고 조사 | 부정·인용 근거 수용과 인용 속 문장 분리/정정 결함 재현·수정·회귀 | 실제 목적 관계 label 불일치 미해결, 기존 실패 보존 |
| 실제 제공자 | 설치된 오프라인 ko 합성 음원·직접 Deepgram 전사, 제한된 OpenAI 후속 요청 | 실제 통화 remote-track 경로와 품질 평가는 별도 |
| 공개 인증·지속 환경 | 동일 ingress identity 재개·등록 페이지 로그인 요구 확인 | 등록 대행 권한과 계정 인증 수단은 다름; Keycloak 다운로드 중단 재개 대기 |
| 최신 이미지·실제 데모 통화 | 새 clean 이미지 제작·221개 입력 대조; 전체 batch 첫 표본35.23GiB에서 자원 생성 전 차단 | 계획4통화 모두 미실행. 자동 재시작 없음; 공개 인증/미디어와 별도 차단 |

기준 증거는 [후보 기록](../artifacts/product-candidate-20261104.json)의 designHtmlIntegration이다. 원본 HTML/PDF와 사용자 미추적 자료는 일괄 커밋하지 않는다. 뒤의 기록은 당시 결과로 보존한다.

## 2026-11-05 공개 데모 연결 후속

| 항목 | 상태·근거 | 다음 행동·차단 |
|---|---|---|
| 축약 공개 화면 | Production 실제 desktop/390px/CSS2배 캡처 직접 검토·focus/탐색 PASS | 인증·WebRTC 화면은 별도 미실행 |
| OpenAI | 실제 텍스트3요청·재시도0, 계약 통과·품질 제한 | 정상 문장 경고/목적 이탈 판단 불가를 보존; 음성 전체 경로 미실행 |
| Deepgram | 키 인증200·음성 전송0초 | 동의한30초 이하 보호 음원 경로 대기 |
| 전용 ingress | 새 userspace 노드 등록 대기·정상 종료·상태 보존 | 보호 등록 링크의 사용자 승인; Funnel 정책 변경은 미허용 |
| 실제 OIDC | 보호 NEW 입력·선택 overlay·정상 restart와 import 분리, 무기동 검사 PASS | 공식 이미지 다운로드 RSS 중단; 같은 누적500MiB 재개 승인 대기 |
| 지속 backend | NOT_STARTED, 실제 공개 로그인/통화0 | 공개 연결·실제 IdP 및 기존40GiB/압박 조건 필요 |

기준은 [후보 기록](../artifacts/product-candidate-20261104.json)의 persistentDemoConnection이다. 이전 실패·RESTORE PASS·fixture 결과를 이번 실행으로 합산하지 않는다. 소켓 길이·기본 로그 경로 격리를 수정했고 새로 생성한 소유 로그 설정만 확인해 제거했다. 원래부터 있던 파일/서비스를 변경했다는 근거는 없지만 이후 baseline으로 과거 전체 보존을 소급 증명하지 않는다.

## 2026-11-05 지속 서비스 요청과 제공자 연결

일회성 통합과 별개인 지속 서비스 요청을 인계했다. 기존 Vercel main 배포/공개 metadata는 정상이나 API 미연결이다. 기존443의 다른 프로젝트 소유·공개 HTTPS/WSS/UDP 경로·OIDC·지속 감시 범위 미확정과40GiB 시작 guard 미달로 지속 backend는 생성하지 않았다. host 설정/기존 자원은 변경하지 않았다. 실제 연결표·운영 명령·NEW/상태 이전 구분은 RUNBOOK의 지속 서비스 절차를 따른다.

persistent label/검사한 full ID 중지·status·resource-stop latch를 기존 도구에 추가하고 시험 cleanup은 해당 자원을 거절하도록 회귀했다. 새 공개 UI-only는 데스크톱/390px·CSS2배·focus/오류/overflow를 실제 검토했다. API/계정/통화는 연결하지 않았다. [현재 후보 기록](../artifacts/product-candidate-20261104.json)의 persistentServicePreparation을 기준으로 본다.

명시된 OpenAI·Deepgram 보호 파일은0600/상위0700과 서버 로딩을 확인했다. 기존 `/service` orchestration에 OpenAI Responses JSON/근거 검사와 Deepgram/ko 파일 설정을 연결했다. 첫6요청/60초/$0.10 계획은 승인됐으나 동의한 입력은 별도 제공 예정으로 외부 호출은 보류했다. 자격 미제공과 실제 미실행을 구분하고, 이전 이미지의 미디어 PASS를 새 provider 코드에 전용하지 않는다.


## 2026-11-05 서비스 종료·실제 복원 후속 검증

조회 요청 처리 중에도 통화 종료를 독립 실행하고 공식 조회 전/만료를 빈 목록과 구분했다. [실제 역할별 HTTP/Chromium·캡처](../artifacts/service-hardening-20261105/result.json)와 [후속 전체 복원·미디어 결과](../artifacts/restore-audit-20261105.json)의 serviceHardeningFollowup을 기준으로 본다. 일반 entrypoint의 암호화 전체 RESTORE·복원 후 통화·원본/대상 감사와 별도 명시적 합성 STT/LLM3통화는 PASS다. 도구의 GNU loader/라이브러리·사용자 권한·GNU tar·실제 validator RPC 결함을 수정하고 실패 원본을 보존했다.

첫 분석의 JSON/프로세스 불일치와 목적 이탈 배지 실패는 원인 미확정이다. 프로세스 exit·bounded WS/lease·실패 후 통화 정리를 보완했으며 이후 성공으로 소급 해결 처리하지 않는다. 후속 공개 브라우저는 잘못 선택한 host1GiB 범위에서 자원 중단했고 새 기동 없이 정리했다. latest 공개 main HTTP/desktop 부분 확인과 기존 실제390px 확인을 구분한다. 새 후보를 비공개 GHCR·고유 사전 Release로 게시하고 실제 원격 이미지/공개5파일을 새 저장 경로로 수령했다([후보 대응](../artifacts/product-candidate-20261104.json)의 serviceHardeningFollowup). 새 후보와 과거 이미지/Release는 별도 기록하며, 독립 reader·실제 AI·AWS 조건은 미확인이다.

아래 날짜별 실패·미실행은 당시 기록이며 위 후속 결과로 덮어쓰지 않는다.


## 2026-11-05 Vercel 공개 frontend 재배포

보호 인증 참조로 기존 프로젝트의 오래된 Git repository ID를 현재 저장소 ID로 다시 연결하고 Production branch `main`을 유지했다. Vite/Node22·저장소 루트 build·`apps/web/dist` 설정으로 정확한 소스의 Preview와 Production build가 READY다. 공개 `/service`·`/official`·`/demo`·정적 자원과 JSON build metadata의 소스 일치를 HTTP로 확인했다. [배포 근거](../artifacts/product-candidate-20261104.json)의 `vercelRedeployment`를 기준으로 보며 이전 인증 차단 기록은 당시 결과로 보존한다. 이번에는 브라우저 상호작용·실제 API/통화를 재실행하지 않았다. 공개 frontend의 API 미연결 제한과 기존 runtime은 유지한다.

남은 원격 작업 브랜치4개는 모두 main의 조상이며 고유 커밋0개다. 기능/검증/Preview 이력으로 보존했고 삭제하지 않았다. 신규 작업은 기존 지침대로 main commit/push를 사용한다.

## 2026-11-05 DB 감사·반복·전체 복원 시도

전달 archive 재검토에서 RUNBOOK의 이전 TAG, LOCAL-VALIDATION 및 새 평가 CLI의 포함 누락을 발견했다. allowlist/명령을 수정하고 후속 `aws-recovery-tools-20261104t154909z`의 source를 고정해 새 파일로 봉인한다. 이전 Release/원본 영수증은 변경하지 않는다. 새 source의 발행 전 상태와 발행 후 원격 영수증을 구분한다.

최신 운영 observer는 `aws-recovery-tools-20261104t153749z`로 새 공개5파일을 원격 수령했다. 같은 비공개 runtime/인프라 manifest를 유지했고 이미지 재build/재게시/재수령은 하지 않았다. [전달 대응](../artifacts/product-candidate-20261104.json)의 `recoveryTools`와 실제 실행 소스/단계를 구분한다. 전체 RESTORE 검증 완료판이 아니다.

[이번 실행과 여섯 항목 판정](../artifacts/restore-audit-20261105.json)을 기준으로 본다. 정상 반복은 사전 계획5/실행5/성공5/재시도0이고, 별도 취소 사례를 같은 DB에서 실행했다. 원본 DB의 시작·quiesced·앱/worker 종료 후 삭제 전 최종 감사가 PASS다. 세션30개·소비 영수증6개 등 정상 보존 데이터를 지우지 않았으며 pending/processing outbox·미정산 예약/잔액은0이었다. 규칙/합성 제공자의 실제 WS 시작·종료 관측은 모델 품질과 구분한다.

전체 RESTORE는 **미완료**다. 최초에는 Node 복사가 심볼릭 링크로 남아 도구 mount가 거절됐다(원본 drain/백업 이전의 시험 도구 결함). 실제 역할 env/보존 입력을 백업하도록 정정하고 `docker cp -L`/일반 파일 검사를 추가했다. 같은90분 deadline 안의 최소 복원 상태 재준비는 swap-out21.29→72.19→19.32MiB/s의3구간 연속 기준으로 중단했고 자동 재기동하지 않았다. 수정한 복원 도구는 타입/오프라인 검사만 확인했으며 실제 복원 성공으로 기록하지 않는다.

두 환경 모두 소유 컨테이너21개·volume2개와 보호 trial 경로를 정리했다. 두 번째 baseline의 기존 container/network ID는 보존됐지만 interface/route 차이는 원인 미확정이다. 원본 비교와 최초 중단 신호를 보존했고 host 설정 변경 명령은 실행하지 않았다. 이를 전체 설정 일치 PASS로 바꾸지 않는다.

별도 reader·실제 AI 자격/입력/비용은 아직 없다. Vercel은 위 후속 재배포 결과로 갱신됐다. AI 평가 도구의 숫자 예산 선검사와 dry-run을 보완했고 실제 호출0이다. 이는 제공자 청구 상한 보장이 아니며 실제 모델 가격/지출 제한 확인이 필요하다. AWS 실행은 사용자 후속 지시에 따라 제외했다. 제품 서비스 입력은 바뀌지 않아 runtime을 재제작하지 않으며 새 observer/운영 도구와 기존 이미지의 차이를 전달 기록에 명시한다.


## 2026-11-04 후속 승인 batch: 최신 이미지 선택 경로 통과

후속 `aws-media-candidate-20261104t142900z`의 공개5파일을 새 저장 경로로 원격 수령하고 checksum을 대조했다. [전달 기록의 followup](../artifacts/product-candidate-20261104.json)은 runtime 불변 digest 재사용과 새 공개/observer source를 연결한다. 기존 Release는 변경하지 않았다.

새 사용자 승인에 따른 별도 batch에서 같은59b4379 runtime/37edf8e observer의 정상 반복2회(그중1회는 실제 업무 조회 장애 중 종료)·work-cancel·emergency-stop 각1회가 통과했다. [이번4개 고유 사례·단일 시계 측정·정리](../artifacts/media-final-20261104.json)를 기준으로 보고 이전 정상 smoke2회나 실패를 이번 분모에 합산하지 않는다. 새 이미지 재제작·GHCR 재게시·이미지 재다운로드 없이 기존 불변 manifest를 재사용했다.

[조회 장애 수정 화면](../artifacts/media-resume-20261104/workspace-outage-fixed.png)을 직접 열어 연락 당시 기관/목적·최신 조회 미확인·한국어 장애 안내·진행 통화 종료가 유지됨을 확인했다. [실제390px 경고](../artifacts/media-resume-20261104/final-recipient-mobile.png)도 검토했다. 정상 반복의 계획 분모2/실행2/성공2/재시도0이며 소표본/SLA 미평가다. 실제 원장·Witness·Anchor·PBX/TURN·remote track/인증 WS를 사용했고 OIDC·음원·STT/LLM fixture 범위를 유지했다. 동의 철회·늦은 결과·양측 음성 중단·ARI 부재·추가 lease 거절·통화별 SQL 예약0·공동 복구와 과거 승인/위임/통화 비활성 유지를 확인했다. 단독 복구400은 여전히 HTTP schema 경계다.

이전 분석 중단/PBX 종료의 원인은 미확정이며 이번 미재현을 수정 증거로 쓰지 않는다. DB/체인/Anchor를 보존한 앱/controller 단계 재시작은 수행했으나 전체 RESTORE는 미실행이다. 통화별 SQL 검사는 통과했지만 별도 최종 전체 DB 감사는 정리 완료 후 연결을 시도해 관측하지 못했다. 이를 PASS로 처리하지 않는다. baseline/full ID·소유 cgroup 관측과 앱 우선 정리·잔류0/보호 trial 경로 제거를 확인했다. Vercel 인증·독립 reader·실제 AWS/외부 AI 입력은 남는다.

## 2026-11-04 동일 deadline의 통화 검증과 실제 화면 결함 수정

새 부분 검증 사전 Release의 비공개 runtime·공개5파일 원격 수령을 완료했다. [최종 전달 근거](../artifacts/product-candidate-20261104.json)에 소스/manifest/observer/checksum을 연결했다. 이 전달 성공은 아래 미해결 통화·Vercel·복구 범위를 완료로 바꾸지 않는다.

[실행별 근거와 현재 미확인 범위](../artifacts/media-resume-20261104.json)를 기준으로 본다. 이전 swap-out 중단은 host-wide 관측이며 원인을 이번 작업으로 귀속하지 않는다. 이번 launcher는 baseline을 trial root 밖에 선보존하고 full Docker ID·소유 cgroup swap/pressure/events를 기록한다. 의도된 앱 archive 종료와 실제 기반 서비스 종료를 구분하며, 후속 수정은 종료 상태·소유 로그를 정리 전에 보존한다. 이 마지막 로그 보완은 오프라인 검증만 수행했고 과거에 없던 로그를 복원하지 않는다.

| 항목 | 실제 결과 | 남은 조건 |
|---|---|---|
| 기존9d6f9dd runtime | 정상 smoke2회, 선택 반복·조회 실패 중 실제 종료, work-cancel/emergency-stop·양측 음성 회수·ARI 부재·lease 거절·예약 정리 및 실제 공동 복구 확인 | 반복 제어 도구의 두 실패도 원본 보존. 단독 복구400은 HTTP schema 거절이며 이번 EVM 단독 거절 증거 아님 |
| 실제 화면 수정59b4379 | 업무 조회 장애에도 연결 당시 기관·목적을 ‘최신 조회 미확인’으로 유지. 관리/신규 발신은 비활성 유지, 원문 네트워크 오류 대신 한국어 안내. SSR·타입 회귀 통과 | 새 이미지에서 조회 장애 상호작용은 미실행 |
| 새 runtime c7455c2 | 일반 issuer health/auth challenge·실제 정상 통화2회·양방향 음성·remote track/WS·위험/목적 패널·동의 철회·정상 종료 통과 | 앞선 분석 중단1건 원인 미확정. 이후 PBX 예기치 않은 종료로 반복·취소·정지 단계 BLOCKED, 자동 재기동 없음 |
| 정리·보존 | 각 실행 소유 컨테이너/volume 정리, baseline 비교 확인. 실제1366px/390px 캡처를 열어 검토 | 전체 DB 세션/outbox 잔류 감사·최신 RESTORE 미실행. 소표본은 SLA 아님 |
| 외부 단계 | 기존 Release 보존, 새 후보를 부분 검증 사전 후보로 구분 | Vercel 연결 인증·독립 GHCR reader·외부 AI 비용/입력·AWS 결정 필요 |

[데스크톱](../artifacts/media-resume-20261104/recipient-desktop.png)과 [390px](../artifacts/media-resume-20261104/recipient-mobile.png)는 새 runtime의 실제 ServiceCall이며 합성 계정·음원·분석 제공자를 사용했다. 기관 승인/현재 연결/위험·목적 안내와 통화 종료를 각각 확인했다. 합성 제공자 결과는 실제 모델 정확도가 아니다. 이전 또는 수정 전 이미지의 취소/정지 PASS를 새 이미지의 PASS로 옮기지 않는다.


## 2026-11-04 최신 이미지 실제 준비·일반 기동 후 자원 중단

[후속 실행 원본](../artifacts/candidate-media-followup-20261104.json)은 기존 후보와 같은 runtime/observer이며 제품 변경·재build·새 Release는 없다. 시작 가용40.20GiB를 확인하고 실제 Besu4·계약 배포·Witness4·migration0000~0010·역할 LOGIN·별도 TLS Anchor·PBX/TURN과 제품 API 준비를 수행했다. **일반 issuer 명령은 fixture mount 없이 health200/auth401**을 확인했다. 이는 전체 readiness/통화 PASS가 아니다. 전달 runtime/nginx만으로 새 합성 identity의 웹을 build했으나 실제 화면을 여는 통화 사례 완료 전에 중단됐다.

swap-out이5초 구간11.11→66.99→18.93MiB/s로3회 연속 기준을 넘어 `SUSTAINED_SWAP_OUT`으로 중단했다.25개 표본의 가용 최소37.58GiB·host 최대0.096GiB·전체 최대3.90GiB는 관측 극값이며 peak/최소 사양이 아니다. host-wide swap의 원인은 미확정이고 OOM 증가는 없었다. bootstrap 준비 완료와 통화 성공을 합산하지 않는다. work-cancel은 준비 중 BLOCKED, emergency-stop·정상 smoke2회·재시작/복원은 NOT_RUN이며 새 제품 사례 완료0이다. 자원 중단 후 자동 재기동하지 않았다.

소유 컨테이너21개·volume2개는 앱/브라우저 우선 순서로 정리했고 보호 trial root도 제거했다. 원본 로그는 보호 로컬 경로, 공개 판정·최초3구간은 위 artifact에 보존했다. 정리 중 원래 호스트 baseline을 복사하지 못한 증거 한계가 있다. 기존 Docker ID의 short/full 비교 오류는 보존 PASS로 쓰지 않았고, interface 전체 snapshot 차이의 원인도 단정하지 않았다. route·Docker network ID 비교는 같았으며 host 설정 변경 명령은 실행하지 않았다. 후속 정리 절차에 baseline 선보존·ID 정규화를 명시했다.

| 남은 항목 | 현재 상태/근거 | 다음 행동·차단 조건 |
|---|---|---|
| 제품 UI·HTTP/WS | 기존 최신 UI 검증 재사용, 이후 제품 코드 차이 없음 | 새 실제 ServiceCall 화면은 아래 통화 범위에서 확인 |
| 일반 runtime 진입점 | startup/auth challenge 확인 | readiness·실제 통화로 확대하지 않음 |
| 통화·분석·회수·정상 반복·실패/복원 | 이번 자원 중단으로 BLOCKED/NOT_RUN | 안정된 별도 환경 또는 새 실행 승인 뒤 동일 정책. guard 완화/자동 재개 없음 |
| Vercel | token 보호 참조 없음, 원격 설정/새 버전 미확인 | 기존 프로젝트 인증 참조 또는 대시보드의 정확한 Git SHA 배포 |
| GitHub 전달·AWS 입력 | 기존 사전 Release/비공개 digest 수령 근거 유지 | AWS reader·실제 배포 입력 필요. 원격 전달을 전체 통화 PASS로 확대하지 않음 |


## 2026-11-04 AWS 이전 전 후보 정합성

새 사전 Release의 공개5개 파일을 별도 디렉터리에 다시 내려받아 checksum과 GHCR6종 실제 digest를 대조했다. 이미지 원격 수신은952,751,386bytes이며 기존 Docker cache를 사용하지 않았다. runtime source9d6f9dd·공개/observer source76e5590의 제품 입력26파일 hash가 같고 차이는 문서/증거다. 최종 기동·통화는 BLOCKED 상태로 게시했으며 기존 후보·Release는 변경하지 않았다. 게시 인증 임시 디렉터리는 제거하고 원본 보호 파일은 보존했다.

| 최종 기획의 행동/조건 | 현재 판정 | 근거와 남은 조건 |
|---|---|---|
| 기관 업무·할당·위임·취소·회수 조회 | 구현·범위 검증 완료 | 최신 제품 UI/실제 SQL·HTTP의 [검증 근거](../artifacts/service-redesign-20261104.json). 원장/PBX는 해당 UI 시험에서 fixture |
| 상담원·수신자의 승인·소비·lease·동의·오류 처리 | 구현·UI/WS 검증 완료, 최신 이미지 통화 미실행 | 제품 소스49a2cb9 이후 문서만 변경. 실제 음성 증거는 이전6e3cd23이며 새 이미지로 확대하지 않음 |
| 공동 변경·긴급 정지·복구 | 구현·선택 범위 검증 완료 | 최신 HTTP/화면과 이전 실제 원장 증거를 구분. 단독 복구 HTTP400은 EVM 거절 증거가 아님 |
| 최신 runtime·공개/observer·원격 전달 | 후보 제작·비공개 이미지 게시·공개 사전 Release/원격 수령 완료 | [후보 기록](../artifacts/submission-candidate-20261104.json). 통화40GiB guard 미달, 정상 smoke2회는 NOT_RUN |
| 최신 Vercel frontend | 배포 준비·BLOCKED | 프로젝트 ID/URL 확인, token 보호 참조 없음. API403·과거 SPA 반환. main push를 배포로 간주하지 않음 |
| AWS·외부 IdP·AI·독립 reader | 외부 입력 필요 | RUNBOOK 입력 계약. 계약 주소/genesis/trust pin은 NEW 산출물이며 사용자 선입력 아님 |

prepared runtime의 dependency lock과 인프라5종 recipe/config가 기존 검토본과 같음을 확인했다. 새 runtime에는 최신 화면·정산·migration26개 선택 파일의 일치 감사를 기록했다(전체 migration 개수가26이라는 뜻이 아니다). 라이브러리 공개 self-test 키 형태6개 hash 일치만 허용했고 원본 탐지를 보존했다. 새 사용자 데이터·보호 파일은 build context에 넣지 않았다. runtime/observer의 실제 기동·복구·호환성 성공을 정적 감사로 주장하지 않는다. 이번에는 필수 제품 결함이 새로 확인되지 않아 제품 로직을 추가하지 않았다.


## 2026-11-04 실제 업무 공간 재설계와 UI 확인

[화면 구성 결정](../DESIGN.md)에 따라 기관은 목록/선택 상세, 수신자는 통화/위험 안내, 공동 승인자는 변경 전후 검토를 중심으로 재구성했다. 인증·권한·서명·동의·미디어 생명주기는 유지했다. 공개 `/demo`는 `/service`로 연결하고 과거 발표 화면은 `/legacy/demo`에만 남긴다. API 미연결 공개 빌드는 로그인·통화를 비활성화하고 그 이유를 표시한다.

[이번 원본 결과와 역할별 캡처](../artifacts/service-redesign-20261104.json)가 기준이다. 고유 HTTP11·WS17·Chromium12는 재실행/viewport를 중복 합산하지 않은 결과이며 Chromium 중2개는 component host다. 실제 통화 상태의 합성 시각 검토를 ServiceCall·음성 검증으로 확대하지 않는다. 최종 선택 회귀 소스는49a2cb9이며 초기 실행 이후 UI 변경과 선택 재시험을 기록했다. 공식 세션 시험의 원인 미확정 네트워크 중단과 공개 preview 시험 설정 결함의 실패 원본은 보존했고 보안 조건·timeout은 완화하지 않았다. 소유 DB/보호 경로5세트는 모두 정리했으며 이번에는 같은 DB 간 재실행을 주장하지 않는다.

64파일321시험 light·웹 build를 확인했다. 이전42개 Markdown 감사는 보존하고 새 DESIGN.md만 추가 검토했다. 기존65d85ac runtime은 이 재설계를 포함하지 않는다. 새 runtime/웹/observer 제작과 실제 통화 회귀가 필요하며 이번에 이미지·Release를 만들지 않았다.

확인된 공개 주소는 `https://callsign-rouge.vercel.app`이나 실제 라우트는 과거 발표 화면이며 배포 SHA는 미확인이다. 기존 프로젝트 ID는 사용자가 제공했다. Preview 브랜치는 정상 push했지만 Vercel check가 queued이고 새 URL은 미확인이다. 프로젝트 ID만으로 인증할 수 없으며 Vercel token 보호 파일 참조가 없어 원격 프로젝트 설정 확인/게시가 막혀 있다. Git push·로컬 build를 Vercel 배포 성공으로 기록하지 않는다.


<a id="product-runtime-20261104"></a>

## 2026-11-04 최신 제품·후보 실제 연결 검증

제품 경로는 `/service`·`/official`을 유지했다. 사용자가 철회한 발표 전용 화면·장면·기록 재생은 추가하지 않았다. 실행 소스 `6e3cd238e95457406134e8ef37730fd6d251209a`의 clean tree로 runtime 후보를 만들었다. 실제 제품 분석 결과가 도착해도 상단이 계속 “분석 중”으로 남던 결함을 수정하고, 이전 문맥 결과가 새 상태를 덮지 않는 회귀를 추가했다. 브라우저 역할 heading/접힌 계정 식별자 선택자, 분석 입력 관측, NEW의 비활성 복구키 준비, 원장 이벤트 대기 경합은 시험·준비 도구 결함으로 구분했다.

최신 후보 `sha256:c39cbb13a1f0efde6a9ead66a4624f78cb998e7f8a6f7fb366df6b2c866a8dc7`(linux/amd64, **로컬 config ID**)에서 bootstrap 후 work-cancel·emergency-stop 각1회 PASS. 실제 제품 로그인·업무·위임·승인·binding·소비·lease, 양쪽 합성 음원 수신/디코딩, remote track→인증 WS→분석→ServiceCall 패널, 동의 철회, 양측 음성 중단·ARI 부재·추가 lease 거절·quota 정리를 확인했다. 단독 복구는 HTTP schema에서400(EVM 미도달), 서로 다른2명 공동 복구는 실제 계약/원장 반영 후 epoch3·승인키 세대2를 확인했다. 기존 통화 종료·승인 취소·위임 철회·소비 이력 보존을 확인했다. 일반 issuer entrypoint도 fixture mount 없이 health200/auth401을 확인했으나 이것만으로 전체 readiness를 주장하지 않는다.

HTTP11·WS17·Chromium9의37개 고유 사례를 확인했다. Chromium1개 분석 패널은 component host이며 전체 ServiceCall 증거와 분리한다. 최초 host1GiB 초과로6건 이후 중단한 실행, 승인된3GiB 재개 중 선택자8건 실패·교정 후 선택 재시험, 동일 DB 잔류 감사는 모두 보존했다. readiness·부분6건·재시험을37에 더하지 않는다. 이 HTTP 소스 이후 추가된 분석 상태 문구는 최종 후보의 실제 ServiceCall 시험과 단위 회귀로 확인했다.

첫 최종 후보 batch는 종료 순간 `/proc/PID/cgroup` 조회 실패로 BLOCKED였다. 종료/제거된 소유 준비 도구를 재조회하는 관측 경합을 최소 수정·오프라인6사례 확인한 뒤 사용자가 승인한 새 batch1회에서 위2건을 완료했다. 최초 실패는 보존했고 자원 중단을 성공으로 바꾸지 않았다. 최종 batch5초 표본41개: 가용 RAM 최소45.77GiB, host RSS 최대99.13MiB, container current 최대4.47GiB, 총 관측 최대4.54GiB. 표본 최대이지 peak·최소 사양·SLA가 아니다. 시작40GiB·여유16GiB·전체24GiB·전체 통화 host1GiB, 웹 build2GiB/CPU1/90초와 pressure/OOM/deadline 조건을 유지했다.

최종 `pnpm light`63파일316시험·웹 build·API runtime 타입 검사 PASS. 웹 chunk/dynamic import 경고는 남는다. [공개 증거](../artifacts/product-runtime-validation-20261104.json)에 원본 실패·소스/이미지·묶음 checksum·동일 DB 감사·정리 결과를 연결했다. 최종 batch 컨테이너21개·볼륨2개와 이번 실행의 보호 입력을 정리했다. 기존 자원·사용자 자료·과거 후보·고정 Release는 보존했다.

실제 구성요소는 Besu4·Witness4·PostgreSQL·HTTPS Anchor·API/worker·Asterisk·TURN·제품 웹/Chromium이다. OIDC와 STT/LLM은 명시적 fixture, 음원은 합성이다. 같은 namespace의 TURN과 같은 호스트는 외부 NAT·독립 기관 장애 내성의 증거가 아니다. AWS·실제 IdP·한국어 STT/LLM 품질·새 GHCR/Release 게시는 미실행이다. 새 공개/observer 묶음과 runtime은 같은6e3cd23 소스이며5종 인프라는 재사용했다. 최종 AWS 웹은 실제 AWS metadata/trust/PBX 인증서 뒤에 생성해야 한다. 이전 고정 Release는 이번 소스를 포함하지 않는다.

최신 main `2423e73`의 RUNBOOK/한계 문서를 포함한 추가 인계 묶음을 `.local/delivery-handoff-2423e73/delivery/`에 생성했다. 검증 runtime6e3cd23/c39cbb와 observer 내용은 그대로이며 main과의 차이는 문서·증거뿐이다.4개 파일 checksum·공개 tar 경계 검사를 통과했다. 이미지 재빌드/서비스 기동/원격 게시·수령은 하지 않았다. 기존 후보는 보존했으며 새 inventory는 로컬 config ID·최종 웹 미준비·NOT_SENT를 유지한다.

## 2026-11-04 제출 후보의 원격 전달과 문서 정리

새 지시의 명시적 발행 허가로 `aws-candidate-20261104t085935z`의6종 private GHCR 태그를 게시했다. runtime은 기존 검증 config ID, 인프라5종은 기존 이미지/manifest를 재사용했으며 실제 새 경로에 manifest/config/layer를 수령했다. [원본 증거](../artifacts/ghcr-candidate-20261104.json)는 writer 기반 pull-scope 수령과 미제공 AWS reader를 구별한다. 공개 사전 Release의 봉인·재수령은 후속 영수증으로 판정한다.

RUNBOOK은 AWS 수령/NEW/재개/복구 중심으로 줄이고 로컬 통화·HTTP/DB/EVM 절차를 LOCAL-VALIDATION으로 분리했다. 기존 앵커는 이동 링크로 유지하고 공개 배포 tar에 새 문서를 포함한다. MASTER의 과거 실행 수치/미구현 이력은 원문 링크로 대체해 요구/완료 조건과 구분했다. KNOWN-LIMITATIONS의 오래된 현재형·결과 중복을 정리했고 요구 ID·서명/권한·원본 증거·사용자 기획서는 보존했다. 서비스/브라우저/체인 재기동·이미지 재build·AWS/유료 제공자 호출은 하지 않았다.

## 2026-11-04 실제 업무 UI 후속과 시작 조건 차단

`feat/service-workspace-20261104`의 제품 UI는 현재 연락 요약·역할/다음 행동·독립 검증 상태·경고 우선·통화 중 종료 위치·업무 선택/기술 상세를 개선했다. 계정 관리만 접고 공동 승인 문맥·경고·승인/현재 연결은 유지했다. 승인 전 마이크/PBX 준비를 비활성화하며 기존 API 권한/세대/동의 검사는 그대로다. 기존 실제 캡처2개를 직접 열어 문제를 확인했으며 새 UI 캡처나 이해도 평가를 했다는 주장은 하지 않는다.

사용자가 같은 예산의 새 UI batch1회를 승인했으나 `START_40_GIB_REQUIRED`에서 계획·키·DB·컨테이너 생성 전에 차단됐다. 첫 표본의 수치는 보존하지 못했으며 **후속 읽기 전용 표본**은 available38.81GiB였다. guard/예산을 낮추거나 자동 재시도하지 않았다. 새 HTTP/WS/Chromium·통화·runtime 제작은 NOT_RUN이고 이전6e3cd23/c39cbb 결과를 복사하지 않는다. 정상 통화2회/재시도0의 기존 observer 경로를 준비했지만 실행한 결과는 없다.

추가 리뷰에서 업무 조회 실패 시 이전 목록/관리 동작 유지와 다른 업무 선택 시 이전 통화 요약 유지, 공식 업무 조회 실패 시 과거 목록/내부 오류 표시를 수정했다. 기존 진행 통화 종료는 조회 실패에도 사용할 수 있다. CI에서 종료 중 마지막 helper가 `/proc` 첫 표본에 누락되는 정리 경합1건을 발견해 빈 소유 목록을 재확인하도록 수정했다. 실패 CI 원본은 보존했고 결정적 경합 회귀와 기존11개 정리/자원 시험을 통과했다. 최종 오프라인 `pnpm light`63파일319시험·웹 build·API runtime 타입 검사 PASS이며 새 UI 실제 HTTP/브라우저 결과가 아니다. [소스/검증 경계](../artifacts/service-workspace-20261104.json)에 기록한다.

Git 추적 Markdown42개(MDX0)의 파일별 독자·현행/원본/이력·처리를 [전수 검토 기록](../artifacts/document-review-20261104.json)에 보존한다. root 개인 요약4개·기존 ignored 전달 요약25개는 별도 분류해 로컬 보존하고 게시/삭제하지 않았다. RUNBOOK/MASTER/한계/현황 역할을 나누고 코드·문서/anchor·배포 포함 경로를 대조했다. UI/reference 변경은 [제품 기준](../PRODUCT.md)과 [공식 패턴](DESIGN-REFERENCES.md)을 따른다.

GHCR의6e3cd23 이미지 후보6종은 비공개 게시·실제 원격 수령을 완료했으나 추가 UI는 포함하지 않는다. 기존 Release는 그대로 두고 사전 Release/후속 runtime은 새 UI 검증 뒤에 확정한다. 봉인한 이전 묶음·실패 원본은 로컬에 보존했다. 새 Release가 있다고 설명하거나 기존 tag/inventory를 덮어쓰지 않는다.

<a id="ui-only-20261104"></a>

## 2026-11-04 UI 전용 실제 실행과 main 반영

새 명시적 승인으로 `ui-only-v1`(시작24GiB/여유16GiB/host3GiB/DB 포함4GiB/45분, 정리10분)을 선택해 실제 PostgreSQL·API/세션/CSRF·HTTPS OIDC·제품 웹/Chromium을 실행했다. 전체 통화 profile의40GiB guard는 유지했다. 첫 표본은 판정 전에 보존했다. UI/업무 선택·공식 업무 오류·공동 승인·WS 분석 경계를 확인했고, 최초 숨겨진 ID 선택자 실패와 확대/보류 응답 시험 결함을 고쳐 원래 deadline 안에서 선택 재시험했다. 실패·재시험을 분모에서 없애거나 고유 사례 수에 더하지 않았다. [실행·자원·소스·캡처 원본 연결](../artifacts/service-ui-validation-20261104.json)을 기준으로 한다.

직접 연 캡처에서 기관 고급 입력의 과밀과 공식 확인 버튼의 작은 조작 영역을 확인해 기존 details/버튼을 재사용했다. 위험·공동 변경 검토·긴급 정지는 접지 않았다. 계정 전환/조회 장애·빈 목록/로딩·정책/분석 오류와 동의 철회를 확인했다. 분석 화면1개는 실제 인증 WS를 받는 component host이며 ServiceCall/PBX/음성 경로가 아니다. 진행 통화에서 조회 장애 후 종료 조작은 B에서 확인할 항목으로 유지한다.

A 정리 뒤 B 최초 표본은 available39.04GiB로40GiB 시작 조건을 통과하지 못했다. 체인/PBX/TURN/Anchor를 기동하거나 조건을 기다리며 반복 조회하지 않았다. 새 clean source65d85ac의 runtime은 기존 로컬 base·network-none·2GiB/CPU1/90초로 직렬 build하고 파일/사용자/아키텍처를 무기동 대조했다. 새 runtime 실제 기동·통화와 AWS 최종 trust 웹·후속 원격 게시를 완료로 표시하지 않는다. 기존 후보/Release·원본 실패·개인 요약은 보존했다.

공개/observer·inventory·audit·checksum5개 로컬 후보를 [전달 영수증](../artifacts/service-ui-candidate-20261104.json)에 고정했다. runtime source와 문서/공개 묶음 source의 차이는 문서·증거뿐이다. checksum·공개 경로/패턴 검사를 통과했지만 새 runtime 기동/통화가 미검증이므로 원격 게시·수령·AWS 준비 완료로 쓰지 않는다.

Git은 사용자 지시에 따라 검증 변경을 main에 정상 반영·일반 push하고 원격/CI를 확인한다. PR을 새로 만들거나 승인 대기하지 않으며 기존 Draft #1은 main 반영 뒤 중복으로 닫는다.

## 최종 기획과 구현·검증 연결

| 요구 ID·기획 흐름 | 실제 소비 경로 | 이번 근거·남은 범위 |
|---|---|---|
| BUSINESS-001~003·AUTH-001~002 | `ServicePage`→인증/업무 API→SQL | 역할/기관 격리·업무/위임·로그인·CSRF·회수 조회 HTTP/Chromium. 외부 IdP는 별도 |
| CALL-001~006·IDENTITY-003 | `ServiceCall`→승인/binding/소비/lease→verifier | 최종 후보의 실제 업무 취소/정지 통화2사례. 모든 만료/장애 조합을 재실행한 것은 아님 |
| CONTRACT-003~004·STATE-001~002·GOVERNANCE-001~002 | worker→ServiceRegistry→Witness→서버 projection | 실제 정지·공동 복구·키 세대 활성화. 관리2/3·Witness3/4·QBFT는 별개 |
| MEDIA-001~003·PBX-001~003 | 양측 제품 웹→Asterisk/TURN→상대 receiver | 실제 합성 음원 양방향 디코딩·회수 후 음성 중단. AWS 외부 TLS/NAT는 별도 |
| AI-001~004·UI-001~004 | remote recorder→인증 WS→orchestration→ServiceCall 패널 | 동의/경고/목적 이탈/장애 분리·철회·정산. 실제 LLM/STT 품질(AI-005)은 미검증 |
| OPS-001~005·OPS-007·TEST-004 | runtime/공개·observer 전달→NEW/restart/RESTORE | 최신 로컬 후보 생성·일반 issuer 시작·소유 자원 정리. 과거 복원 증거는 당시 소스이며 최신 원격 게시/AWS는 남음 |

## 과거 기록 찾기

이전 진행표의 본문은 [날짜별 보관본](archive/DEVELOPMENT-HISTORY-20261104.md)에 그대로 보존했다. 기존 링크가 끊기지 않도록 아래 앵커를 유지한다. 원본 artifacts와 Release는 이동하거나 덮어쓰지 않았다.

<a id="2026-11-04-5차-후속-실행-경계-확인"></a>
- [2026-11-04 5차 후속 실행 경계 확인](archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-04-5차-후속-실행-경계-확인)

<a id="mentoring-five-20261104"></a>
<a id="2026-11-04-5차-제품측정평가-보완"></a>
- [2026-11-04 5차 제품·측정·평가 보완](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-five-20261104)

<a id="candidate-readiness-20261103"></a>
<a id="2026-11-03-현재-후보의-자원무기동-검토"></a>
- [2026-11-03 현재 후보의 자원/무기동 검토](archive/DEVELOPMENT-HISTORY-20261104.md#candidate-readiness-20261103)

<a id="candidate-media-20261103"></a>
<a id="2026-11-03-후보-제작-실제-sqlws-종료-회귀와-전체-미디어-자원-차단"></a>
- [2026-11-03 후보 제작: 실제 SQL·WS 종료 회귀와 전체 미디어 자원 차단](archive/DEVELOPMENT-HISTORY-20261104.md#candidate-media-20261103)

<a id="main-review-20261103"></a>
<a id="2026-11-03-검토-브랜치-리뷰와-main-반영"></a>
- [2026-11-03 검토 브랜치 리뷰와 main 반영](archive/DEVELOPMENT-HISTORY-20261104.md#main-review-20261103)

<a id="http-pressure-integration-20261103"></a>
<a id="2026-11-03-명시적-압박-정책으로-httpwschromium-통합-완료"></a>
- [2026-11-03 명시적 압박 정책으로 HTTP·WS·Chromium 통합 완료](archive/DEVELOPMENT-HISTORY-20261104.md#http-pressure-integration-20261103)

<a id="http-resource-preflight-20261103"></a>
<a id="2026-11-03-http-재개-사전-관측-서비스-시작-전-차단"></a>
- [2026-11-03 HTTP 재개 사전 관측: 서비스 시작 전 차단](archive/DEVELOPMENT-HISTORY-20261104.md#http-resource-preflight-20261103)

<a id="mentoring-integration-20261103"></a>
<a id="2026-11-03-최신-기능-통합-시도-db-확인자원-중단"></a>
- [2026-11-03 최신 기능 통합 시도: DB 확인·자원 중단](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-integration-20261103)

<a id="mentoring-fourth-20261102"></a>
<a id="2026-11-0203-4차-반영-운영-조회승인-목적-분석통화별-측정"></a>
- [2026-11-02~03 4차 반영: 운영 조회·승인 목적 분석·통화별 측정](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-fourth-20261102)

<a id="aws-final-preparation-20261102"></a>
<a id="2026-11-02-aws-전-입력재개-경계-점검"></a>
- [2026-11-02 AWS 전 입력·재개 경계 점검](archive/DEVELOPMENT-HISTORY-20261104.md#aws-final-preparation-20261102)

<a id="public-repository-20261102"></a>
<a id="2026-11-02-공개-저장소의-문서-진입점-정리"></a>
- [2026-11-02 공개 저장소의 문서 진입점 정리](archive/DEVELOPMENT-HISTORY-20261104.md#public-repository-20261102)

<a id="ghcr-images-20261102"></a>
<a id="2026-11-02-비공개-ghcr-게시와-실제-원격-blob-수령"></a>
- [2026-11-02 비공개 GHCR 게시와 실제 원격 blob 수령](archive/DEVELOPMENT-HISTORY-20261104.md#ghcr-images-20261102)

<a id="github-publication-20261102"></a>
<a id="2026-11-02-github-전달-경로와-게시-준비"></a>
- [2026-11-02 GitHub 전달 경로와 게시 준비](archive/DEVELOPMENT-HISTORY-20261104.md#github-publication-20261102)

<a id="delivery-only-20261102"></a>
<a id="2026-11-02-전달물만-사용하는-신규-전체-리허설"></a>
- [2026-11-02 전달물만 사용하는 신규 전체 리허설](archive/DEVELOPMENT-HISTORY-20261104.md#delivery-only-20261102)

<a id="aws-preparation-20261102"></a>
<a id="2026-11-02-aws-단독-실행-준비와-전달-이미지"></a>
- [2026-11-02 AWS 단독 실행 준비와 전달 이미지](archive/DEVELOPMENT-HISTORY-20261104.md#aws-preparation-20261102)

<a id="isolated-media-20261102"></a>
<a id="2026-11-02-실제-교환기합성-음원과-권한-회수"></a>
- [2026-11-02 실제 교환기·합성 음원과 권한 회수](archive/DEVELOPMENT-HISTORY-20261104.md#isolated-media-20261102)

<a id="isolated-runtime-20261101"></a>
<a id="2026-11-01-호스트-설정을-보존한-실제-원장api-연결"></a>
- [2026-11-01 호스트 설정을 보존한 실제 원장·API 연결](archive/DEVELOPMENT-HISTORY-20261104.md#isolated-runtime-20261101)

<a id="2026-11-01-저장소-게시-파일-정리"></a>
- [2026-11-01 저장소 게시 파일 정리](archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-01-저장소-게시-파일-정리)

<a id="chain-preparation-20261101"></a>
<a id="2026-11-01-첫-체인-실행-직전의-입력네트워크-준비"></a>
- [2026-11-01 첫 체인 실행 직전의 입력·네트워크 준비](archive/DEVELOPMENT-HISTORY-20261104.md#chain-preparation-20261101)

<a id="release-candidate-20261031"></a>
<a id="2026-10-31-실제-인프라-연결-전-배포-후보-검토"></a>
- [2026-10-31 실제 인프라 연결 전 배포 후보 검토](archive/DEVELOPMENT-HISTORY-20261104.md#release-candidate-20261031)

<a id="backup-boundaries-20261030"></a>
<a id="2026-10-30-쓰기-중-drain별도-cluster-복원anchor-잠금-후속"></a>
- [2026-10-30 쓰기 중 drain·별도 cluster 복원·Anchor 잠금 후속](archive/DEVELOPMENT-HISTORY-20261104.md#backup-boundaries-20261030)

<a id="persistent-recovery-20261030"></a>
<a id="2026-10-30-영속-anchor프로세스-재시작앱-백업복원"></a>
- [2026-10-30 영속 anchor·프로세스 재시작·앱 백업/복원](archive/DEVELOPMENT-HISTORY-20261104.md#persistent-recovery-20261030)

<a id="authenticated-boundaries-20261030"></a>
<a id="2026-10-30-공동-관리세션분석의-인증-후속-경계"></a>
- [2026-10-30 공동 관리·세션·분석의 인증 후속 경계](archive/DEVELOPMENT-HISTORY-20261104.md#authenticated-boundaries-20261030)

<a id="authenticated-http-validation-20261030"></a>
<a id="2026-10-30-실제-인증httppostgresql브라우저-검증"></a>
- [2026-10-30 실제 인증·HTTP·PostgreSQL·브라우저 검증](archive/DEVELOPMENT-HISTORY-20261104.md#authenticated-http-validation-20261030)

<a id="contract-validation-20261030"></a>
<a id="2026-10-30-커밋-정리와-로컬-evm-계약-실행"></a>
- [2026-10-30 커밋 정리와 로컬 EVM 계약 실행](archive/DEVELOPMENT-HISTORY-20261104.md#contract-validation-20261030)

<a id="실행-제한"></a>
- [실행 제한](archive/DEVELOPMENT-HISTORY-20261104.md#실행-제한)

<a id="postgres-validation-20261029"></a>
<a id="로컬-보존과-첫-postgresql-검증-2026-10-29"></a>
- [로컬 보존과 첫 PostgreSQL 검증 (2026-10-29)](archive/DEVELOPMENT-HISTORY-20261104.md#postgres-validation-20261029)

<a id="readiness-refinement-20261029"></a>
<a id="실행-준비-후속-수정-2026-10-29"></a>
- [실행 준비 후속 수정 (2026-10-29)](archive/DEVELOPMENT-HISTORY-20261104.md#readiness-refinement-20261029)

<a id="execution-readiness-20261029"></a>
<a id="2026-10-29-실행-준비검증-체계"></a>
- [2026-10-29 실행 준비·검증 체계](archive/DEVELOPMENT-HISTORY-20261104.md#execution-readiness-20261029)

<a id="pre-execution-20261027"></a>
<a id="2026-10-27-실행-전-마무리-기록"></a>
- [2026-10-27 실행 전 마무리 기록](archive/DEVELOPMENT-HISTORY-20261104.md#pre-execution-20261027)

<a id="이전-연결-작업의-기록"></a>
- [이전 연결 작업의 기록](archive/DEVELOPMENT-HISTORY-20261104.md#이전-연결-작업의-기록)

<a id="service-20261027"></a>
<a id="이전-연결-시점의-기능"></a>
- [이전 연결 시점의 기능](archive/DEVELOPMENT-HISTORY-20261104.md#service-20261027)

<a id="중요한-정책과-경계"></a>
- [중요한 정책과 경계](archive/DEVELOPMENT-HISTORY-20261104.md#중요한-정책과-경계)

<a id="이번-실제-검증"></a>
- [이번 실제 검증](archive/DEVELOPMENT-HISTORY-20261104.md#이번-실제-검증)

<a id="코드-미구현과-외부-검증의-구분"></a>
- [코드 미구현과 외부 검증의 구분](archive/DEVELOPMENT-HISTORY-20261104.md#코드-미구현과-외부-검증의-구분)

<a id="앞선-인증조회세션-회수-구현"></a>
- [앞선 인증·조회·세션 회수 구현](archive/DEVELOPMENT-HISTORY-20261104.md#앞선-인증조회세션-회수-구현)

<a id="검증-이력"></a>
- [검증 이력](archive/DEVELOPMENT-HISTORY-20261104.md#검증-이력)

<a id="문서-관리와-다음-개발"></a>
- [문서 관리와 다음 개발](archive/DEVELOPMENT-HISTORY-20261104.md#문서-관리와-다음-개발)

## 2026-11-05 두 데모 작업면 후속

이 절은 초기 두 작업면 구현 당시 기록이다. 아래 recapture·등록 대기·호출0은 당시 판정이며, 후속 진행은 상단 현재 표와 날짜별 증거를 따른다.

사용자 확정에 따라 `/demo/call`·`/demo/governance`를 기존 ServicePage parent route/controller·실제 역할 API에 연결했다. 공통 오디오·종료 제어와 근거 drawer, 현재 역할의 조작/수신 상태 배치, 권한 제한된 네 노드 관측을 추가했다. 같은 높이의 fresh hash만 비교하며 validator 소속·개별 투표·Witness 정족수는 조회만으로 성공 표시하지 않는다. 기존 callback·공식 인증은 유지한다.

브라우저 API-response fixture에서 네 역할/1366·390, 탐색·뒤로가기의 같은 오디오 DOM, drawer Esc, 빈 목록·조회 실패 후 목록 제거를 확인했다. 회수/알림 fixture의 형식 오류 두 건을 보존하고 응답만 수정했다. 실제 인증/미디어 시험은 아니다. 캡처를 열어 상단 밀도를 확인하고 준비 도구·비통화 종료 바·재할당 폼을 축약했지만 확인 재빌드의 사전 관측에서 sustained memory PSI로 중단했다. 최신 재캡처는 NOT_RUN이며 독립 시각 검토 판정도 **recapture**다. 최초 UI batch 중단과 후속 승인 batch의 기록을 별도로 보존했고 자동 재기동하지 않았다. [현재 대응](../artifacts/product-candidate-20261104.json)의 persistentServicePreparation.demoUi를 따른다.

| 항목 | 현재 근거 / 상태 | 다음 완료 조건 |
|---|---|---|
| 두 작업면·공통 통화 수명 | 소스 구현·light PASS; fixture에서 같은 audio DOM 유지 | 실제 통화 중 탐색·동의 철회·종료 검증 |
| 최신 표시 확인 | 이전 dirty UI fixture 캡처; 축약 후 recapture BLOCKED | 자원 정책을 지키는 새 승인 화면 검증 |
| 공개 frontend | 정확한 제품 SHA Preview/Production Ready·원격 HTTP/JSON/assets 확인 | 최신 원격 DOM/모바일 재캡처; backend 연결과 구분 |
| 지속 backend | 기존 공개 ingress/OIDC 없음·전체40GiB 미달 | 승인된 TLS/WSS/UDP·IdP·지속 감시 구성 |
| AI | 보호 자격 로딩·오프라인 adapter 검증, $0.10 첫 smoke 승인 | 별도 동의 음성/전사 입력; 실제 호출0 |
| 전달 후보 | 새 소스 오프라인 image build; 실제 runtime/media NOT_RUN | 후보별 상태를 보존한 게시·수령; 실제 통합 후 검증 완료 판정 |

<a id="submission-review-20261106"></a>

## 2026-11-06 제출 문서 정리와 읽기 전용 구현 리뷰

기준 main `20cbd659783ab08791fbbb0abefc939a016391aa`, 확인일 2026-11-06(KST). 별도 `docs/submission-review-20261106` worktree에서 문서만 수정했다. 원본 checkout의 branch·staging·미커밋 파일과 HTML/PDF·개인 메모는 건드리지 않았다. [전체 Markdown 검토 목록](../artifacts/document-review-20261106.json)에 43개 파일의 독자·용도·기존 감사 대비 hash·변경 사유·검증 범위를 기록한다. 기존 감사와 동일한 자료는 보존 판정을 재사용하고 현재 상태 표현·명령/경로·문서 역할을 다시 대조했다.

공개 로그인/API 미연결이라는 오래된 설명을 정정하고 현황표로 연결했다. RUNBOOK의 HTTP rewrite·분석 relay·SIP/TURN 경계를 현재 코드에 맞췄다. MASTER의 요구 ID·완료 조건은 유지하면서 서버컴 우선/AWS 후속을 구분했다. 이전 현황 문장은 이력 문서에 보존했다. AGENTS의 권한·사용자 지시는 수정하지 않았다. AGENTS가 길어진 문제는 이후 별도 승인 아래 과거 예외를 보관하고 현행 조건을 연결하는 방식만 제안하며 이번에 적용하지 않는다.

### 우선순위와 판정

P1은 공개 시연의 핵심 미완료 경계, P2는 잘못된 상태 표시나 실패 후 복귀 문제다. 아래 위치는 **기준 SHA의 줄 번호**다. 제품 코드·시험은 수정하거나 실행하지 않았으며, “코드상 확정”도 브라우저 재현 완료를 뜻하지 않는다.

#### R1 · P1 · 공개 통화 완료 증거 없음 — 기존 개발 세션 소관

- **문제:** 공개 인증 성공을 공개 통화·회수·분석까지 성공한 것으로 제출할 수 없다.
- **근거:** [공개 조사 기록](../artifacts/persistent-idp-start-20261105.json)의 `publicMediaInvestigation20261106`(468행 이후), `completeCalls: 0`; [통화 controller](../apps/web/src/lib/serviceCall.ts)의 검증/lease/연결 단계(64~116행).
- **발생 조건:** 공개 주소를 사용하는 SIP/ICE 협상과 수락 후 실제 연결 검증. 원래 기록에는 ICE timeout과 수락 뒤 verification-unavailable이 각각 남아 있다.
- **사용자 영향:** 통화가 종료되거나 실제 양방향 음성 확인까지 도달하지 못한다. 후속 분석·회수의 공개 성공도 이 근거만으로 주장할 수 없다.
- **판정:** 미완료 실행은 확정. 단일 원인·현재 수정 후 재현 여부는 미확정. 상대 측 PBX_BINDING_CONTEXT_INVALID를 최초 원인으로 확정하지 않는다.
- **최소 수정안:** 새 구현을 중복하지 않고 기존 세션의 첫 오류 진단·수정 결과를 받아 현황표의 해당 행만 갱신한다.
- **필요 검증:** 기존 세션이 승인된 범위에서 같은 후보의 양방향 음성 디코딩과 종료/회수·분석을 각각 확인. 이 문서 세션에서 재현하지 않음.

#### R2 · P2 · 수동 관리 조회 실패 뒤 이전 결과가 남음

- **문제:** ‘관리 상태 기술 상세’는 다음 조회가 실패해도 마지막 성공 JSON을 그대로 유지한다. 어떤 종류의 조회·언제의 결과인지 표시하지 않는다.
- **근거:** [ServiceManagement](../apps/web/src/pages/Service.tsx) 105~112행의 `state`와 `setState(await api(...))`; 같은 파일 48행 `action`의 오류 처리. 별도 [ServiceAdministration](../apps/web/src/components/ServiceAdministration.tsx) 9행은 실패 시 state를 지우므로 두 영역의 처리가 다르다.
- **발생 조건:** 관리 상태/작업/health 중 하나를 성공 조회한 뒤 다른 조회가 5xx·네트워크 오류로 실패하고, workspace 조회 자체는 정상인 경우.
- **사용자 영향:** 이전 활성 상태·노드/작업 결과를 새 조회의 결과로 오해할 수 있다. 서버 권한 우회가 확인된 것은 아니다.
- **판정:** 코드상 확정된 표시 결함. 실제 공개 브라우저 재현은 미실행.
- **최소 수정안:** 수동 조회 시작/실패 시 상세 결과를 비우거나 조회 종류·시각·실패 후 오래된 결과임을 명시한다. 기존 조회 상태 패턴을 재사용한다.
- **필요 검증:** 성공→다른 조회 실패의 작은 UI 회귀 1건. 전체 체인·PBX 재실행 불필요. Service.tsx가 개발 중이므로 통합 시 재확인.

#### R3 · P2 · 관리 조회 불가를 ‘공동 변경 요청 없음’으로 표시

- **문제:** 관리 state가 아직 없거나 조회에 실패했을 때 빈 요청 안내가 표시된다.
- **근거:** [ConfigurationReviewPanel](../apps/web/src/components/ConfigurationReviewPanel.tsx) 25행의 `!state?.configurationProposals.length`; [ServiceAdministration](../apps/web/src/components/ServiceAdministration.tsx) 9행은 조회 실패 시 `setState(undefined)`를 호출한다.
- **발생 조건:** 최초 조회 대기 또는 `/v3/management`/jobs 조회 실패.
- **사용자 영향:** 실패 안내와 ‘공동 변경 요청이 없습니다’가 함께 보이며 실제 제안이 없는 것으로 오해할 수 있다. 서버의 제안/서명은 삭제되지 않는다.
- **판정:** 코드상 확정된 표시 결함.
- **최소 수정안:** state가 있고 성공 응답의 배열이 비었을 때만 빈 상태를 표시한다. 미조회/실패는 기존 조회 실패 안내를 사용한다.
- **필요 검증:** state undefined와 성공 empty 배열을 구분하는 컴포넌트 렌더 검사. 기존 `configuration-review` 시험을 확장하면 충분하다.

#### R4 · P2 · 실패한 로그인 callback Promise가 모듈에 남음

- **문제:** callback 실패 시 모듈 변수 `loginCompletion`이 비워지지 않는다. 전체 reload 없이 ServicePage가 다시 mount되면 이전 rejected Promise를 다시 await하고 `refresh()`에 도달하지 못한다.
- **근거:** [ServicePage](../apps/web/src/pages/Service.tsx) 25·41행. URL의 code/state는 먼저 제거하고, `loginCompletion=undefined`는 await 성공 뒤에만 실행한다. catch/clearLocal에는 초기화가 없다.
- **발생 조건:** callback 요청이 실패한 뒤 SPA 내 다른 화면에서 업무 화면으로 복귀. 전체 페이지 reload를 동반한 새 로그인은 모듈을 초기화하므로 영향 범위가 다르다.
- **사용자 영향:** 복귀한 화면에서 과거 로그인 오류가 반복되고 현재 세션 확인이 생략된다. 새 로그인 자체가 영구 차단된다는 주장은 아니다.
- **판정:** 코드상 캐시 잔류 확정. 해당 사용자 이동의 브라우저 재현은 추가 확인 필요.
- **최소 수정안:** 완료/실패한 자신과 같은 callback Promise만 정리해 동시 mount 중 중복 교환 방지는 유지한다.
- **필요 검증:** callback 1회 실패→unmount/remount→auth/me 재조회와 중복 mount 시 callback 1회만 교환하는 UI 회귀. 외부 IdP 호출 없이 mock 응답으로 충분하다.

### 검토한 방어와 아직 확인하지 않은 것

ServiceCall은 종료/동의 철회 때 분석 generation을 바꾸고 결과·전사를 지우며, 새 contextRevision보다 오래된 분석을 무시한다. 업무 조회 실패는 목록을 숨기고 통화 종료를 남긴다. 관련 `analysis-stop.test.ts`, `service-controller.test.ts`, `service-analysis.test.ts`는 이러한 선택 경계를 다루지만 공개 STT 품질·브라우저 수명 전체를 입증하지 않는다. 승인 소비/lease·관리 EIP-712·Witness 검증과 DB/Anchor 복원은 코드와 기존 기록을 대조했으며 새 실환경 성공을 선언하지 않는다.

준비 문서에서 빠진 내부 계정 ID·위임 등록 대기·동일 시도 선택·브라우저 단기키 소실·공개 경로별 입력은 RUNBOOK에 보완했다. 실제 금융기관 계정 연결, 상용 CTI/PSTN, 독립 원장 운영, native chain proof는 후속 범위이며 이번 리뷰의 신규 필수 개발 작업으로 만들지 않는다.

### 기존 개발 세션 통합 안내

문서 커밋만 순서대로 검토해 반영한다. 이 branch에서 main 병합·push·PR·배포를 하지 않는다. 전체 파일을 원본 checkout에 복사하지 말고 diff 단위로 통합한다. 공개 통화·STT/AI·회수·공동 복구·지속 운영의 최신 결과는 현황표의 근거/소스만 갱신한다. R1은 기존 진행 작업이며 R2~R4도 최신 코드에서 해결됐는지 먼저 대조한다.

충돌 가능성이 높은 문서는 `docs/RUNBOOK.md`(원본에서 이미 수정 중), `docs/FINALS-IMPLEMENTATION-PLAN.md`, `docs/guide/05-IMPLEMENTATION-STATUS.md`, `docs/KNOWN-LIMITATIONS.md`다. `README.md`·`docs/README.md`·`DESIGN.md`는 공개 모드/설명 변경과 겹칠 수 있다. HTML 디자인·제품 코드의 변경은 이 branch에 가져오지 않았다. 보관본은 append 내용만 통합한다.


### 최종 대조와 검증

마지막 확인한 공유 main은 `1e6a090dace651c99140b8835597db34a24c8850`다. 기준 이후 5개 커밋·제품/시험 23개 파일의 변경 목록을 확인하고 종료 controller, 분석 예산, 복구 계약/검토 화면, ServicePage·관리/분석 표시의 관련 diff를 읽었다. 해당 구간의 Markdown·기존 공개 실행 증거에는 변경이 없다. R2의 수동 관리 결과 잔류, R3의 undefined 빈 상태, R4의 callback 캐시는 최신 main에도 남는다. 종료 중 검증 경합은 `5d130df`에서 별도 수정됐으므로 신규 미해결 결함으로 보고하지 않았다. 새 복구 파일 UI와 분석 예산의 설명만 보완했으며 제품 파일을 가져오거나 원본 checkout을 덮어쓰지 않았다.

이번 검증은 추적 Markdown 43개(MDX 0개)의 로컬 링크·GitHub식 heading/명시 anchor 723개, 명시 소스 경로, package.json 명령 이름 대조 및 `git diff --check`다. 누락 링크/anchor는 0개다. `contracts/out` 참조는 생성 컴파일 산출물/예시 경로로 분류하고 생성하지 않았다. 외부 URL 89개의 가용성, 문서 명령 실행, light/브라우저/통합/AI 시험은 수행하지 않았다. 원격 fetch 없이 공유 로컬 main을 대조했으며 이후 main의 추가 변경은 통합 담당자가 같은 경계만 확인한다.

### 2026-11-06 20:16 KST — Risk runtime and read-only network diagnosis

- Issuer now runs local image config `851a92aa64d794d4936e9d3939feb21a781319f02b5e019c7af2a9ca408f55ba` from `88552d8`; provider is OFF after the bounded check. DB/chain/realm/keys were preserved. CI for `88552d8` passed.
- Case34 created a real work and authorization, then public-trust and recipient auth GETs failed with `ERR_NETWORK_CHANGED` before PBX/analysis. The 180-second timeout is retained; no provider reservations/calls occurred. Cleanup left zero active attempts and removed the exact trial container. This is not an STT/LLM failure.
- GET-only two-browser diagnosis35 reproduced `ERR_NETWORK_CHANGED` at 11:15:08.754 UTC. Read-only host netlink observation recorded veth address/link deletion at 20:15:08.748 KST on the same host clock. Temporal proximity supports investigation of host network-change notification, not proof of the responsible process or all historical failures. Other services/network settings were not changed. Response-body aborts in the diagnostic are distinct from this network failure.
- Shared frontend API reads now retry one network `TypeError` after 250ms, preserving cancellation; commands and HTTP failures are not replayed. Four focused tests, web typecheck and source hygiene passed. This improves transient read recovery; it does not establish that the host network cause is fixed.
- Protected evidence: current resume directory's `public-call-smoke-34-analysis-completion`, `public-readonly-entry-35`, `network-observation-35`. Guard PASS for diagnosis35 only describes bounded execution/cleanup, not all HTTP requests succeeding. Actual risk-result display and renewed operational deadline remain pending under the user's existing authorization.

### 2026-11-06 20:29 KST — Actual risk results and remaining stream stability

- Case36 reached actual remote audio, Deepgram revisions and an OpenAI request; the request timed out at ~4.16s and the audio stream later reported backpressure. The request's 6,525 micro-USD reservation remains held, not recorded as zero.
- Delayed authority reads could overlap recorder chunks and close the stream. Bounded serial buffering (8 queued chunks/512KiB, individual frame256KiB) now preserves checks and clears queued audio immediately on withdrawal/stop. Delivery, withdrawal and overflow regressions passed. Risk-provider timeout is15s; the observer waits for the15.3s recording plus analysis instead of only8s after the first transcript.
- Case37 received4 real OpenAI responses and2 completed risk events. The protected recipient screenshot visibly contains an AI OTP detection, exact transcript quotation and Korean explanation. The overall test failed on a stale, removed UI label; this is not a full scenario PASS. Empty final transcripts also triggered unnecessary new analysis, now fixed without retaining new audio/transcripts. Empty corrections to existing speech still invalidate its evidence. Risk lifecycle7 tests and existing service analysis16 tests passed.
- Case38 used runtime source `d5c959cda6bd342229b040967741a55db32c6569`, local image config `b951534776be7229849fb139ae3520c6a88dcabb0f9ff44afc41d92f221bae19`. It received transcripts and2 OpenAI responses, but the audio socket closed before an accepted completed result reached the observer. A concurrent sender context request had ERR_NETWORK_CHANGED; exact causation is unconfirmed. Add only recorder count/byte totals and native WebSocket close code/clean status to the next observer, not payloads or credentials.
- Current cumulative OpenAI usage-priced amount7,380 micro-USD plus unknown-response reservation6,525 micro-USD against the shared1,000,000 micro-USD budget. These are local usage/reservation figures, not invoice verification. Provider OFF restored, active attempts0, trial containers removed, persistent monitor stop=null. Source/Vercel `d5c959c` is deployed. No external device verification, operational renewal, or complete analysis→withdrawal→normal-end PASS is claimed yet.

### 2026-11-06 20:43 KST — Current-authority verification during renewal

Case40 recorded `authority-expired` before analysis completion. The controller returned after each renewal challenge/proof/issuance write, skipping verification of the still-current lease and transport. Removed those three early returns; existing expiry, signature, Witness and PBX checks remain mandatory. Three regressions first failed, then passed with the fix (14 focused tests including observer fixtures; web typecheck passed). Also repaired the observer unit fixture's missing native WebSocket constructor. This is an offline-verified fix, not yet evidence of a successful deployed analysis/withdrawal flow. Original case40 evidence is preserved.

### 2026-11-06 20:47 KST — Actual analysis completion and withdrawal passed

Case41 used Vercel `e013780` and issuer source `d5c959c` (config ID `sha256:b951534776be7229849fb139ae3520c6a88dcabb0f9ff44afc41d92f221bae19`). One new actual UI work/call passed both decoded audio, actual Deepgram transcription, completed OpenAI risk event and recipient evidence/explanation display, withdrawal without ending media, then normal termination/PBX cleanup. The protected `actual-provider-analysis.png` was opened and reviewed: actual warnings and evidence are visible, but repeated rule/model entries make the narrow phone panel dense; recording layout review remains. No external-device or model-accuracy claim. Past case40 remains failed.

Four OpenAI responses used 2,711 input and 650 output tokens, estimated USD0.004960; Deepgram one connection settled 18 elapsed seconds (not a verified invoice/audio duration). Durable goal total: USD0.017443 settled plus USD0.019879 reserved for unresolved requests, remaining conservative budget USD0.962678. All case41 reservations settled, active attempts0, trial container removed, provider OFF restored/readiness200, resource stop absent. The independent existing light CI for `e013780` passed. Operating renewal, final recording comparison, and finite-budget user activation remain; this does not mark the whole goal complete.

### 2026-11-06 v18 UI continuation (not deployed)

The v18 reference checksum and rendering are recorded in DESIGN.md. Initial product fixture browser inspection passed under the existing resource guard (`.local/recording-demo-20261106/v18-product-fixture/result.json`); this is synthetic API/UI evidence, not a real call. Desktop recipient, 390px recipient, and work detail screenshots were opened directly. Phone contrast and the centre surface were adjusted after inspection; these last CSS changes still need recapture. Acceptance, analysis withdrawal, and ending now have explicit controller presentation states so they cannot look like a new incoming call. Related flow/controller tests: 15 passed; web TypeScript and diff checks passed. The attempted package `typecheck` command did not exist; direct `tsc -p apps/web/tsconfig.json --noEmit` passed. Production remains unchanged, providers remain OFF, and no new paid or real-call trial ran in this UI pass. The second guarded build passed. The confirmation fixture also passed, including search/page reset and scene-selection no-write checks; desktop call/governance captures were opened directly. A subsequent waiting-screen predicate was type-checked so PBX registration alone does not dismiss the waiting wallpaper; its live incoming transition remains part of the actual-call verification. Related focused checks now total 24 passed. Full current-version real calls, deployment, and operating renewal remain pending.

The deployed v18 frontend (`9d0dd81`, product changes `f5cf85b`) passed CI. Case42 reached real two-way decoded audio, route continuity, Deepgram transcription, completed OpenAI analysis and visible evidence, then withdrawal with no further analysis frames and the call still connected. The normal-end assertion failed: recipient still showed connected at the deadline; this is not labelled a full PASS or assumed to be only a locator problem. Finally cleanup reclaimed the trial PBX resources and restored providers OFF. Shared OpenAI usage is 22,249 microUSD with 19,879 reserved (remaining 957,872); this is local usage accounting, not an invoice. Original evidence is preserved under the current resume's `public-call-smoke-42-analysis-completion`. A separate provider-OFF case43 is running for institution UI cancellation.

Operating renewal inspection also found that only issuer had been updated while the restart checker expected one app image for every role. `CALLSIGN_ISSUER_IMAGE` now optionally pins that role in both Compose and existing-container validation; all other images remain strictly matched. The focused mismatch test failed before the fix and all seven restart tests passed after it. This setting is not yet applied to the protected environment and no operating renewal has run.

### 2026-11-06 21:45 KST — Interrupted response-body handling

Case43 timed out after approval; preserved pre-cleanup diagnostics show both workspace responses interrupted by `ERR_NETWORK_CHANGED` around 7.23s, before recipient preparation/PBX evidence. The sender eventually displayed a network error and the attempt expired. This does not establish the host network cause or a PBX/TURN failure. Its exact trial container was removed; no automatic retry ran.

The shared frontend API reader retried fetch failures but swallowed JSON body-read failures into `{}`, allowing an incomplete successful response to masquerade as data. Added failing regressions, then moved successful body reading into the existing one-retry GET boundary. Commands are never replayed; malformed JSON fails; known HTTP errors retain their status even with an unreadable error body. Seven focused tests, web typecheck and diff checks pass. This is a verified code defect under the observed failure mechanism, not proof that every historical network failure is explained.

The real observer now bounds individual actions/navigation and records recipient preparation stages and outcome request/status without payloads. Case42 normal-end failure remains unresolved; its existing real analysis/withdrawal evidence is retained. Providers remain OFF and no new call or paid request was made for this fix.

### 2026-11-06 21:54 KST — Termination click lost during focus scaling

Case44 never created a work/container: a local launcher ID substitution accidentally changed the read-only DB port. The failed precondition is preserved; it is not a service failure. Corrected the scoped ID replacement and checked the unchanged DB port/image before case45. Case45 (providers OFF) passed real approval, acceptance, both decoded relay audio and page continuity, then reproduced normal-end failure. No browser `/outcome` request occurred before cleanup; both peers remained connected. Cleanup reclaimed resources and read-only active-attempt count returned zero.

A bounded synthetic browser reproduction with production CSS isolated the lost click: the gateway's fixed-position end button changed its containing block when the v18 parent acquired a focus transform. Pointer-down at (1190,698) was followed by focus at (128,802), with zero clicks. Keeping the card's end button in normal layout (the persistent live bar remains available) fixes that boundary. `tests/ui/demo-end-button.mjs` passes after the CSS change; the original failed reproduction is preserved under `.local/v18-review/termination-focus-result.json`. This is CSS/click evidence, not a new real-call PASS. Related controller/flow/API tests:22 passed. No AI requests.

The protected deployment configuration now pins the old non-issuer app image separately from issuer's new image. Read-only `server-check` passed for21 existing services; no restart or operating renewal was performed. Shared cost and provider OFF remain unchanged. Latest successful CI/Production before this CSS commit: `8678d28`.

### 2026-11-06 22:15 KST — Final filming flows and bounded operation

Product frontend f104759 / issuer d5c959c: case46 normal call, case47 institution UI cancellation and case48 actual risk/withdrawal/normal end passed. Each used a new work/call and preserved earlier failures. Cases46/47 had providers OFF. Case48 used one Deepgram connection (14 elapsed seconds settled) and3OpenAI usage responses (1947input/493output tokens; estimated$0.003680). No TTS. Trial resources and active attempts were cleared; shared unknown-request cost reservations remain intact. These are server-host browser results, not external-device or model-quality certification.

Approved operating renewal stopped the previous monitor normally, preserved its stop/review and started the existing21containers without NEW. Current monitor expires2026-11-07 22:03:42KST; actual readiness200 and fresh OIDC/workspace checks passed. Filming providers enabled with180STT seconds/3connections/12requests, expiry22:02:42KST, unchanged sharedUSD1cost ID. Activation made no provider calls; cost snapshot used25929/reserved19879/remaining954192microUSD. Protected receipts are in the current-resume pointer; trial evidence remains in the previous resume. No host/network/global authentication changes. Current state and filming commands are linked from the implementation table and RUNBOOK.

Final authenticated read-only capture follow-up: the first governance screenshot was taken before its request settled. A separate bounded run now waits for actual institution/epoch and block data; all3roles at1440/390px passed without request failures. Opened desktop/mobile governance, recipient, gateway, work list and white drawer captures directly. Four current heads and matching same-height hashes are observed, not validator voting or Witness quorum proof. Evidence: `.local/v18-review/final-authenticated-settled/`. No calls, management commands or provider requests were created.

### 2026-11-06 — v24 implementation in progress

Reference `docs/CallSign_Recording_Demo_ShortVoice_v24.html` matches supplied SHA256 `381f86b8f299d3b2f1f1c135bf7ccaa503ba3dfc72e204f52139fedddc5e9f7d`. Rendered original work/call/governance at1440/390px under the existing bounded UI guard; directly opened call captures. Local Korean voice playback/cancel and explicit web keypad1/2/9 now connect to the existing controller consent method in the working tree; no PBX DTMF claim. First actual active timestamp stays in the call controller. Output selection only enables where browser APIs exist. Focused11tests and web typecheck pass, but interaction/visual fixture and actual new flow verification remain pending. No paid calls, deployment, operating renewal or data initialization in this implementation pass. Previous production remains unchanged.

V24 component interaction follow-up: production component + synthetic consent promises/browser (no API/media/provider) found Escape failing when focus remained on the keypad opener. Added open-keypad Escape handling and preserved the failed result. Bounded rerun passed9/no request,2/no grant, pending duplicate suppression, withdrawal winning a late grant, focus return, providerOFF and accessible termination. Added temporary sender mute during local guidance with restoration of the user's latest mute preference; no network TTS or keypad audio. Evidence `.local/recording-demo-20261106/v24-keypad-interaction{,-fixed}` and `.local/v24-review/keypad/`. Full-page v24 visual integration and actual scenarios remain pending; this isolated capture is not a finished product layout.

V24 controls follow-up: made the recipient end action required, added actual mute/output/keypad controls and maintained provider-off and withdrawal accessibility. Focused11 tests, web typecheck and whitespace checks passed. The latest control-only browser regression passed. Full component-state fixture initially failed on the missing existing Vite punycode alias, then an opaque about:blank storage context; these fixture failures are retained. Using the existing alias and a wholly intercepted synthetic origin passed nine states at1440/390px. Opened connected desktop, keypad mobile and risk mobile captures; found insufficient dark-text contrast and an oversized keypad caused by hidden content preserving height. Corrected those styles; final recapture remains. Two-decline now keeps its distinct choice when the controller reports analysisWithdrawn; its prop-update browser regression remains to rerun. No new real call, paid request, deployment or runtime restart in this pass. Evidence: `.local/recording-demo-20261106/v24-keypad-controls/`, `v24-phone-layout{,-alias,-diagnostic}/`, `.local/v24-review/phone/`.

V24 final-layout follow-up: the hidden-content layout introduced two accessible-state regressions, both caught by the existing browser assertions: pending consent was hidden inside the keypad, and focus returned before the opener became visible. Pending/error feedback now lives inside the keypad; focus restoration uses the committed layout. The prop-update keypad regression and nine full-component states at1440/390px passed (`v24-keypad-focus-commit`, `.local/v24-review/phone-final/`). Original connected/keypad captures were also opened; unnecessary connected preparation controls and duplicated pre-analysis text were reduced, with actual evidence retained. Focused17 tests and both relevant typechecks passed. Media observer now exercises2/no recorder,9/no consent then1, and decoded mute after file-to-microphone return; those real v24 paths are not yet run. Existing v18 production and providers remain unchanged.

The compact follow-up passed the guarded production frontend build and the existing focus/click termination regression. Opened connected desktop, risk mobile and ended mobile fixtures directly (`.local/v24-review/phone-compact/`); actual processing disclosures make the product longer than the simulated reference, with scrolling preserved instead of clipping controls. Local Korean speech is unavailable in this headless environment and the text fallback was observed; no measured spoken-duration claim. The ended synthetic fixture was corrected to carry the controller's terminal connection label/timestamp rather than showing a fresh-call label. Actual authenticated/public and media verification remains the next gate.

### 2026-11-06 23:17 KST — v24 live verification and filming quota correction

Production/main82a7225 and CI42231015989 succeeded. Actual authenticated public capture at c415233 covers three roles at1440/390px; later waiting-control/copy changes remain a recapture boundary. Case49 passed key2/no recorder with live audio, actual440Hz file selection/transmission,660Hz microphone return, decoded mute/unmute, route continuity and normal termination. Case50 passed actual institution UI cancellation, both audio reclamation, PBX absence and cancelled-work409. Both used one new work/call, zero automatic retries and no analysis consent; trial containers were removed. These are server-host browser results, not external-device evidence.

Before the remaining paid v24 key9→1 check, code review found that each STT stream reserved the entire180-second filming total. After any nonzero first settlement, another180-second reservation would fail despite remaining time. The shared total/approval ID is retained; each of3connections now reserves at most60seconds and each stream may invoke at most4of12model requests. Two focused regressions cover successive connection shares and per-stream request exhaustion; all9budget tests, API/light typechecks and source hygiene pass. This backend fix is not yet in the running d5c959c image. No provider invocation, budget reset, operational extension or runtime replacement occurred in this correction pass. Filming cost remains used25929/reserved19879microUSD; quantity rows were absent before these no-consent trials.


V24 runtime budget fix a36e6e6 passed CI42232474427 and issuer-only readiness200; image config436fb7d1a24293f166ece59e20fee623061ca290411f8f3f9075460e5768838e. First build failed before image output and its cleanup error masked the original exception; no resource stop. Preserved that failure, handled exited short-lived build processes by reinspection, and retained the successful bounded rebuild receipt. Data, shared budget and expiry unchanged.

Case51 made one paid attempt with no retry: key9/no consent, key1 consent, actual remote-track transcription and3OpenAI usage responses occurred, but no completed event reached the UI. Current-context output was rejected as LLM_EVIDENCE_CONTEXT_INVALID. Exact rejected category/IDs were not logged, so model vs evidence-context cause remains unconfirmed. Added text-free category/unit-ID/context-version diagnostics without relaxing validation;28focused risk tests pass. This diagnostic change is not yet deployed. Original failed report and protected analysis screenshot retained; rules warning and analysis-unavailable coexist. Cleanup completed and active attempts returned0. Quantity settled45seconds/1connection/3requests, reserved0; remaining135seconds/2connections/9requests. OpenAI usage2012input/510output tokens, estimated3806microUSD; shared used29735/reserved19879/available950386microUSD. No full provider invoice or model-quality claim. Remaining user filming quantity must not be consumed by automatic retries.

Final a36e6e6 authenticated recapture completed for three roles at1440/390px, white work drawer and current four-node view. Opened recipient390, work-detail1440 and governance1440 directly. One management request was ERR_ABORTED across navigation; subsequent data rendered, and this is not a zero-network-error claim. Phone content remains scrollable. Case49 actual connected/declined full and viewport screenshots were extracted from the report and directly opened.


### 2026-11-06 23:37 KST — Diagnostic case52 and preserved filming reserve

CI42234103433 succeeded; issuer-only diagnostic runtime4f1d89a/configa5de1985f5c3f1dd72c23f7bb973a600c089ea15726a6737d8afed94fdf6aa31 applied with readiness200 and unchanged budget/expiry/data. Case52 was one explicitly bounded follow-up, no automatic retry. It passed key9/no consent and key1, real transcript and2OpenAI usage responses, but no completed analysis. Browser monotonic timeline: sender lease-proof ERR_NETWORK_CHANGED at44.0s; notifications/auth and recipient pbx/evidence network-change at47.17s; both SIP BYE at51.74s. This correlates failure/termination but does not establish the host-network root cause. Recorder stopped and audio WS closed. No evidence-rejection diagnostic occurred in this case.

Observer finally then waited for a withdrawal button removed by terminal call state and masked the original analysis-completion timeout. Fixed the observer to preserve the primary failure, still report cleanup-only failure, and try file cleanup even if withdrawal fails; two offline regressions pass. No product security/lease timeout relaxed. Actual transcript and rules warning are not a completed LLM PASS.

Case52 quantity settled12seconds/1connection/2requests, reserved0. OpenAI1274input/326output tokens, estimated2423microUSD. Shared used32158/reserved19879/available947963microUSD; remaining123seconds/1connection/7requests, with the last connection capped60seconds/4requests. This last connection remains for user filming. Active attempts0, trial container removed, persistent monitor stop=null. No further paid trial started. Read-only60second netlink observation prepared to distinguish future evidence without changing interfaces/routes or stopping other services.

Post-case52 read-only netlink observation completed:208log lines,107veth mentions and25deletion mentions during60seconds; these are log-line counts, not distinct operations. This is current host activity, not reconstruction of missing historical netlink evidence or proof of another service's responsibility. Protected original and redacted summary are under `.local/v24-review/network-observation-52/`. No network changes were made.

Case52 read-only DB follow-up: stored terminal reason is `pbx-channel-ended`, status ended at1793975503, whereas saved lease expires1793975533. Cleanup is `pbx-absent` from ARI delete/readback. This contradicts treating the observed termination as a proven lease-expiry failure; no timeout or security check was relaxed. `PbxRuntime.event` currently maps StasisEnd/ChannelDestroyed/ChannelHangupRequest to that common reason without persisting the first event type/cause, so exact PBX cause cannot be reconstructed. Existing Asterisk logs show SSL shutdown errors in the interval but do not identify the initiating cause; network-change timing remains correlation. Protected read-only extracts are in case52 terminal-state/reason-review JSON. No calls, provider requests, network changes or restarts in this follow-up.

### 2026-11-07 — v24 duplicate-file comparison and handset controls

User-requested `docs/CallSign_Recording_Demo_ShortVoice_v24 (1).html` is byte-identical to the original v24 (SHA256 `381f86b8f299d3b2f1f1c135bf7ccaa503ba3dfc72e204f52139fedddc5e9f7d`). Re-rendered that exact input at1440/390px; preserved existing work/governance/controller/auth. Matched circular media/end controls with readable labels and added selected-digit feedback. Key9 can replay local guidance after consent without creating another consent request; key1/2 remain explicit and duplicate-protected. Browser regression covers replay before/after consent, pending withdrawal, late grant, provider OFF and focus return. First visual pass found keypad withdrawal clipped; compacted keypad spacing and added an assertion that withdrawal fits the visible panel. No provider calls, new real call, runtime replacement or operating extension. Existing case49/50 real media/cancellation evidence remains historical; latest AI completion remains incomplete after cases51/52. UI evidence: `.local/v24-review/v24-1-20261107/`; bounded UI guards under `.local/recording-demo-20261106/v24-1-*`. Two bounded UI passes passed without resource stop; opened connected/risk/keypad captures directly, including the corrected390px keypad. Focus/click termination regression passed. Related11unit tests, web typecheck and source hygiene passed. These are synthetic state/interaction checks, not another real AI or call PASS. Publication is verified separately.


### 2026-11-07 — v24 handset scene and interaction fidelity correction

The previous control styling did not reproduce the reference handset interaction. Reworked the existing product components into fixed waiting/incoming/live scenes, actual institution identity, compact consent feedback, a processing-information dialog, and the original keypad/hide/replay flow. Key9 closes the keypad and replays local guidance without consent; key1/2 still wait for the existing server result. Controller/audio lifetime, independent roles and real state transitions are retained. Technical contact evidence and provider status remain accessible outside the handset. No fake timer success, DTMF, shared role authority or paid request was introduced.

Focused14 tests and web typecheck passed. Synthetic browser interaction passed pending withdrawal/late result, provider OFF, dialog, replay and focus checks. Initial browser failure exposed duplicate pending status; corrected its rendering. Direct visual review exposed overlap between consent guidance and warning evidence; separated their bounded regions and added a geometry assertion. Nine component states at1440/390px and end-action regression are fixture checks, not fresh live media/AI results. Source captures and guard records: `.local/v24-review/structure-20261107/` and `.local/recording-demo-20261106/v24-structure-*`. Runtime, provider budgets, operating expiry and original cases remain unchanged. Publication and authenticated read-only capture are separate checks.
