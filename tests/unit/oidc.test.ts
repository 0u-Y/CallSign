import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { OidcLoginFlow } from "../../services/api/src/oidc-flow.js";
it("binds code exchange to the original browser state, PKCE verifier, nonce and separate official client", async () => {
  let submitted = new URLSearchParams(); const fetcher = vi.fn(async (_url, init) => { submitted = new URLSearchParams(String(init?.body)); return Response.json({ id_token: "fixture-id-token" }); }) as typeof fetch;
  const flow = new OidcLoginFlow({ authorizationUrl: "https://id.example/authorize", tokenUrl: "https://id.example/token", redirectUri: "https://callsign.example/finals", clientId: "work-client", officialClientId: "official-client", fetcher });
  const start = flow.begin(true); const url = new URL(start.url); expect(url.searchParams.get("client_id")).toBe("official-client");
  await expect(flow.finish(start.state,"another-browser","code")).rejects.toThrow("OIDC_STATE_INVALID");
  const result = await flow.finish(start.state,start.state,"code");
  expect(result.official).toBe(true); expect(result.expectedNonce).toBe(url.searchParams.get("nonce"));
  expect(createHash("sha256").update(submitted.get("code_verifier")!).digest("base64url")).toBe(url.searchParams.get("code_challenge"));
  await expect(flow.finish(start.state,start.state,"code")).rejects.toThrow("OIDC_STATE_INVALID");
});

it("keeps provider outages separate from rejected authorization codes", async () => {
  for (const status of [400, 401, 429, 503]) {
    const flow = new OidcLoginFlow({ authorizationUrl: "https://id.example/authorize", tokenUrl: "https://id.example/token", redirectUri: "https://callsign.example/service", clientId: "work", officialClientId: "official", fetcher: async () => new Response("{}", {status}) });
    const start = flow.begin(false);
    await expect(flow.finish(start.state,start.state,"code")).rejects.toThrow(status === 400 || status === 401 ? "OIDC_CODE_EXCHANGE_FAILED" : "OIDC_PROVIDER_UNAVAILABLE");
  }
});
