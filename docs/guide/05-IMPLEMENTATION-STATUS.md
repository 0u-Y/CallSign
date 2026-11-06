# 05. 구현 및 검증 현황

확인일 **2026-11-06(KST)** · 문서 통합 기준 main **`8ee3b1f3bbecf28bd515f5fbe752880ccd4ed0ed`**. 이 표는 해당 SHA에 저장된 실행 기록을 대조한 결과다. 이번 문서 세션에서는 서비스를 조회·기동하거나 통화를 재시험하지 않았다. 실행 환경의 생존 여부와 이후 개발 결과는 별도 확인해야 한다.

현재 목표는 **서버컴의 전용 지속 데모**다. AWS 이전은 후속이다. 실행 상태는 이 표 한 곳에서 관리하고, 기동·중지·보존 조건은 [RUNBOOK](../RUNBOOK.md#지속-서비스와-시험-환경의-분리), 제품 제약은 [알려진 한계](../KNOWN-LIMITATIONS.md)를 따른다.

최종 소스 대조: **`1e6a090dace651c99140b8835597db34a24c8850`**까지 추가된 5개 커밋을 읽었다. 종료 요청 중 검증 차단, 영속 유한 분석 예산, 공동 복구 요청/서명 파일 검토와 통화 UI 축약이 추가됐다. 아래 실행 근거 파일은 그 구간에서 변경되지 않았으므로 공개 통화·AI 성공 판정은 올리지 않았다. 제품 소스는 이 문서 branch에 병합하지 않았다.

## 현재 작업표

| 영역·요구 ID | 구현과 저장된 실행 근거 | 남은 확인 |
|---|---|---|
| 역할별 로그인·업무 API — AUTH-001/002, UI-001~004 | 공개 Vercel에서 기관·상담원·수신자·승인자의 실제 IdP 로그인, 업무 조회, 로그아웃 후 401 확인. 기관 업무 생성과 상담원 생성 거절은 공개 HTTP에서 확인 | 공개 인증 성공을 통화·분석 성공으로 확대하지 않음. 계정은 합성 계정이며 실제 금융기관 고객 연계가 아님 |
| 공개 통화 — MEDIA-001~004, PBX-001~003 | 실제 지속 API·원장·Witness·PBX·TLS TURN 연결. 초기 실패 조사와 후속 정상 통화 기록을 분리 | 후속 normalPublicCall20261106에서 공개 relay의 서로 다른 합성 음원·승인/소비/Lease·페이지 이동·정상 종료 확인. 원래 observer의 종료 후 정리 FAIL은 보존; 독립 외부 단말·사람 마이크는 미확인 |
| 내부 격리 통화·회수 — CALL-005/006 | 같은 호스트의 실제 ServiceCall/PBX와 합성 음원에서 정상 통화·업무 취소·기관 정지·종료를 선택 검증 | 공개망·다른 단말·사람 마이크·모든 실패 조합의 증거가 아님 |
| 음성·분석 — AI-001~005 | 상대 remote track→인증 WS→전사/분석 UI·동의 철회는 내부 fixture 제공자로 검증. 실제 OpenAI 텍스트·Deepgram 직접 합성 음원 호출 기록 별도 존재 | 실제 공개 통화 음성→STT→규칙/LLM→화면 전체 경로 미확인. 빈 전사·오인식·목적 label 불일치가 있어 모델 품질 PASS 아님 |
| 공동 승인·복구 — GOVERNANCE-001/002 | 고정 관리키 2-of-3, 원장 확정·Witness 확인·키 활성화 코드. 내부 선택 실행에서 정지·공동 복구·새 연락과 구 권한 무효 유지 확인 | 현재 공개 지속 환경의 동일 흐름은 미확인. 단독 복구 HTTP 400을 EVM 정족수 거절 증거로 쓰지 않음 |
| 백업·복원 — DB-003, OPS-005 | 일반 entrypoint의 암호화 전체 백업, 별도 DB/정지 chain 복원, 현재 Anchor 대조, 복원 후 통화·SQL 감사 기록 | 같은 호스트의 선택 경계. 독립 장애 영역·장기 부하·모든 crash 지점은 미검증 |
| 지속 운영 — OPS-004/006 | 소유 identity·DB/volume 보존, 감시·중단 latch·명시 재개 코드와 중단/재개 기록 | 24시간 승인 조건은 무기한 운영 허가가 아님. 기록 이후 현재 monitor/서비스 생존은 이 세션에서 확인하지 않음 |
| 전달·이전 — OPS-003/007 | 고정 Release/GHCR와 원격 수령 기록 보존 | 과거 이미지가 현재 main/backend/frontend와 같다고 추정하지 않음. AWS 실행·독립 reader는 후속 |

후속 공개 통화 근거: 같은 기동 기록의 `normalPublicCall20261106`은 frontend `20cbd65` / runtime `0a62aef`에서 양방향 합성 음원과 정상 종료를 관측했다. 종료 후 observer가 ended를 failed로 바꾸려 한 원본 FAIL은 유지한다. 별도 읽기 대조의 PBX 부재 PASS는 재실행 성공이 아니다. 실제 제공자 호출은 0회다.

## 실행 근거와 소스 구분

- [공개 인증·미디어 조사](../../artifacts/persistent-idp-start-20261105.json): `publicProductConnection20261106.productionBrowser`의 웹 소스는 `80a6df1`, API runtime 소스는 `0a62aef`다. `publicMediaInvestigation20261106`의 웹은 `2d3d718`, runtime은 `0a62aef`다. 서버 호스트의 독립 브라우저 프로필이 공개 주소를 사용했으며 서로 다른 외부망의 두 단말 시험은 아니다. 파일 상단의 최초 준비 실패/미실행 값은 이 후속 기록으로 덮어쓰지 않는다.
- [내부 통화·복원](../../artifacts/restore-audit-20261105.json): `serviceHardeningFollowup`의 일반/합성 분석 실행과 RESTORE를 구분한다. 앞선 자원 중단·분석/프로세스 실패의 원인 미확정 기록을 후속 PASS로 해결 처리하지 않는다.
- [후보·제공자 기록](../../artifacts/product-candidate-20261104.json): `designHtmlIntegration`의 직접 제공자 호출·비용·품질 한계와 후보별 source/digest를 따른다. 초기 smoke 한도 소진은 추가 호출 허가가 아니다.
- [이전 실제 미디어](../../artifacts/media-final-20261104.json), [전달물 NEW](../../artifacts/delivery-only-rehearsal-20261102.json), [GHCR/Release 수령](../../artifacts/ghcr-delivery-20261102.json)은 각각 당시 소스·환경의 증거다. 현재 main 전체의 PASS나 최신 배포 영수증이 아니다.

기준 main에는 위 실행 이후 미디어 대기·오류 분류 수정이 들어 있다. 저장된 성공 범위를 그 수정 전체로 승계하지 않는다. light CI·타입 검사도 통합·실음성·실제 AI 품질을 대신하지 않는다.

## 시연을 읽는 방법

`/demo/call`은 연락, `/demo/governance`는 공동 관리 작업면이다. `/service`의 역할별 로직과 OIDC callback, `/official`의 별도 인증을 재사용한다. `publicPreview=true` 빌드는 미연결 안내용이며, 공개 주소가 항상 그 모드라는 뜻은 아니다. 실행 전에 build metadata의 SHA·모드와 운영자가 제공한 계정/준비 상태를 확인한다.

준비 입력과 역할별 순서는 [RUNBOOK](../RUNBOOK.md#공개-프런트엔드와-실제-통화-배포-구분), 전체 흐름은 [통화 처리](03-CALL-FLOW.md)를 따른다. 과거 상태의 원문은 [이력 보관본](../archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-06-문서-대조-전-현황-스냅샷), 이번 읽기 전용 리뷰는 [개발 기록](../FINALS-IMPLEMENTATION-PLAN.md#submission-review-20261106)에 연결한다.
