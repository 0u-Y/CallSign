# 05. 구현 및 검증 현황

최근 [DB 감사·정상5회·복원 시도](../../artifacts/restore-audit-20261105.json)는 이전 통화4건과 별도다. 원본 DB의 실제 종료 전 감사는 PASS이며 전체 RESTORE/복원 대상 감사는 BLOCKED다. 수정한 복원 도구의 실제 재검증은 swap-out 중단 이후 수행하지 않았다. Vercel·별도 reader·실제 AI는 외부 접근/입력이 없으며 AWS 실행은 이번 범위에서 제외됐다.


현재 전달물의 발행 당시 판정은 [후보 기록](../../artifacts/product-candidate-20261104.json), 이후 같은 이미지의 실제 실행은 [후속4개 고유 사례](../../artifacts/media-final-20261104.json)를 기준으로 본다. 정상 반복2회·실제 업무 조회 장애 중 종료·업무 취소·기관 정지·공동 복구를 통과했고 원장/Witness/Anchor/PBX/TURN과 ServiceCall/remote track/인증 WS를 실제 실행했다. OIDC·합성 음원·STT/LLM fixture와 실제 모델 품질은 구분한다. 과거 분석 중단/PBX 종료는 미재현이며 원인 미확정 기록을 유지한다.

현재 화면은 [UI 전용 검증](../../artifacts/service-ui-validation-20261104.json)을 유지하며 연락 목적이 조회 장애 때 사라지던 수정을 [실제 장애 화면](../../artifacts/media-resume-20261104/workspace-outage-fixed.png)으로 확인했다. [390px 실제 경고](../../artifacts/media-resume-20261104/final-recipient-mobile.png)도 직접 검토했다. 최신 RESTORE·복원 대상 DB 감사·독립 reader·Vercel 최신 배포·외부 AI 품질은 미확인이다. 경량 검사나 선택 통화 성공이 이를 대신하지 않는다.

[서비스 가이드](README.md) · [신뢰·보안](04-TRUST-AND-SECURITY.md) · [알려진 한계](../KNOWN-LIMITATIONS.md)

