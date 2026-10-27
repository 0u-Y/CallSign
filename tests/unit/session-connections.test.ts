import { afterEach, expect, it, vi } from "vitest";
import { SessionConnections } from "../../services/api/src/session-connections.js";
afterEach(() => vi.useRealTimers());
it("revokes every local connection for a logged-out session without affecting another session", async () => {
  vi.useFakeTimers(); const registry = new SessionConnections(); const invalidated = vi.fn(), other = vi.fn();
  registry.watch("work", async () => {}, invalidated); registry.watch("work", async () => {}, invalidated); registry.watch("official", async () => {}, other);
  registry.revoke("work"); registry.revoke("work");
  expect(invalidated).toHaveBeenCalledTimes(2); expect(other).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000); expect(invalidated).toHaveBeenCalledTimes(2);
  registry.close(); expect(other).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("fails closed on expiry, revoked membership or a failed check; does not overlap slow checks", async () => {
  vi.useFakeTimers(); const registry = new SessionConnections(); const invalidated = vi.fn();
  let reject!: (e: Error) => void;
  const check = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  registry.watch("session", check, invalidated, 1000, 10000);
  await vi.advanceTimersByTimeAsync(5000); expect(check).toHaveBeenCalledOnce();
  reject(new Error("SESSION_EXPIRED")); await vi.advanceTimersByTimeAsync(1);
  expect(invalidated).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); registry.close();
});
it("closes a connection when an authorization check hangs", async () => {
  vi.useFakeTimers(); const registry = new SessionConnections(); const invalidated = vi.fn();
  registry.watch("session", () => new Promise<void>(() => {}), invalidated);
  await vi.advanceTimersByTimeAsync(2000);
  expect(invalidated).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); registry.close();
});
it("unregisters closed sockets and ignores a late check failure", async () => {
  vi.useFakeTimers(); const registry = new SessionConnections(); const invalidated = vi.fn();
  let reject!: (e: Error) => void;
  const unwatch = registry.watch("session", () => new Promise<void>((_resolve, fail) => { reject = fail; }), invalidated);
  unwatch(); reject(new Error("LATE")); await vi.advanceTimersByTimeAsync(1); registry.close();
  expect(invalidated).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
