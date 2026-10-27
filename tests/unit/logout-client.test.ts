import { afterEach, beforeEach, expect, it, vi } from "vitest";
let stored: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); stored = new Map([["ip_csrf", "work-csrf"]]);
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
it("uses the official session's CSRF without overwriting it with the work session token", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/me?")) return Response.json({ csrfToken: "official-csrf" });
    expect(new Headers(init?.headers).get("x-csrf-token")).toBe("official-csrf");
    expect(JSON.parse(String(init?.body))).toEqual({ purpose: "official" });
    return Response.json({ loggedOut: true });
  }); vi.stubGlobal("fetch", fetcher);
  const { logoutSession } = await import("../../apps/web/src/lib/api.js");
  await logoutSession("official");
  expect(fetcher).toHaveBeenCalledTimes(2); expect(stored.get("ip_csrf")).toBe("work-csrf");
});
it("clears only work CSRF after the server confirms work logout", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("/me?") ? { csrfToken: "work-csrf" } : { loggedOut: true })));
  const { logoutSession } = await import("../../apps/web/src/lib/api.js");
  await logoutSession("work"); expect(stored.has("ip_csrf")).toBe(false);
});
it("keeps local CSRF when server logout fails instead of pretending the session was revoked", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/me?") ? Response.json({ csrfToken: "work-csrf" }) : Response.json({ error: { code: "DEPENDENCY_UNAVAILABLE" } }, { status: 503 })));
  const { logoutSession } = await import("../../apps/web/src/lib/api.js");
  await expect(logoutSession("work")).rejects.toMatchObject({ status: 503, code: "DEPENDENCY_UNAVAILABLE" });
  expect(stored.get("ip_csrf")).toBe("work-csrf");
});