기본 제품은 `/service` → `/v3`, 별도 공식 확인은 `/official`입니다. 아래 실제 미디어 후보의 실행 소스는6e3cd23이며 이후 문서·증거 정리와 구분합니다. 현재 상태의 근거는 [제품 후보 실행 기록](../FINALS-IMPLEMENTATION-PLAN.md#product-runtime-20261104)과 [원본 결과](../../artifacts/product-runtime-validation-20261104.json)입니다. 시험 개수로 완성률을 계산하지 않습니다.

## 이전 실제 미디어 후보에서 확인한 범위

| 영역 | 구현·검증 | 남은 경계 |
|---|---|---|
| 역할별 업무·인증 | 기관/상담원/수신자 안내, 업무·위임·승인, 세션/CSRF·기관 격리·계정 전환·회수 오류 표시를 실제 SQL·HTTP·WS·Chromium에서 선택 검증 | 로컬 OIDC fixture이며 실제 외부 IdP/MFA 아님 |
| 권한 계약·공동 관리 | 실제 Besu4·Witness4에서 긴급 정지·2명 공동 복구·epoch/키 세대 반영, 과거 통화/승인/VC 비활성 유지 확인 | 단독 복구는 HTTP schema에서 거절. 같은 호스트이며 독립 운영·native proof 아님 |
| 승인·소비·lease·통화 | 최신 runtime·제품 ServiceCall에서 서로 다른 합성 음원 양방향 수신/디코딩, 업무 취소·정지 뒤 양측 음성 중단·PBX 부재·추가 lease 거절·quota 정리 확인 | 로컬 TURN relay이며 AWS 외부 NAT·사람 마이크·모든 브라우저/장애 조합 아님 |
| 위험·목적 분석 | 동의 후 remote track→인증 WS→분석→실제 ServiceCall 패널, 철회·정정·늦은 결과 차단. 분석 결과 수신 후 상단 “분석 중” 잔류를 수정 | STT/LLM은 명시적 fixture. 한국어 품질·보관/청구·실제 제공자 취소 미검증 |
| 로컬 배포 후보 | 최신 runtime·공개/observer 묶음·checksum 생성, 일반 issuer entrypoint 확인,5종 인프라 재사용 | 새 GHCR/Release 미게시. AWS 최종 웹 미생성 |

아래 후보 당시 HTTP11·WS17·Chromium9는37개 고유 사례입니다. Chromium 중1개 component host 분석 패널은 실제 ServiceCall 통화 시험과 별개입니다. 초기 중단·선택자 실패·선택 재실행·readiness를 고유 사례에 중복 합산하지 않습니다. 최종 runtime의 통화2사례는 work-cancel·emergency-stop이며 정상 반복 성공률이나 SLA를 뜻하지 않습니다.

## 과거 증거를 사용하는 범위

| 근거 | 당시 확인한 범위 |
|---|---|
| [DB](../../artifacts/local-postgres-result-20261029.json)·[앱 복구](../../artifacts/persistent-recovery-20261030.json)·[백업 경계](../../artifacts/backup-boundaries-20261030.json) | SQL 경합/응답 유실, HTTPS Anchor CAS·재시작, 오래된 백업 차단·별도 cluster 복원. 최신 소스로 전체 재실행한 결과가 아님 |
| [계약](../../artifacts/contract-validation-20261030.json)·[원장 연결](../../artifacts/isolated-runtime-connection-20261101.json) | 로컬 EVM/서명 호환과 실제 원장/API 연결. 같은 호스트 범위 |
| [전달물 NEW 리허설](../../artifacts/delivery-only-rehearsal-20261102.json) | 이전 이미지의 신규 초기화·정책/키 복구·세션 자연 만료·PBX 재시도·장치 오류 선택 경계 |
| [이전 HTTP 통합](../../artifacts/http-pressure-integration-20261103.json) | 분석 종료/quota drain 수정·동일 DB 재실행. 당시 source와 fixture 한계를 따름 |
| [GHCR](../../artifacts/ghcr-images-20261102.json)·[Release 수령](../../artifacts/ghcr-delivery-20261102.json) | 이전 bootstrap6종의 원격 manifest/config/layer 수령. 최신 후보의 게시 영수증이 아님 |

과거 날짜별 본문은 [이력 보관본](../archive/DEVELOPMENT-HISTORY-20261104.md)에 보존합니다. 원본 실패·SHA·시험 결과를 최신 값으로 고치지 않습니다. light CI는 통합 실행·실음성·AWS 검증을 대신하지 않습니다.

## 다음 배포 단계

[RUNBOOK의 고정 전달 기준](../RUNBOOK.md#github-delivery-20261102)은 이전 버전입니다. 최신 후보를 게시할 때 새 runtime registry digest와 새 고유 Release·원격 재수령이 필요합니다. 게시용 인증과 AWS reader 인증을 분리합니다.

AWS 위치/예산·도메인/TLS·OIDC·역할별 보호 참조·reader 권한은 [입력 계약](../RUNBOOK.md#aws-input-contract)을 따릅니다. AWS NEW가 만든 계약 metadata·공개 trust·PBX 인증서 뒤에 최종 웹을 생성합니다. 생성될 계약 주소·genesis hash·trust pin을 미리 요구하지 않습니다. 개발 서버는 runtime 의존성이 아닙니다.

[NEW·재개·RESTORE](../RUNBOOK.md#aws-competition)를 구별하고 키·genesis·epoch·소비 이력·Anchor를 초기화해 재개하지 않습니다. 외부 제공자·AWS 검증과 코드 미구현은 [알려진 한계](../KNOWN-LIMITATIONS.md), 요구 ID·완료 조건은 [MASTER](../MASTER-DEVELOPMENT-SPEC.md)를 따릅니다.
