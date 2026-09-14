import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const deployment = JSON.parse(await readFile(resolve(root, ".local/deployment.json"), "utf8")) as { networkId: string; genesisHash: string; registryAddress: string };
const enrollment = JSON.parse(await readFile(resolve(root, ".local/test-keys/enrollment-ed25519.json"), "utf8")) as { kid: string; publicJwk: unknown };
const witnessPublicKeys = await Promise.all([1, 2, 3, 4].map(async (index) => {
  const witnessId = `witness-${index}`;
  const value = JSON.parse(await readFile(resolve(root, `.local/witness-public/${witnessId}.json`), "utf8")) as { kid: string; publicJwk: unknown };
  return { witnessId, kid: value.kid, jwk: value.publicJwk };
}));
const trust = {
  networkId: deployment.networkId, genesisHash: deployment.genesisHash, registryAddress: deployment.registryAddress,
  policyVersion: "1", witnessThreshold: 3, witnessPublicKeys,
  enrollmentPublicKey: enrollment.publicJwk, enrollmentKid: enrollment.kid, supportedProtocolVersions: [1],
};
const output = resolve(root, "apps/web/src/generated/trust-bundle.json");
await mkdir(resolve(root, "apps/web/src/generated"), { recursive: true });
await writeFile(output, `${JSON.stringify(trust, null, 2)}\n`);
console.log(JSON.stringify({ output, registryAddress: trust.registryAddress, witnesses: trust.witnessPublicKeys.length }));
