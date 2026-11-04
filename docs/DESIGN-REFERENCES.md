# 실제 서비스 화면의 참고 패턴

2026-11-04 공식 자료를 읽고 현재 CallSign 캡처/코드와 비교했다. 각 시스템의 패키지·브랜드·전체 레이아웃을 복사하지 않고 기존 토큰과 native HTML을 재사용한다. 설계 비교는 [제품 기준](../PRODUCT.md#실제-업무-화면의-구성-결정-2026-11-04), 실제 화면 검증은 [개발 기록](FINALS-IMPLEMENTATION-PLAN.md)에서 구분한다.

| CallSign 문제 | 공식 패턴 | 적용·제외 |
|---|---|---|
| 선택 연락의 핵심 정보가 흩어짐 | [GOV.UK summary list](https://design-system.service.gov.uk/components/summary-list/) | 이름/값 `dl`로 요약. 업무 목록은 기존 `ul` 유지 |
| 원시 ID와 관리 양식이 과밀 | [GOV.UK details](https://design-system.service.gov.uk/components/details/) | 기술 근거·계정 관리만 접음. 경고·승인·만료·서명 문맥은 기본 표시 |
| 상담원에게 다음 행동이 불명확 | [Twilio Flex task views](https://www.twilio.com/docs/flex/onboarding-guide/explore-the-built-in-flex-ui-views) | 현재 업무와 실제 가능한 통화 행동을 묶음. CRM/다채널 UI는 추가하지 않음 |
| 목록과 선택 업무가 분리됨 | [Cloudscape split view](https://cloudscape.design/patterns/resource-management/view/split-view/) | 선택 업무 요약을 갱신. 상시2열/다중 비교 패널은 모바일 복잡성 때문에 제외 |
| 위험 경고가 아래로 밀림 | [Carbon notifications](https://www.carbondesignsystem.com/building-blocks/core/patterns/notifications) | 현재 유효 경고는 지속 영역, 일반 알림은 별도 펼침. 경고를 toast로 대체하지 않음 |
| 장치 준비와 분석 동의 혼동 | [Google Meet audio check](https://support.google.com/meet/answer/10409699?hl=en) | 기존 사용자 클릭 기반 마이크/PBX 준비와 분석 동의를 구분. 카메라·추가 장치 수집을 도입하지 않음 |
| 위계와 여백 불일치 | [Fluent layout](https://fluent2.microsoft.design/layout)·[typography](https://fluent2.microsoft.design/typography) | 기존 Noto Sans/색을 유지하고 요약·상태·행동의 크기/간격 통일. Fluent 폰트/패키지는 도입하지 않음 |
| 갱신이 포커스를 빼앗을 위험 | [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | 기존 polite live region 유지, 경고/처리 상태를 텍스트로 전달. 반복 polling마다 포커스를 옮기지 않음 |
| 모바일 조작 영역 | [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 기존44px 목표·간격 유지. 최소 기준과 접근성 인증 완료를 혼동하지 않음 |

## 초기 시연 참고 기록

아래는 당시 원본이며 현재 화면 검증 결과가 아니다.

> **2026-09-14의 과거 기록:** 초기 화면 디자인에 사용한 자료이다. 현재 서비스·공개 주소·배포 상태의 재검증 결과가 아니다. 최신 구현·검증은 [현황표](guide/05-IMPLEMENTATION-STATUS.md)를 따른다. 아래 실행 명령은 당시 이력이며 현재 실행 허가가 아니다.

# 화면 설계 참고 자료

확인일: 2026-09-14

- [shadcn/ui](https://github.com/shadcn-ui/ui): button·dialog·tab의 낮은 장식 밀도와 명확한 focus 패턴을 참고했다. 프로젝트에는 block 코드를 복사하지 않고 자체 CSS 토큰으로 재구현했다. MIT.
- [Radix Primitives](https://github.com/radix-ui/primitives): `@radix-ui/react-dialog`의 focus/escape/modal 상호작용을 직접 사용했다. MIT.
- [Lucide](https://github.com/lucide-icons/lucide): `lucide-react` 한 아이콘 계열만 사용해 선 두께를 통일했다. ISC.
- [Noto Sans Korean](https://github.com/notofonts/noto-cjk): `@fontsource/noto-sans-kr` 패키지의 로컬 woff/woff2를 번들해 외부 CDN을 제거했다. SIL Open Font License 1.1.

선택한 시각 개념은 전화 교환대의 패치 경로다. 세 검증 단계를 연결선·노드·짧은 근거로 보여주되, 실제 전화기 OS를 복제하거나 정부 인증 마크처럼 보이는 도상을 쓰지 않았다. 내부에서 생성한 디자인 시안은 방향 검토용이며 제품 이미지로 포함하지 않았다.
