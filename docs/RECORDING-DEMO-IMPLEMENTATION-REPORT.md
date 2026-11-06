# CallSign 실제 동작 기반 촬영 데모 개선 결과

확인일: 2026-11-07 (Asia/Seoul)  
공개 주소: https://callsign-rouge.vercel.app/demo/call  
배포 SHA: `42e3a898d66f14b8693da3ae910c1a3f7854edf0` (`/build-meta.json`, production, `publicPreview=false`)  
소스: `scripts/prepare-recording-session.mjs`, `package.json`, `docs/RUNBOOK.md`  
디자인 기준: `docs/CallSign_Recording_Demo_v26.html` 파일 존재 확인. 이번 변경에서 v26의 시각·동작 전체를 제품에 옮기지는 않았다.

## 촬영자가 사용하는 방법

촬영할 **노트북**에 Node 22, 저장소의 설치된 pnpm 의존성·Chromium, 소유자만 읽을 수 있는 보호 합성 계정 파일이 필요하다. 다음 명령을 로컬에서 실행한다.

```bash
CALLSIGN_RECORDING_PREP_ENABLED=1 pnpm demo:prepare --credentials /private/path/login-credentials.protected.json
```

열리는 **CallSign 촬영 준비** 창에서 **촬영 세션 준비**를 누른다. 도구는 기존 OIDC 로그인 폼을 사용해 기관·상담원·수신자를 서로 다른 영속 Chromium 프로필에 로그인한다. 유효한 세션은 재사용한다. 기관 창은 `/demo/work`, 상담원·수신자 창은 `/demo/call`로 열고, 두 통화 창에 **동일한 진행 중 업무**를 선택한다. 상담원의 `연락 준비` 버튼이 활성인지 확인한 뒤에만 준비 완료로 표시한다. 만료·연결 실패 시 같은 창에서 다시 준비할 수 있다.

역할별 프로필은 `.local/recording-browser-profiles/{institution,gateway,recipient}`에 보관한다. 이 폴더와 계정 파일은 보호 자료다. 촬영자 노트북이 아닌 서버에서 실행해도 노트북의 쿠키·마이크 권한은 준비되지 않는다. 일반 방문자에게 관리자 세션을 발급하는 공개 endpoint는 추가하지 않았다. 계정 비밀번호·접근 코드·세션 토큰은 웹 bundle이나 URL에 넣지 않았다. 공동 승인자의 독립 서명 절차는 별도다.

준비 버튼은 로그인·조회·업무 **선택**만 수행한다. 발신, 마이크 권한 요청, 분석 동의, 유료 제공자 호출, 기관 정지·복구, 위임 발급은 자동으로 실행하지 않는다. Space/F/Escape와 실제 촬영 버튼은 각 역할의 제품 화면에서 사용한다.

## 실제 확인 결과

| 항목 | 결과 |
|---|---|
| 배포 | 공개 `/build-meta.json`이 최종 SHA를 반환했다. 일반 push와 Vercel 반영을 확인했다. |
| 필수 CI | 최종 SHA의 GitHub Actions `light` 성공. 이전 SHA `7d8bfb1`의 `light`도 성공. |
| 빌드·정적 검사 | `pnpm lint`, `pnpm --filter @callsign/web build`, `node --check` 통과. |
| 실제 세션 | 보호된 합성 계정으로 세 역할의 OIDC 폼 로그인, 재실행 시 유효 세션 재사용, 역할별 업무 조회를 확인했다. |
| 격리 | 기관·상담원·수신자가 독립 Chromium 사용자 데이터 디렉터리에서 실행된다. 같은 origin의 탭만 나누는 방식은 사용하지 않는다. |
| 업무 선택 | 상담원과 수신자에게 공통으로 보이는 진행 중 업무 ID를 실제 UI에서 선택했다. 선택 후 두 역할 화면을 캡처해 열어 확인했다. |
| 무인증 접근 | 준비 도구는 로컬 명령이며 명시적 `CALLSIGN_RECORDING_PREP_ENABLED=1`과 보호 파일을 요구한다. 새 공개 세션 발급 endpoint는 없다. |
| 중복 실행 | 준비 버튼은 진행 중 비활성이고 실행 Promise도 공유한다. 준비 과정에서 업무·통화를 생성하는 요청은 없다. 실제 업무/통화 중복 생성 회귀는 실행하지 않았다. |
| 촬영 화면 | 기관 업무 목록과 상담원·수신자 연락 대기 화면을 직접 열어 확인했다. 최신 공개 제품의 실제 통화 중 F/Space/Escape와 종료·철회 표시는 이번에 재검증하지 않았다. |

캡처: [준비 화면](../artifacts/recording-session-prep-20261107/preparation.png), [기관](../artifacts/recording-session-prep-20261107/institution.png), [상담원](../artifacts/recording-session-prep-20261107/gateway.png), [수신자](../artifacts/recording-session-prep-20261107/recipient.png). 캡처에는 비밀번호·토큰·쿠키·인증 코드가 보이지 않는다.

로컬 `pnpm light`는 사용자 미추적 `docs/CallSign_Recording_Demo_v26.html`(약 4.8MB)을 기존 `validationIdentity`가 2MB 파일 상한으로 거절해 7개 검사가 실패했다. 사용자 파일이나 검증 한도를 바꾸지 않았다. 깨끗한 원격 체크아웃의 **필수 CI는 통과**했다. 이는 로컬 실패의 원인을 구분한 것이며 검사를 우회했다는 뜻이 아니다.

## 현재 막힌 지점과 남은 작업

최종 SHA에서 준비 도구를 다시 실행한 결과 **세 역할 로그인과 같은 업무 선택은 성공**했지만, 공개 서버에서 확인한 공통 진행 중 업무의 상담원 `연락 준비` 버튼이 비활성이다. 준비 화면은 `로그인 완료 · 촬영 전 업무·위임 상태 확인 필요`라고 표시하고 점검 명령은 종료 코드 1을 반환한다. 따라서 촬영자가 즉시 실제 발신·분석까지 진행한다는 완료 기준은 아직 충족하지 못했다.

기관 담당자는 기존 보호 계정으로 현재 업무의 콜센터 위임 등록·유효성, 개별 연락 권한, 업무 유효기간을 확인해야 한다. 필요한 실제 권한 변경은 그 시점의 승인 범위에서 실행한 뒤 **다시 준비**를 누른다. 기존 DB·체인·계정·키·업무·영수증을 초기화하거나 대체하지 않는다. 원장·Witness·서비스 적용을 요청 접수만으로 완료 표시하지 않는다.

이번에는 실제 발신·원격 음성→STT→LLM 분석·동의 철회·기관 정지·공동 복구·유료 호출을 실행하지 않았다. 제공자 예산을 새로 승인된 것으로 취급하지 않았다. v26 HTML의 모든 배치·애니메이션을 제품에 옮기거나, 촬영 모드의 운영 조작 전부를 재배치하지도 않았다. 이들은 실제 통화와 권한 변경의 유효한 실행 조건을 확인한 뒤 별도 검증이 필요하다. 기존 제품 화면의 촬영 F, Space, Escape와 오류·OFF 표시는 소스에 존재하지만 이번 배포의 실통화 성공 증거로 삼지 않는다.

코드와 공개 배포는 반영됐고, **현재 촬영 준비의 실제 제한은 업무 위임·권한 상태**다. 다음 행동은 해당 상태의 원인을 기관 권한으로 확인하고, 허가된 업무에서 상담원 `연락 준비`가 활성화되는지 검증하는 것이다.
