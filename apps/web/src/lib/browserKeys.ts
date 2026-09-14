import { exportJWK, generateKeyPair, type JWK, type KeyInput } from "jose";

export interface BrowserSigningKey {
  privateKey: KeyInput;
  publicKey: KeyInput;
  publicJwk: JWK;
  kid: string;
}

export async function generateBrowserSigningKey(): Promise<BrowserSigningKey> {
  const pair = await generateKeyPair("Ed25519", { extractable: false });
  const publicJwk = await exportJWK(pair.publicKey);
  const raw = base64urlToBytes(publicJwk.x!);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw.slice().buffer as ArrayBuffer));
  return { ...pair, publicJwk, kid: bytesToBase64url(digest).slice(0, 22) };
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function bytesToBase64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
