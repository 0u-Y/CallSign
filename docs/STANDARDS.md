# 표준과 적용 범위

2026-10-26 공식 원문 확인. 아래는 CallSign이 채택한 데이터·서명 형식이며 상호운용 인증이나 전체 적합성 시험 통과 주장이 아니다.

| 공식 원문 | 적용 |
|---|---|
| [W3C VC Data Model 2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/) | `@context` credentials/v2, issuer, credentialSubject, validFrom/validUntil, credentialStatus를 갖춘 위임 객체 |
| [Securing VC using JOSE and COSE](https://www.w3.org/TR/2026/REC-vc-jose-cose-20261013/) | JSON VC 자체를 compact JWS payload로 사용. `typ=vc+jwt`, `cty=vc`, `kid`은 등록 기관 키 식별자(기존 직접 통화의 DID 키 식별자와 호환). Ed25519/EdDSA만 허용. SD-JWT/COSE는 구현하지 않음 |
| [DID Core 1.0](https://www.w3.org/TR/2022/REC-did-core-20220719/) | controller·verificationMethod·assertionMethod/authentication의 키 일치 검사. 해석 성공 자체가 기관 신뢰는 아님 |
| [did:web method](https://w3c-ccg.github.io/did-method-web/) | allowlist DID→HTTPS URL 고정, 원격 redirect 금지/2초/32KiB 제한. 이 메서드는 커뮤니티 사양이며 W3C Recommendation이라고 부르지 않음 |
| [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) | JCS UTF-8 bytes의 SHA-256, 소문자 64자 hex. 배열 순서는 의미가 있으며 그대로 유지 |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | 계약의 복구 domain/chain/registry/action을 서명에 결합. 공동 복구 3명 중 2명 승인 |
| [TURN REST 초안](https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00) | 만료시각을 포함한 username과 HMAC-SHA1 단기 credential. 만료된 Internet-Draft이며 정식 RFC로 표현하지 않음 |
| [Deepgram Listen streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) | 서버 전용 Token 인증 WSS, Results의 start/is_final/transcript, KeepAlive. 실제 제공자 호출/한국어 모델 호환은 미검증 |
| [Anthropic Messages](https://platform.claude.com/docs/en/api/beta/messages/create), [인증](https://platform.claude.com/docs/en/manage-claude/authentication) | 서버 전용 Messages HTTP adapter, system과 untrusted user transcript 분리, 도구 미제공·출력 근거 검사. 실제 호출은 미실행 |

`CallSignRegistryStatus`와 사용자 정의 어휘는 프로젝트 전용이다. 기존 직접 통화는 `urn:callsign:v2:`, 등록 주소 기반 서버 확장은 `urn:callsign:delegation:v1:`를 사용한다. 이 문자열의 숫자는 어휘 식별자이며 통화 형식 번호와 별개다. W3C Bitstring Status List를 구현했다고 주장하지 않는다. JSON-LD 문맥은 코드에서 고정하고 원격 context를 다운로드하지 않는다. policyHash는 `PurposePolicy` 전체의 JCS hash, VC digest는 서명 전 VC payload 전체의 JCS hash다. compact JWS 바이트나 JWT header의 hash가 아니다.

로컬 고정 시험 데이터의 `.example`/`.invalid` DID는 사전 등록 문서만 사용한다. 기본 등록 주소 기반 서비스는 소유 HTTPS/등록 기관·키와 새 신뢰 설정를 준비한다. 선택 DID 호환 배포만 소유 도메인 DID 문서를 게시한다. 외부 DID 조회 시험은 후속 단계다.

용어: JOSE는 JSON 서명·암호화 표현 체계, JWS는 그중 서명 형식이다. VC는 업무 위임 증서, DID는 선택 분산 식별자, JCS는 일관된 JSON 직렬화 규칙이다. 표의 실제 header·필드·어휘는 코드와 대조하도록 원문을 유지한다.

2026-10-27 확정 PBX는 Asterisk PJSIP/WSS+ARI다. [공식 SHA-256 SIP 인증](https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/PJSIP-Authentication/)과 [ARI 채널](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Asterisk_REST_Interface/Channels_REST_API/)·[브리지](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Asterisk_REST_Interface/Bridges_REST_API/)를 확인했다. 브라우저 SIP 모듈은 제한된 수신 역할 UAS(User Agent Server) 구현 범위이고 범용 SIP 상호운용 시험·실제 이미지/schema 호환은 미검증이다.
