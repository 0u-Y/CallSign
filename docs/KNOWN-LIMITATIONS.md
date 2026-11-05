# 현재 구현의 한계

## 새 데모 화면 검증 경계

`/demo/call`·`/demo/governance`를 실제 서비스 controller/API에 연결했다. 브라우저 합성 API 응답으로 역할별 배치·탐색·조회 실패 경계를 확인했지만 실제 세션·WebRTC 통화·원장 검증은 아니다. 이후 상단 높이/고급 폼을 축약한 최신 표시의 재캡처는 sustained memory PSI로 차단됐다. 이전 캡처를 최신 화면 승인으로 사용하지 않으며 독립 시각 검토 판정은 recapture다. 두 자원 중단과 fixture 실패를 보존한다. 상세는 [현재 후보](../artifacts/product-candidate-20261104.json)의 persistentServicePreparation.demoUi를 따른다.

## 지속 공개 서비스 준비

현재 Vercel 제품 frontend는 실제 API 미연결이며 지속 backend/사용자 계정을 공개하지 않았다. 기존443은 다른 프로젝트 소유이고 승인된 CallSign 공개 TLS/WSS·UDP 경로·OIDC가 없으며, 지속 감시·중단 범위과 전체40GiB 시작 조건도 충족하지 못했다. 기존 네트워크를 바꾸지 않는 지속 launcher/외부 미디어는 아직 실행 검증하지 않았다. [현재 근거](../artifacts/product-candidate-20261104.json)의 persistentServicePreparation을 따른다.

OpenAI·Deepgram 키는 명시적 보호 파일로 제공돼 서버 로딩을 확인했다. OpenAI adapter/공통 취소·근거·quota 처리를 구현하고 첫 smoke $0.10 계획은 승인됐다. 동의한 음성/전사 입력은 별도 제공 예정으로 실제 호출0이다. 실제 모델 품질·계정 사용 가능성·보관/청구·지속 운영 비용 조건을 확인했다고 쓰지 않는다. 새 제품의 이전 이미지 통합 PASS 전용은 금지한다.

새 UI-only 원격 브라우저에서 공개 데스크톱/390px·CSS2배 확대와 focus를 확인하고 캡처를 열어 검토했다. 이는 공개 로그인·통화 검증이 아니다. 과거1GiB 자원 중단과 새 승인 실행은 별도 기록이다.

## 2026-11-05 현재 검증 경계

[최신 감사·복원](../artifacts/restore-audit-20261105.json)의 serviceHardeningFollowup은 일반 entrypoint에서 암호화 전체 백업, 별도 DB/정지 chain 상태 복원, live Anchor 대조, 복원 후 새 통화와 원본/대상 DB 감사를 통과했다. 다른 binding 재사용·오래된 백업/현재 Anchor·잘못된 키·누락 metadata 거절도 확인했다. 같은 호스트·한 기관의 선택 경로이며 독립 장애 영역이나 모든 복구 조합의 보장은 아니다.

별도 합성 분석3통화는 실제 ServiceCall·음성·WS·동의 철회·업무 취소·기관 정지/공동 복구를 통과했다. 최초 JSON 성공/프로세스 비정상 종료와 목적 이탈 배지 미표시 실패는 보존하며 원인은 미확정이다. 이후 통과를 그 실패의 해결 증거로 바꾸지 않는다. 과거 누락 interface baseline도 미확인이다.

[최신 UI 캡처](../artifacts/service-hardening-20261105/result.json)는 인증된 역할별 실제 화면과 별도 공개 frontend를 구분한다. 원격 브라우저 후속 확인은 host1GiB 적용 중1.20GiB에서 자원 중단했다. 당시 최신 원격 모바일/확대는 미완료였고 자동 재기동하지 않았다. 이후 새 승인 UI-only 결과는 위 후속 기록을 따른다. Vercel API 미연결, 독립 reader·실제 AI·AWS 입력 부족은 남아 있다.

