# 05. 구현 및 검증 현황

확인일 **2026-11-06(KST)** · Recording UI 제품 frontend **`db32c55`**, 실행 issuer 제품 소스 **`1ac1c0d`**, 나머지 runtime 제품 소스 **`e267dbf`**. 사용자 승인에 따라 17:05 새 감시를 만들고 기존 persistent21개를 재개했다. 원본 case30 stop/latch·DB·체인·realm·계정·키는 보존하며 만료는 **2026-11-07 08:37 KST** 그대로다. 공개 metadata `publicPreview=false`, 실제 역할별 로그인·업무 조회·화면 검증을 확인했다. **case31은 업무 생성 전 진입 실패로 보존했다. 별도 추가1회 승인 case32에서 실제 새 업무→승인→양방향 합성 음원 디코딩→페이지 이동→기관 UI 취소→양측 음성 중단·PBX 부재·재발신409를 통과했다. 실제 AI는 OFF이며 외부 단말과 완료 분석 표시까지 전체 검증된 것은 아니다.** 같은 조건의 별도 GET-only 진단은 로그인·업무 화면 성공이지만 최초 실패 원인을 확정하지 못했다. [현재 근거](../../artifacts/demo-ui-20261106/recording/result.json).

현재 목표는 **서버컴의 전용 지속 데모**다. Vercel frontend·서버컴 backend/인프라·외부 Deepgram/OpenAI 배치를 사용한다. AWS 운영·학교 서버 비의존 요구는 이번 완료 조건에서 제외한다. 실행 상태는 이 표 한 곳에서 관리하고, 기동·중지·보존 조건은 [RUNBOOK](../RUNBOOK.md#지속-서비스와-시험-환경의-분리), 제품 제약은 [알려진 한계](../KNOWN-LIMITATIONS.md)를 따른다.

이번 후속 코드 `fa28340`·`7cdf702`는 Deepgram opt-out 강제·종료 정리·분석 JSON 오류 구분과 안전한 관측을 보완했다. 관련 단위 36건, API/light/web 타입 검사와 소스 검사 통과. 사용자 승인 뒤 runtime `3db968c`에 반영했고 실제 수정 파일 대응·API readiness 3개 200·Anchor healthy를 확인했다. 활성통화/예약0·outbox done187, 제공자 OFF·기존 만료 유지다. 새 통화·유료 호출은 하지 않았다. 과거 요청 로그는 권한 부족(403)으로 확인하지 못했다. [세부 경계](../KNOWN-LIMITATIONS.md#2026-11-06-deepgram분석-후속-점검)와 [반영·롤백 절차](../RUNBOOK.md#deepgram-opt-out-수정본-반영-대기-2026-11-06)를 따른다.

2026-11-06 16:41 후속: case30은 실제 업무 생성 뒤 미디어 시험 시작 중 시험 브라우저의 잘못된 Compose project/lifecycle 조합으로 지속 감시 소유권 검사가 실패했다. 브라우저 제거 후 상태 조회가 정상화됐고, `resource-stop`으로 소유 서비스21개를 중지했다. 영속 데이터·원본 stop/latch는 보존, 자동 재개·유료 호출 없음. 감시 오류를 비밀 없는 고정 코드로 보존하도록 수정했고 관련 오프라인6건 통과. 기존 개인 요약의 “시험 시작 전 차단”은 실제 업무 생성 기록과 달라 정정한다. [원본과 후속 범위](../../artifacts/demo-ui-20261106/recording-trial-30.json). 이는 당시 상태다. 이후 최신 Recording 파일을 확보하고 사용자 승인으로 같은 만료/한도에서 재개한 결과는 위 현재 근거를 따른다.

18:11 KST 후속: 승인된 case33은 실제 통화·파일 송출 표시·Deepgram ready 뒤 전사0으로 실패했다. OpenAI0요청, STT1연결/서버 정산 경과4초이며 실제 음성 길이·청구액은 미확인. 제공자OFF 복귀·수정 issuer readiness200·활성통화/예약0·trial/세션 정리 확인. 동일 확정 문맥의 partial이 완료 분석을 지우는 결함은 수정·반영했으나 실제 완료 표시까지 PASS가 아니다. 종료 타임라인 관측 누락은 후속 observer에서 보완했고 새 실호출은 승인 대기다. 상세는 기존 진행 기록과 Recording result의 analysisCompletion20261106을 따른다.

2026-11-06 위험 요구 전용 후속: 사용자 핵심 요구와 실제 코드 기준으로 `callsign-risk-2` 프롬프트·근거/정정 계약·서버·수신자 표시·평가 준비를 구현했다. 목적 이탈 LLM 판정은 제외하지만 기관 권한/목적 검증은 유지한다. 코드/오프라인 검사와 runtime 반영·실제 모델 결과는 별개이며, 이번 수정의 실호출/인증 브라우저 확인은 미실행이다. [구현·검증 경계](../FINALS-IMPLEMENTATION-PLAN.md#2026-11-06-risk-only-grounded-analysis-offline-implementation)를 따른다.

## 현재 작업표

| 영역·요구 ID | 구현과 저장된 실행 근거 | 남은 확인 |
|---|---|---|
| 역할별 로그인·업무 API — AUTH-001/002, UI-001~004 | 공개 Vercel에서 기관·상담원·수신자·승인자의 실제 IdP 로그인, 업무 조회, 로그아웃 후 401 확인. 기관 업무 생성과 상담원 생성 거절은 공개 HTTP에서 확인 | 공개 인증 성공을 통화·분석 성공으로 확대하지 않음. 계정은 합성 계정이며 실제 금융기관 고객 연계가 아님 |
| 공개 통화·업무 취소 — MEDIA-001~004, PBX-001~003, CALL-005 | `publicRuntimeFollowup20261106`: 제품 소스 `8ee3b1f`, case18 정상 통화·녹음 송출/마이크 복귀·화면 이동·종료 PASS, case20 기관 취소 API→양측 음성 중단·PBX 부재 PASS | case19 연결 실패는 보존. 서버 호스트의 독립 브라우저·합성 음원이며 외부 단말·사람 마이크·실제 AI는 미확인. case27은 실제 기관 UI에서 새 업무 생성·선택 취소와 서버 상태 반영 PASS(다른 업무 불변). 최신 case31은 업무 생성 전 진입 실패, 실제 통화 시작0·자동 재시도0이다. 별도 승인 case32는 최신 Recording UI로 업무 생성·통화 준비·실제 TURN relay/양방향 음성·화면 이동·기관 UI 취소 PASS. 정리 뒤 활성통화/예약/overdue pending/만료claim0, outbox done200·영수증14. 두 실행을 합쳐 SLA나 일반 성공률로 표현하지 않는다. 진행 통화 중 최신 UI 취소는 case25/26 및 재시작 후 case29의 선행 미디어/인증 조회 오류로 미실행. case29 승인 응답 뒤 PBX 등록 전 `ERR_NETWORK_CHANGED` 재발, 자동 재시도 없이 종료·PBX 부재·활성통화/예약0 확인. 외부 단말 확인은 사용자 보류 |
| 내부 격리 통화·회수 — CALL-005/006 | 같은 호스트의 실제 ServiceCall/PBX와 합성 음원에서 정상 통화·업무 취소·기관 정지·종료를 선택 검증 | 공개망·다른 단말·사람 마이크·모든 실패 조합의 증거가 아님 |
| 음성·분석 — AI-001~005 | 상대 remote track→인증 WS→전사/분석 UI·동의 철회는 내부 fixture 제공자로 검증. 실제 OpenAI 텍스트·Deepgram 직접 합성 음원 호출 기록 별도 존재 | 추가 승인 smoke에서 실제 송신 파일→수신 remote track→Deepgram 전사 수신. 부분/연속 전사에 의한 분석 취소·재요청 결함을 수정했고 관련22시험 PASS. 수정 전후 실제 실패는 별도 보존. STT1연결24초·LLM4요청 사용, 완료 분석 event는20초 안에 미관측하여 FAIL. 원인 미확정·유료 자동 재시도 없음. 다음 한정 승인도 STT1연결13초·LLM4시도 후 분석 미완료. 인증 재조회 네트워크 변경 오류 동반. 최신 수정본 실제 제공자 재검증·청구액·모델 품질은 미확인 |
| 역할별 데모 UI — UI-001~004 | 최신 Recording HTML의 전체 폭 업무 표·필터/검색·흰 상세 drawer와 휴대폰 구성을 실제 컴포넌트에 반영했다. 연락 준비의 순차 승인을 묶고 다중 위임/시도 선택·마이크·발신·분석 동의는 분리했다. 과거 사용자 확인 최종 Refined HTML을 직접 렌더링해 3개 실제 화면에 반영. 선택 업무 파란 강조·흰 상세 drawer·기관/중앙/휴대폰 배치·390px·CSS2배 확대·실제 계정 요약·긴 회수 근거 접기. 인증된 workspace가 제공자 OFF를 알려 신규 분석 동의를 차단 | [최종 UI 근거·캡처](../../artifacts/demo-ui-20261106/refined/result.json). 실제 OIDC 세션 4역할의 공개 업무 조회·화면/상세·로그아웃 확인. 노드 조회503 원인은 issuer의 cursor SELECT 누락: 0011에서 세 열 읽기만 추가하고 공개200·4노드 응답 및 쓰기 권한 없음 확인. 후속 브라우저 인증 표시 timeout 1건은 보존하며 새 세션의 공개 API7종200·화면 재확인은 통과했지만 timeout 원인은 미확정. 생성/취소·오류·계정 경합·audio DOM 유지는 HTTP fixture 회귀이며 새 실제 통화/취소/분석 성공이 아님. 실제 서명 절차·권한 제한은 시안의 역할 전환/합성 성공과 구분 |
| 공동 승인·복구 — GOVERNANCE-001/002 | 고정 관리키 2-of-3, 원장 확정·Witness 확인·키 활성화 코드. 내부 선택 실행에서 정지·공동 복구·새 연락과 구 권한 무효 유지 확인 | 공개 case21 기관 정지·양측 음성 중단 PASS. 독립 2개 서명 제출과 원장 epoch3 확정 기록. 이번 재개에서 승인키2 활성화·trust 게시·새 위임/업무와 양방향 통화 확인. 과거 통화는 재사용하지 않음. 단독 복구 HTTP 400은 EVM 거절 증거가 아님 |
| 백업·복원 — DB-003, OPS-005 | 일반 entrypoint의 암호화 전체 백업, 별도 DB/정지 chain 복원, 현재 Anchor 대조, 복원 후 통화·SQL 감사 기록 | 같은 호스트의 선택 경계. 독립 장애 영역·장기 부하·모든 crash 지점은 미검증 |
| 지속 운영 — OPS-004/006 | 소유 identity·DB/volume 보존, 감시·중단 latch·명시 재개 코드와 중단/재개 기록 | 02:26:19Z 관측 오류 중단 원본 보존. 사용자 승인 후 새 monitor로21개 재개, 기존 만료11월7일08:37 KST 유지. 자동 재기동 없음. 일반 재시작에서 업무·권한·위임·영수증13·journal18·계정6 유지, 활성통화/예약0·outbox done180 확인. 현재 상태는 RUNBOOK status로 재확인 |
| 전달·이전 — OPS-003/007 | 고정 Release/GHCR와 원격 수령 기록 보존 | 과거 이미지가 현재 main/backend/frontend와 같다고 추정하지 않음. AWS 실행·독립 reader는 이번 범위 밖 |

후속 공개 통화 근거: 같은 기동 기록의 `normalPublicCall20261106`은 frontend `20cbd65` / runtime `0a62aef`에서 양방향 합성 음원과 정상 종료를 관측했다. 종료 후 observer가 ended를 failed로 바꾸려 한 원본 FAIL은 유지한다. 별도 읽기 대조의 PBX 부재 PASS는 재실행 성공이 아니다. 실제 제공자 호출은 0회다.

## 실행 근거와 소스 구분

- [공개 인증·미디어 조사](../../artifacts/persistent-idp-start-20261105.json): `publicProductConnection20261106.productionBrowser`의 웹 소스는 `80a6df1`, API runtime 소스는 `0a62aef`다. `publicMediaInvestigation20261106`의 웹은 `2d3d718`, runtime은 `0a62aef`다. 서버 호스트의 독립 브라우저 프로필이 공개 주소를 사용했으며 서로 다른 외부망의 두 단말 시험은 아니다. 파일 상단의 최초 준비 실패/미실행 값은 이 후속 기록으로 덮어쓰지 않는다.
- [내부 통화·복원](../../artifacts/restore-audit-20261105.json): `serviceHardeningFollowup`의 일반/합성 분석 실행과 RESTORE를 구분한다. 앞선 자원 중단·분석/프로세스 실패의 원인 미확정 기록을 후속 PASS로 해결 처리하지 않는다.
- [후보·제공자 기록](../../artifacts/product-candidate-20261104.json): `designHtmlIntegration`의 직접 제공자 호출·비용·품질 한계와 후보별 source/digest를 따른다. 초기 smoke 한도 소진은 추가 호출 허가가 아니다.
- [이전 실제 미디어](../../artifacts/media-final-20261104.json), [전달물 NEW](../../artifacts/delivery-only-rehearsal-20261102.json), [GHCR/Release 수령](../../artifacts/ghcr-delivery-20261102.json)은 각각 당시 소스·환경의 증거다. 현재 main 전체의 PASS나 최신 배포 영수증이 아니다.

기준 main에는 위 실행 이후 미디어 대기·오류 분류 수정이 들어 있다. 저장된 성공 범위를 그 수정 전체로 승계하지 않는다. light CI·타입 검사도 통합·실음성·실제 AI 품질을 대신하지 않는다.

## 시연을 읽는 방법

`/demo/work`는 업무 관리, `/demo/call`은 연락, `/demo/governance`는 공동 관리 작업면이다. `/service`의 역할별 로직과 OIDC callback, `/official`의 별도 인증을 재사용한다. `publicPreview=true` 빌드는 미연결 안내용이며, 공개 주소가 항상 그 모드라는 뜻은 아니다. 실행 전에 build metadata의 SHA·모드와 운영자가 제공한 계정/준비 상태를 확인한다.

준비 입력과 역할별 순서는 [RUNBOOK](../RUNBOOK.md#공개-프런트엔드와-실제-통화-배포-구분), 전체 흐름은 [통화 처리](03-CALL-FLOW.md)를 따른다. 과거 상태의 원문은 [이력 보관본](../archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-06-문서-대조-전-현황-스냅샷), 이번 읽기 전용 리뷰는 [개발 기록](../FINALS-IMPLEMENTATION-PLAN.md#submission-review-20261106)에 연결한다.
