import { describe, expect, it, vi } from "vitest";
import { buildFinalsServer } from "../../services/api/src/finals-server.js";
import { finalsEnvironmentSchema } from "../../services/api/src/finals-config.js";
describe("platform without private keys or database", () => {
  it("forwards authenticated browser context, hides sender context and propagates errors", async () => {
    const env = finalsEnvironmentSchema.parse({ SERVICE_ROLE: "platform", WEB_ORIGIN: "http://localhost:8080", ISSUER_URL: "http://issuer:4101", SENDER_URL: "http://sender:4102", PLATFORM_INTERNAL_TOKEN: "p".repeat(32), INSTITUTION_ID: "mock-bank-institution", NETWORK_ID: "20260914", REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111", TRUST_BUNDLE_PATH: "unused-platform-does-not-read-it" });
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-service-token")).toBe(env.PLATFORM_INTERNAL_TOKEN);
      expect(new Headers(init?.headers).get("cookie")).toBe("ip_session=opaque-cookie");
      return Response.json({ error: { code: "OBJECT_FORBIDDEN" } }, { status: 403 });
    }); vi.stubGlobal("fetch", fetcher);
    const app = await buildFinalsServer(env);
    try {
      const response = await app.inject({ method: "POST", url: "/v2/intents", headers: { cookie: "ip_session=opaque-cookie", origin: env.WEB_ORIGIN, "x-csrf-token": "opaque-csrf" }, payload: { recipientId: "other" } });
      expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe("OBJECT_FORBIDDEN");
      const blocked = await app.inject({ method: "POST", url: "/v2/sender-context", payload: {} }); expect(blocked.statusCode).toBe(404); expect(fetcher).toHaveBeenCalledOnce();
      vi.stubGlobal("fetch", async (url: URL) => Response.json({ status: "alive" }, { status: url.hostname === "sender" ? 503 : 200 }));
      expect((await app.inject({ method: "GET", url: "/readiness" })).statusCode).toBe(503);
    } finally { await app.close(); }
  });
});