## 이전 후보의 실제 실행 한계 (2026-11-04)

현재 runtime59b4379는 후속 승인 batch에서 정상 반복2회·조회 장애 중 종료·work-cancel·emergency-stop·실제 공동 복구를 확인했다. [이번 실행](../artifacts/media-final-20261104.json)은 이전 분석 중단/PBX 종료를 재현하지 못했으며 그 원인은 여전히 미확정이다. 과거 exit code/컨테이너 로그 누락을 이후 관측 보완으로 소급 해소하지 않는다. 당시 미실행이던 RESTORE/DB 감사는 위 후속 기록을 따른다. 소표본 안정성/부하·독립 AWS reader·외부 AI 품질은 미확인이다.


확인한 경로와 실행 소스는 [구현·검증 현황](guide/05-IMPLEMENTATION-STATUS.md), 실패와 당시 조건은 [개발 기록](FINALS-IMPLEMENTATION-PLAN.md)에서 관리한다. 이 문서는 현재 남은 제약만 설명한다. 과거 NOT_RUN·swap 중단·이전 후보 결과를 최신 상태로 해석하지 않는다.

## 제출 후보와 외부 환경

- [현재 후보](../artifacts/product-candidate-20261104.json)의 serviceHardeningFollowup은 새 runtime/공개 묶음의 게시·원격 수령과 선택 RESTORE/미디어를 연결한다. AWS·독립 reader·실제 모델 품질·일반 신뢰도 완료판은 아니다. 이전 발행/실행 판정과 원인 미확정 실패는 보존한다.
- [재설계 UI](../artifacts/service-redesign-20261104.json)·[역할별 실제 UI 실행](../artifacts/service-ui-validation-20261104.json)과 새 runtime의 정상 통화 화면을 구분한다. Vercel 공개 frontend는 후속 재배포에서 최신 소스의 경로·정적 자원·JSON metadata를 HTTP로 확인했다([배포 근거](../artifacts/product-candidate-20261104.json)의 `vercelRedeployment`). 이번 재배포의 브라우저 상호작용은 미실행이며 공개 frontend는 API 미연결 상태다.
- 새59b4379 이미지의 실제 조회 장애 중 종료·work-cancel·emergency-stop·공동 복구는 후속 batch에서 별도로 확인했다. 정상 반복 성공률·부하/SLA·모든 장애 조합은 미검증이다. 단독 복구400은 HTTP schema 거절이며 이번 EVM 정족수 거절 증거가 아니다.
- 로컬 OIDC/STT/LLM은 명시적 fixture다. 실제 IdP/MFA, 한국어 STT/분석 품질, 제공자 보관·청구·취소 동작은 미검증이다. 합성30사례는 사람 미검토 상태다. 원격 수신 오디오만 사용하므로 고객 앞선 발언을 알 수 없고 문맥 부족에 판단 불가를 허용한다.
- AWS 리전/예산·공개 origin/TLS/OIDC·PBX/TURN 공개 주소·영속 저장소·독립 Anchor 배치·별도 GHCR reader가 필요하다. [입력 계약](RUNBOOK.md#aws-input-contract)을 따른다. 계약 주소·genesis hash·trust pin은 NEW 산출물이다.
- AWS 최종 웹은 실제 metadata/trust/PBX 인증서 뒤에 생성한다. 로컬 시험 웹·bootstrap 전달을 AWS 배포 완료로 표시하지 않는다. Vercel은 현재 공개 preview 설정이며 실제 AWS 인증/통화 연결을 확인하지 않았다.
- 같은 호스트/namespace의 Besu4·Witness4·TURN은 독립 기관 운영·호스트 장애·외부 NAT 통과의 증거가 아니다. 40GiB 시작/24GiB 관측 예산과5초 표본 최대는 이번 실행 정책·관측이며 최소 사양이나 peak가 아니다.

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
