# 05. 구현 및 검증 현황

## 현재 작업표

| 요구사항 | 현재 구현 | 실행 근거 | 남은 작업 | 완료 조건 | 차단 입력 |
|---|---|---|---|---|---|
| UI-001/006 역할별 업무·공식 확인 | 실제 업무/API·공식 조회 상태와 독립 통화 종료 | [HTTP·실제 역할별 캡처](../../artifacts/service-hardening-20261105/result.json) | 공개 frontend 후속 모바일/확대 확인 | 최신 원격 화면 상호작용 검토 | 원격 브라우저 RSS 중단 후 새 실행 범위 |
| CALL-005/006·AI-001/005 | ServiceCall/remote track·동의·정책 결합 | [최신 일반/합성 분석 경로](../../artifacts/restore-audit-20261105.json)의 serviceHardeningFollowup | 이전 분석/프로세스 실패의 원인 미확정 | 재발 시 보존한 exit·WS·lease 관측으로 원인 확인 | 미재현 원인을 추정 확정하지 않음 |
| OPS-004 복원·DB 감사 | 일관된 암호화 백업·별도 DB/chain 복원·독립 Anchor | 같은 기록의 restore: 전체 RESTORE·복원 후 통화·원본/대상 SQL 감사 PASS | 별도 장애 영역 운영 검증 | 실제 AWS 저장소/Anchor 배치와 복구 | AWS 환경 |
| OPS-006/007 전달·AWS | 고정 Release/GHCR·입력 검사·NEW/재개/RESTORE | [후보 대응](../../artifacts/product-candidate-20261104.json) | 공개 묶음 원격 수령·별도 reader | digest·checksum·source 대응 및 reader 수령 | 독립 reader, AWS 환경 입력 |
| AI-003 실제 제공자 평가 | 동의/취소·오류·quota·숫자 예산 선검사 | 합성 제어 흐름; 실제 제공자 호출0 | 사람 검토 한국어 입력·실제 평가 | 텍스트/음성·품질/제어 흐름 분리 | 제공자·모델·보호 참조·비용·입력 허가 |

일반 entrypoint/분석 미사용 복원 계획의4통화와 별도 합성 분석 계획의3통화는 각각 PASS다. 원본과 복원 대상 DB를 삭제 전에 read-only 감사했다. 과거5회 정상 반복·이전4개 사례·이번 진단 재실행을 합쳐 성공률을 만들지 않는다. 단독 복구400은 HTTP schema 거절이고 이번 EVM 정족수 거절 증거는 아니다.

실제 authenticated390px·데스크톱과 통화 화면을 열어 검토했다. Vercel 공개 frontend는 최신 main의 API 미연결 화면이며 실제 로그인/통화 backend는 없다. 후속 원격 브라우저는 전체 시험의 host1GiB를 적용하다1.20GiB에서 중단했다. UI3GiB로 소급 PASS하거나 자동 재시작하지 않았다. 부분 데스크톱 캡처와 HTTP 검증, 이전 UI 모바일 검증을 구분한다.

이 표는 SLA나 모든 장애 조합의 보장이 아니다. 과거 분석 중단/PBX 종료·누락 baseline의 원인 미확정은 유지하며, 현재 equal baseline으로 과거 상태를 입증하지 않는다. 원본은 위 기록 및 [이전 미디어 결과](../../artifacts/media-final-20261104.json)를 따른다.

[서비스 가이드](README.md) · [신뢰·보안](04-TRUST-AND-SECURITY.md) · [알려진 한계](../KNOWN-LIMITATIONS.md)

기본 제품은 `/service` → `/v3`, 별도 공식 확인은 `/official`입니다. 아래의 이전 초기 미디어 후보는6e3cd23이며 후속 후보·실행 기록과 구분합니다. 현재 상태의 근거는 [제품 후보 실행 기록](../FINALS-IMPLEMENTATION-PLAN.md#product-runtime-20261104)과 [원본 결과](../../artifacts/product-runtime-validation-20261104.json)입니다. 시험 개수로 완성률을 계산하지 않습니다.

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

[RUNBOOK의 고정 전달 기준](../RUNBOOK.md#github-delivery-20261102)과 최신 후보 기록의 source/digest·원격 수령 판정을 함께 사용합니다. 게시용 인증과 AWS reader 인증을 분리합니다.

AWS 위치/예산·도메인/TLS·OIDC·역할별 보호 참조·reader 권한은 [입력 계약](../RUNBOOK.md#aws-input-contract)을 따릅니다. AWS NEW가 만든 계약 metadata·공개 trust·PBX 인증서 뒤에 최종 웹을 생성합니다. 생성될 계약 주소·genesis hash·trust pin을 미리 요구하지 않습니다. 개발 서버는 runtime 의존성이 아닙니다.

[NEW·재개·RESTORE](../RUNBOOK.md#aws-competition)를 구별하고 키·genesis·epoch·소비 이력·Anchor를 초기화해 재개하지 않습니다. 외부 제공자·AWS 검증과 코드 미구현은 [알려진 한계](../KNOWN-LIMITATIONS.md), 요구 ID·완료 조건은 [MASTER](../MASTER-DEVELOPMENT-SPEC.md)를 따릅니다.
