import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class OidcLoginFlow {
  private readonly pending = new Map<string, { verifier: string; nonce: string; official: boolean; expiresAt: number }>();
  constructor(private readonly options: { authorizationUrl: string; tokenUrl: string; redirectUri: string; clientId: string; officialClientId: string; fetcher?: typeof fetch; now?: () => number }) {
    for (const value of [options.authorizationUrl, options.tokenUrl]) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("OIDC_HTTPS_REQUIRED"); }
    if (options.clientId === options.officialClientId) throw new Error("OIDC_SEPARATE_CLIENTS_REQUIRED");
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  begin(official: boolean) {
    for (const [state, entry] of this.pending) if (entry.expiresAt <= this.now()) this.pending.delete(state);
    if (this.pending.size >= 100) throw new Error("OIDC_PENDING_LIMIT");
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url");
    this.pending.set(state, { verifier, nonce, official, expiresAt: this.now() + 300000 });
    const url = new URL(this.options.authorizationUrl);
    for (const [key, value] of Object.entries({ client_id: official ? this.options.officialClientId : this.options.clientId, redirect_uri: this.options.redirectUri, response_type: "code", max_age:"0", prompt:"login", scope: "openid", state, nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") })) url.searchParams.set(key, value);
    return { state, url: url.href };
  }
  async finish(state: string, cookieState: string, code: string) {
    const pending = this.pending.get(state);
    if (!pending || pending.expiresAt <= this.now() || Buffer.byteLength(state) !== Buffer.byteLength(cookieState) || !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState)) || !code || code.length > 8192) throw new Error("OIDC_STATE_INVALID");
    this.pending.delete(state);
    const response = await (this.options.fetcher ?? fetch)(this.options.tokenUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(4000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: this.options.redirectUri, client_id: pending.official ? this.options.officialClientId : this.options.clientId, code_verifier: pending.verifier }) });
    if (!response.ok) throw new Error([400, 401].includes(response.status) ? "OIDC_CODE_EXCHANGE_FAILED" : "OIDC_PROVIDER_UNAVAILABLE");
    const raw = await response.text(); if (raw.length > 32768) throw new Error("OIDC_RESPONSE_TOO_LARGE");
    const result = JSON.parse(raw) as { id_token?: unknown };
    if (typeof result.id_token !== "string" || result.id_token.length > 16384) throw new Error("OIDC_ID_TOKEN_REQUIRED");
    return { idToken: result.id_token, official: pending.official, expectedNonce: pending.nonce };
  }
}
