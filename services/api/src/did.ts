import { z } from "zod";
import { parseJsonNoDuplicateKeys, publicKeySchema } from "@callsign/protocol";

const documentSchema = z.object({
  id: z.string(),
  verificationMethod: z.array(z.object({ id: z.string(), controller: z.string(), type: z.literal("JsonWebKey2020"), publicKeyJwk: publicKeySchema }).strict()).max(16),
  assertionMethod: z.array(z.string()).max(16), authentication: z.array(z.string()).max(16),
}).passthrough();
export type DidDocument = z.infer<typeof documentSchema>;
export class DidResolver {
  constructor(private readonly local: Record<string, DidDocument>, private readonly remote: Record<string, string> = {}, private readonly fetcher: typeof fetch = fetch) {}
  async resolve(did: string): Promise<DidDocument> {
    const cached = this.local[did];
    if (cached) return this.validate(cached, did);
    // Explicit DID -> HTTPS URL pins; no user-controlled URL, redirects or discovery.
    const pinned = this.remote[did];
    if (!pinned || !did.startsWith("did:web:")) throw new Error("DID_NOT_TRUSTED");
    const url = new URL(pinned);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) throw new Error("DID_URL_FORBIDDEN");
    const parts = did.slice(8).split(":");
    if (parts.some(part => !/^[a-zA-Z0-9._-]+$/.test(part) || part === "." || part === "..")) throw new Error("DID_METHOD_UNSUPPORTED");
    const expected = `https://${parts[0]}/${parts.length === 1 ? ".well-known/did.json" : `${parts.slice(1).join("/")}/did.json`}`;
    if (url.href !== expected) throw new Error("DID_URL_MISMATCH");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await this.fetcher(url, { redirect: "error", signal: controller.signal, headers: { accept: "application/did+json, application/json" } });
      if (!response.ok || !response.body) throw new Error("DID_RESOLUTION_FAILED");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 32768) throw new Error("DID_DOCUMENT_TOO_LARGE");
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return this.validate(parseJsonNoDuplicateKeys(bytes), did);
    } finally { clearTimeout(timer); }
  }
  private validate(value: unknown, did: string): DidDocument {
    const doc = documentSchema.parse(value);
    if (doc.id !== did || new Set(doc.verificationMethod.map(k => k.id)).size !== doc.verificationMethod.length || doc.verificationMethod.some(k => k.controller !== did || !k.id.startsWith(`${did}#`))) throw new Error("DID_CONTROLLER_MISMATCH");
    return doc;
  }
}
