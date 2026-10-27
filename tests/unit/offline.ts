import net from "node:net";
import dgram from "node:dgram";
import { beforeEach, vi } from "vitest";
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("LIGHT_NETWORK_FORBIDDEN"); }));
  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(() => { throw new Error("LIGHT_TCP_FORBIDDEN"); });
  vi.spyOn(net.Server.prototype, "listen").mockImplementation(() => { throw new Error("LIGHT_SERVER_FORBIDDEN"); });
  vi.spyOn(dgram.Socket.prototype, "send").mockImplementation(() => { throw new Error("LIGHT_UDP_FORBIDDEN"); });
});
