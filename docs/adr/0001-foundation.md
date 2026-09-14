# ADR 0001: 해커톤 데모 기반 구조

- 상태: 채택
- 날짜: 2026-09-14

## 결정

TypeScript ESM pnpm workspace를 사용하고, UI와 검증기를 분리한다. API는 Fastify와 Drizzle/PostgreSQL, 계약은 Solidity/Foundry, 온체인 호출은 viem을 사용한다. P0 상태 검증은 브라우저가 고정 trust bundle의 Ed25519 키로 동일 canonical payload에 대한 서로 다른 3개 witness 서명을 검증하는 프로파일이다.

## 이유

단일 서버의 `verified: true`를 피하고, 서명 객체·시간 정책·권한 상태를 순수 함수로 시험할 수 있다. PostgreSQL unique constraint가 승인서 1회 소비의 authoritative 동시성 경계가 된다. Besu validator와 witness 키·프로세스를 분리해 합의와 상태 증언의 신뢰 가정을 구분한다.

## 의도적으로 하지 않는 것

- P0 witness profile을 네이티브 QBFT light client라고 부르지 않는다.
- API, issuer, gateway가 같은 개인키를 공유하지 않는다.
- UI scenario 이름으로 검증 결과를 결정하지 않는다.
- 외부 공개 URL이나 실제 기관 협력을 가정하지 않는다.
