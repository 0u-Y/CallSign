import { expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair } from "jose";
import { readSigningKey } from "./finals-server.js";
const fixture = vi.hoisted(() => ({ value: "" }));
vi.mock("node:fs/promises", () => ({ readFile: async () => fixture.value }));
it("proves the private key actually corresponds to the declared public key", async () => {
  const a = await generateKeyPair("Ed25519", { extractable: true });
  const b = await generateKeyPair("Ed25519", { extractable: true });
  const publicJwk = await exportJWK(a.publicKey), privateJwk = await exportJWK(a.privateKey);
  fixture.value = JSON.stringify({ kid: "did:web:bank.example#key", publicJwk, privateJwk });
  expect((await readSigningKey("memory-only")).publicJwk).toEqual(publicJwk);
  // The public x strings agree, but the secret seed belongs to an unrelated key.
  fixture.value = JSON.stringify({ kid: "did:web:bank.example#key", publicJwk, privateJwk: { ...privateJwk, d: (await exportJWK(b.privateKey)).d } });
  await expect(readSigningKey("memory-only")).rejects.toThrow("KEYPAIR_MISMATCH");
});
