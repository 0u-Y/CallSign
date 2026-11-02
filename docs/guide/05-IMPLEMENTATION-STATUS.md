# 05. 구현 및 검증 현황

[서비스 가이드](README.md) · 이전: [신뢰·보안](04-TRUST-AND-SECURITY.md) · [알려진 한계](../KNOWN-LIMITATIONS.md)

현재 기본 제품은 `/service` → `/v3`의 등록 URI·Asterisk 통화 경로입니다. 아래 결과는 각 원본에 기록된 소스·환경의 증거이며, 현재 코드 전체나 실제 기관 서비스를 검증했다는 뜻은 아닙니다. 새 변경은 [개발 기록](../FINALS-IMPLEMENTATION-PLAN.md)에 이어 기록합니다.

## 실제 확인한 것과 남은 경계

| 영역 | 구현·실행 근거 | 남아 있는 경계 |
|---|---|---|
| 업무·인증·계정·공동 관리 | 실제 HTTP·세션·CSRF·SQL·Chromium에서 역할/기관 경계, 제안/서명/제출/확정/활성화, 권한 회수·다중 탭·늦은 응답을 선택 검증. [인증 후속](../../artifacts/service-boundaries-20261030.json) | 로그인 제공자는 로컬 OIDC fixture. 실제 IdP/MFA·외부 계정 운영은 미검증 |
| 권한 계약·원장·Witness | 로컬 EVM/TS 서명 호환과 실제 Besu·Witness 연결, 위임·정지 전파를 확인. [계약](../../artifacts/contract-validation-20261030.json), [원장/API 연결](../../artifacts/isolated-runtime-connection-20261101.json) | 같은 호스트의 합성 기관/키. 독립 기관 운영·호스트 장애·native chain proof가 아님 |
| 소비·quota·worker·복구 | 실제 PostgreSQL 독립 연결의 경합·응답 유실, 별도 HTTPS Anchor CAS·재시작·손상/오래된 백업 차단, drain·별도 cluster 앱 복원. [DB](../../artifacts/local-postgres-result-20261029.json), [복구](../../artifacts/persistent-recovery-20261030.json), [백업 경계](../../artifacts/backup-boundaries-20261030.json) | 외부 CAS/DB 분산 원자성·전체 chain archive 복원·독립 호스트/하드웨어 내성을 보장하지 않음 |
| 승인·소비·lease·실제 음성 회수 | 전달물만으로 새 원장/DB/Anchor/PBX/TURN·제품 웹을 초기화하고 양 끝점의 서로 다른 합성 음원을 디코딩. 정책/키 복구·철회·세션 자연 만료·PBX 정리 재시도·장치 오류의 선택 경계 확인. [신규 리허설](../../artifacts/delivery-only-rehearsal-20261102.json) | 로컬 OIDC·합성 계정/음원·같은 namespace의 relay. 실제 사람/외부망 NAT·다른 브라우저·모든 장애 조합이 아님 |
| 동의·전사 수정·위험 안내 | 실제 orchestration/HTTP와 지연·오류 분석 adapter로 동의 철회·세션/revision 변경 후 결과 폐기를 확인. [인증 후속 증거](../../artifacts/service-boundaries-20261030.json) | 외부 STT/LLM은 호출하지 않음. 한국어 음성 품질·정확도·보관/청구·제공자 취소는 미검증 |
| 이미지·배포 자료 전달 | bootstrap6종의 private GHCR 게시·manifest/config/layer 원격 수령과 공개 Release 재수령 확인. [이미지](../../artifacts/ghcr-images-20261102.json), [전달 영수증](../../artifacts/ghcr-delivery-20261102.json) | AWS 최종 웹·별도 GHCR 수령용 읽기 자격·AWS 실제 배포·외부 TLS/IdP/NAT/TURN은 미완료 |

## 대체한 부분을 구분하기

- 초기 HTTP/복구 시험의 원장·binding·분석 fixture는 그 실행에만 적용됩니다. 후속 실제 원장/PBX 실행을 거꾸로 이전 시험의 성공으로 합산하지 않습니다.
- 최신 신규 리허설의 원장·DB·Anchor·worker·PBX/TURN·제품 웹은 실제 구현이며, 인증은 로컬 OIDC 제공자입니다. 합성 음원으로 실제 전달/디코딩을 확인했지만 사람의 실제 마이크를 시험한 결과는 아닙니다.
- 원격 image receipt는 새 저장 경로의 실제 HTTPS bytes 검사입니다. Docker cache 확인·서비스 기동·AWS 성공과 다릅니다.
- light CI는 오프라인 소스·타입·단위 시험입니다. 과거 통합 실행·수동 관측·미실행 항목을 대신하지 않습니다.

## 다음 실행에 필요한 것

배포 기준 버전·digest는 이 문서에 복사하지 않고 [RUNBOOK의 전달 기준](../RUNBOOK.md#github-delivery-20261102)에서 확인합니다. AWS 위치/예산·도메인/TLS·IdP·역할별 보호 참조·reader 권한이 필요하며, 실제 trust/PBX 인증서에 맞춰 최종 웹을 생성해야 합니다. [NEW와 재개/RESTORE](../RUNBOOK.md#aws-competition)는 구별합니다.

외부 제공자·AWS 검증과 코드 미구현은 [알려진 한계](../KNOWN-LIMITATIONS.md)에서 구분합니다. 전체 요구 ID와 완료 조건은 [MASTER](../MASTER-DEVELOPMENT-SPEC.md)이며 시험 개수로 완성률을 계산하지 않습니다.

초기 시청 시연과 직접 통화의 당시 결과·기획·캡처는 [기록 안내](../README.md#기록과-자료)에 보존합니다. 당시 승인/철회 정책·날짜·SHA·결과를 현재 값으로 고치지 않습니다.
