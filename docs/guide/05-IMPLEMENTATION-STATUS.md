# 05. 구현 및 검증 현황

확인일 **2026-11-06(KST)** · 공개 frontend·local/remote main 확인 **`1036a1af9b182ca6e200c3cc0c932ee5c633ecac`** · 역할별 UI 소스 **`e52b565`**. 실행 기록과 소스 검토, 격리 frontend fixture 검증을 구분한다. 이 UI 세션은 지속 backend·공개 통화·제공자를 실행하지 않았다. 공개 metadata는 위 SHA·`publicPreview=false`이며 두 데모 경로 HTTP 200과 해당 CI 성공을 확인했다. **지속 backend는 관측 오류로 중지된 상태이며 현재 로그인·통화 시연은 불가능하다.**

현재 목표는 **서버컴의 전용 지속 데모**다. Vercel frontend·서버컴 backend/인프라·외부 Deepgram/OpenAI 배치를 사용한다. AWS 운영·학교 서버 비의존 요구는 이번 완료 조건에서 제외한다. 실행 상태는 이 표 한 곳에서 관리하고, 기동·중지·보존 조건은 [RUNBOOK](../RUNBOOK.md#지속-서비스와-시험-환경의-분리), 제품 제약은 [알려진 한계](../KNOWN-LIMITATIONS.md)를 따른다.

## 현재 작업표

| 영역·요구 ID | 구현과 저장된 실행 근거 | 남은 확인 |
|---|---|---|
| 역할별 로그인·업무 API — AUTH-001/002, UI-001~004 | 공개 Vercel에서 기관·상담원·수신자·승인자의 실제 IdP 로그인, 업무 조회, 로그아웃 후 401 확인. 기관 업무 생성과 상담원 생성 거절은 공개 HTTP에서 확인 | 공개 인증 성공을 통화·분석 성공으로 확대하지 않음. 계정은 합성 계정이며 실제 금융기관 고객 연계가 아님 |
| 공개 통화·업무 취소 — MEDIA-001~004, PBX-001~003, CALL-005 | `publicRuntimeFollowup20261106`: 제품 소스 `8ee3b1f`, case18 정상 통화·녹음 송출/마이크 복귀·화면 이동·종료 PASS, case20 기관 취소 API→양측 음성 중단·PBX 부재 PASS | case19 연결 실패는 보존. 서버 호스트의 독립 브라우저·합성 음원이며 외부 단말·사람 마이크·실제 AI는 미확인. 기관 취소 버튼은 당시 시험 범위 밖 |
| 내부 격리 통화·회수 — CALL-005/006 | 같은 호스트의 실제 ServiceCall/PBX와 합성 음원에서 정상 통화·업무 취소·기관 정지·종료를 선택 검증 | 공개망·다른 단말·사람 마이크·모든 실패 조합의 증거가 아님 |
| 음성·분석 — AI-001~005 | 상대 remote track→인증 WS→전사/분석 UI·동의 철회는 내부 fixture 제공자로 검증. 실제 OpenAI 텍스트·Deepgram 직접 합성 음원 호출 기록 별도 존재 | 실제 공개 통화 음성→STT→규칙/LLM→화면 전체 경로 미확인. 빈 전사·오인식·목적 label 불일치가 있어 모델 품질 PASS 아님 |
| 역할별 데모 UI — UI-001~004 | `/demo/work` 업무·위임 관리, `/demo/call` 상담원/수신자 제어·중앙 근거, `/demo/governance` 독립 서명·노드/적용 관측. R2~R4 수정. [격리 UI 회귀·캡처](../../artifacts/demo-ui-20261106/result.json) | fixture는 실제 backend 쓰기·현재 공개 음성/분석 성공의 증거가 아님. 계정 표시 이름·위임 상세 유효기간은 현재 목록 응답에 없어 임의 생성하지 않음 |
| 공동 승인·복구 — GOVERNANCE-001/002 | 고정 관리키 2-of-3, 원장 확정·Witness 확인·키 활성화 코드. 내부 선택 실행에서 정지·공동 복구·새 연락과 구 권한 무효 유지 확인 | 공개 case21 기관 정지·양측 음성 중단 PASS. 독립 2개 서명 제출과 원장 epoch3 확정 기록. 새 승인키 활성화·trust 게시·새 위임/연락은 미실행. 단독 복구 HTTP 400은 EVM 거절 증거가 아님 |
| 백업·복원 — DB-003, OPS-005 | 일반 entrypoint의 암호화 전체 백업, 별도 DB/정지 chain 복원, 현재 Anchor 대조, 복원 후 통화·SQL 감사 기록 | 같은 호스트의 선택 경계. 독립 장애 영역·장기 부하·모든 crash 지점은 미검증 |
| 지속 운영 — OPS-004/006 | 소유 identity·DB/volume 보존, 감시·중단 latch·명시 재개 코드와 중단/재개 기록 | 최신 저장 기록은 2026-11-06 02:26:19Z container-memory 관측 오류로 중단. 원인 미확정·자동 재개 금지. 읽기 전용 Docker 조회에서 소유 지속 서비스 실행 0개 확인. 원본 중단·데이터 보존, 재가동 1회 승인 대기. 기존 만료 11월 7일 08:37 KST 유지 |
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
