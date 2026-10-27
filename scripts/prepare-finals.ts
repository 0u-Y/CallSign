if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "infrastructure") throw new Error("KEY_PROVISIONING_EXECUTION_BLOCKED");
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { keccak256, stringToHex } from "viem";
import { generateEd25519KeyPair, hashCanonical, exportSigningPrivateJwk } from "../packages/protocol/src/index.js";
const [operation, directory, trustOutput] = process.argv.slice(2);
if (!directory || !["keys", "trust"].includes(operation ?? "")) throw new Error("Usage: prepare-finals keys|trust NEW-deployment-directory");
const root = resolve(directory);
const didFor = (name: string) => { const value = process.env[name]; if (!value || !/^did:web:[a-zA-Z0-9.:_-]+$/.test(value)) throw new Error(`${name}_REQUIRED`); return value; };
if (operation === "keys") {
  const issuerDid = didFor("ISSUER_DID"), serviceDid = didFor("SERVICE_DID");
  await mkdir(root, { mode: 0o700 }); // Fails on existing deployment; backup restore is separate.
  const publicKeys: Record<string, unknown> = {};
  for (const [name, did] of [["issuer/approval-v1", issuerDid], ["sender/key", serviceDid], ...[1,2,3,4].map(i => [`witness-keys/witness-${i}`, `did:web:local.invalid:witness-${i}`])]) {
    const key = await generateEd25519KeyPair(); const kid = `${did}#${key.kid}`;
    await mkdir(resolve(root, name!.split("/")[0]!), { recursive: true, mode: 0o700 });
    await writeFile(resolve(root, `${name}.json`), JSON.stringify({ kid, privateJwk: await exportSigningPrivateJwk(key), publicJwk: key.publicJwk }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    publicKeys[name!] = { kid, publicJwk: key.publicJwk };
  }
  await writeFile(resolve(root, "public-manifest.json"), JSON.stringify({ issuerDid, serviceDid, publicKeys }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("New deployment keys prepared. Provision distinct contract approver/admin/stopper keys separately; do not copy local demo keys.");
} else {
  const manifest = JSON.parse(await readFile(resolve(root, "public-manifest.json"), "utf8"));
  const deployment = JSON.parse(await readFile(resolve(root, "deployment.json"), "utf8"));
  if (typeof deployment.networkId !== "string" || !/^\d+$/.test(deployment.networkId) || !/^0x[0-9a-f]{64}$/.test(deployment.genesisHash) || !/^0x[0-9a-fA-F]{40}$/.test(deployment.registryAddress) || !process.env.INSTITUTION_ID || deployment.institutionId?.toLowerCase() !== keccak256(stringToHex(process.env.INSTITUTION_ID))) throw new Error("DEPLOYMENT_CHAIN_REGISTRY_INSTITUTION_METADATA_REQUIRED");
  const approvalKeyVersion = Number(process.env.APPROVAL_KEY_VERSION ?? "1"), serviceKeyVersion = Number(process.env.SERVICE_KEY_VERSION ?? "1");
  if (!Number.isSafeInteger(approvalKeyVersion) || approvalKeyVersion < 1 || !Number.isSafeInteger(serviceKeyVersion) || serviceKeyVersion < 1) throw new Error("INVALID_KEY_VERSION");
  const issuer = manifest.publicKeys[`issuer/approval-v${approvalKeyVersion}`], service = manifest.publicKeys["sender/key"];
  if (!issuer || !service) throw new Error("CURRENT_PUBLIC_KEY_MANIFEST_ENTRY_REQUIRED");
  const didDocuments = Object.fromEntries([[manifest.issuerDid, issuer], [manifest.serviceDid, service]].map(([did, key]) => [did, { "@context": ["https://www.w3.org/ns/did/v1"], id: did, verificationMethod: [{ id: key.kid, type: "JsonWebKey2020", controller: did, publicKeyJwk: key.publicJwk }], assertionMethod: [key.kid], authentication: [key.kid] }]));
  const bundle = { networkId: deployment.networkId, genesisHash: deployment.genesisHash, registryAddress: deployment.registryAddress, policyVersion: "1", witnessThreshold: 3,
    witnessPublicKeys: [1,2,3,4].map(i => ({ witnessId: `witness-${i}`, kid: manifest.publicKeys[`witness-keys/witness-${i}`].kid, jwk: manifest.publicKeys[`witness-keys/witness-${i}`].publicJwk })),
    endpoints: [1,2,3,4].map(i => ({ witnessId: `witness-${i}`, url: `http://witness${i}:${4200+i}` })),
    enrollmentPublicKey: issuer.publicJwk, supportedProtocolVersions: [1,2], didDocuments,
    finals: { issuerDid: manifest.issuerDid, issuerKid: issuer.kid, issuerPublicKey: issuer.publicJwk, serviceDid: manifest.serviceDid, serviceKid: service.kid, servicePublicKey: service.publicJwk, approvalKeyVersion, serviceKeyVersion } };
  const output = trustOutput ? resolve(trustOutput) : resolve(root, "trust/trust-bundle.json");
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`VITE_FINALS_TRUST_SHA256=${hashCanonical(bundle)}`);
}
