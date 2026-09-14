# Design references

확인일: 2026-09-14

- [shadcn/ui](https://github.com/shadcn-ui/ui): button·dialog·tab의 낮은 장식 밀도와 명확한 focus 패턴을 참고했다. 프로젝트에는 block 코드를 복사하지 않고 자체 CSS 토큰으로 재구현했다. MIT.
- [Radix Primitives](https://github.com/radix-ui/primitives): `@radix-ui/react-dialog`의 focus/escape/modal 상호작용을 직접 사용했다. MIT.
- [Lucide](https://github.com/lucide-icons/lucide): `lucide-react` 한 아이콘 계열만 사용해 선 두께를 통일했다. ISC.
- [Noto Sans Korean](https://github.com/notofonts/noto-cjk): `@fontsource/noto-sans-kr` 패키지의 로컬 woff/woff2를 번들해 외부 CDN을 제거했다. SIL Open Font License 1.1.

선택한 시각 개념은 전화 교환대의 패치 경로다. 세 검증 단계를 연결선·노드·짧은 근거로 보여주되, 실제 전화기 OS를 복제하거나 정부 인증 마크처럼 보이는 도상을 쓰지 않았다. `.impeccable/mocks`의 생성 comp는 내부 방향 검토용이고 제품 asset으로 포함하지 않았다.
