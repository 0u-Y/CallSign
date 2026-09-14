import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { exportJWK, generateKeyPair, importJWK, type JWK, type KeyInput } from "jose";
import { createHash } from "node:crypto";

export interface PersistedSigningKey {
  kid: string;
  privateKey: KeyInput;
  publicKey: KeyInput;
  publicJwk: JWK;
}

export async function loadOrCreateSigningKey(path: string): Promise<PersistedSigningKey> {
  try {
    const stored = JSON.parse(await readFile(path, "utf8")) as { kid: string; privateJwk: JWK; publicJwk: JWK };
    return {
      kid: stored.kid,
      privateKey: await importJWK(stored.privateJwk, "EdDSA"),
      publicKey: await importJWK(stored.publicJwk, "EdDSA"),
      publicJwk: stored.publicJwk,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const generated = await generateKeyPair("Ed25519", { extractable: true });
  const privateJwk = await exportJWK(generated.privateKey);
  const publicJwk = await exportJWK(generated.publicKey);
  const kid = createHash("sha256").update(Buffer.from(publicJwk.x!, "base64url")).digest("base64url").slice(0, 22);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ kid, privateJwk, publicJwk }, null, 2)}\n`, { mode: 0o600 });
  return { kid, privateKey: generated.privateKey, publicKey: generated.publicKey, publicJwk };
}
