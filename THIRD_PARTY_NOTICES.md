# Third-party notices

JavaScript 의존성의 정확한 버전은 `pnpm-lock.yaml` 및 `package.json`이 기준이다. Besu·PostgreSQL·Asterisk·coturn·nginx 등 별도 이미지의 provenance는 [배포 inventory와 절차](docs/RUNBOOK.md#github-delivery-20261102), 공급 고지는 해당 이미지/원본의 LICENSE를 확인한다. 이 고지 목록은 프로젝트 자체의 LICENSE를 부여하지 않는다.

- Radix UI Primitives, Copyright WorkOS, MIT License
- Lucide, Copyright Lucide Contributors, ISC License
- Noto Sans CJK/Korean, Copyright 2012 Google Inc., SIL Open Font License 1.1
- shadcn/ui는 MIT 기반 디자인 참고 자료로만 확인했으며 해당 저장소의 block 코드를 복사하지 않았다.
- OpenZeppelin Contracts, Copyright OpenZeppelin, MIT License
- Hyperledger Besu, Hyperledger Foundation, Apache License 2.0
- React, Vite, Fastify, Drizzle, viem, jose, Zod, Playwright 등은 각 패키지 메타데이터의 오픈소스 라이선스를 따른다.

`local-runtime` 오프라인 이미지에는 설치된 Node·Corepack/pnpm과 GNU 공유 library를 복사한다. 원본 고지문은 이미지의 `/opt/local-runtime/licenses/NODE-LICENSE`, `libstdc++-copyright`, `libgcc-copyright`와 각 패키지 LICENSE에 함께 보존한다. 이 target의 공급 소스·이미지/파일 hash는 runtime 전달 기록에서 구분한다.
