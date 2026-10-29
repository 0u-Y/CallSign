
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { resolve, dirname } from "node:path";
import { keccak256, stringToHex } from "viem";
import { generateEd25519KeyPair, hashCanonical, exportSigningPrivateJwk, registeredUriSchema, runtimePolicySchema } from "../packages/protocol/src/index.js";
const apply=process.argv.includes("--apply");
const [operation, directory, trustOutput] = process.argv.slice(2).filter(a=>a!=="--apply"&&a!=="--dry-run");
if (!directory || !["keys", "trust", "approval-key", "service-key"].includes(operation ?? "")) throw new Error("Usage: prepare-finals keys|trust NEW-deployment-directory");
const root = resolve(directory);
if(!apply){console.log(JSON.stringify({mode:'dry-run',operation,directory,output:trustOutput??null,requires:operation==='keys'?['ISSUER_URI','SERVICE_URI','NEW empty directory; separate management keys']:operation==='trust'?['public-manifest.json or PUBLIC_MANIFEST_PATH','deployment.json','current SERVICE_POLICY_VERSION','public PBX_DTLS_CERT_PATH']:['existing public manifest','APPROVAL_KEY_VERSION or SERVICE_KEY_VERSION > 1','new key filename and new public manifest output; never auto-activate'],next:'Review inputs and use --apply only after explicit infrastructure authorization. Existing directories/files are never regenerated.'}));process.exit(0);}
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=="infrastructure")throw new Error("KEY_PROVISIONING_EXECUTION_BLOCKED");
if (operation === "keys") {
  const issuerDid = registeredUriSchema.parse(process.env.ISSUER_URI??process.env.ISSUER_DID), serviceDid = registeredUriSchema.parse(process.env.SERVICE_URI??process.env.SERVICE_DID);
  if(issuerDid.length>160||serviceDid.length>160)throw new Error("REGISTERED_URI_TOO_LONG_FOR_KEY_ID");
  await mkdir(root, { mode: 0o700 }); // Fails on existing deployment; backup restore is separate.
  const progressPath=resolve(root,"preparation-state.json"),completed:string[]=[];
  const progress=()=>writeFile(progressPath,JSON.stringify({operation:"keys",status:"in-progress",completed,recovery:"Keep this directory; inspect completed filenames and key ownership. Do not regenerate/overwrite on retry."},null,2)+"\n",{mode:0o600});
  await writeFile(progressPath,JSON.stringify({operation:"keys",status:"in-progress",completed})+"\n",{flag:"wx",mode:0o600});
  const publicKeys: Record<string, unknown> = {};
  for (const [name, did] of [["issuer/approval-v1", issuerDid], ["sender/key", serviceDid], ["pbx/evidence", `${issuerDid}/pbx`], ...[1,2,3,4].map(i => [`witness-keys/witness-${i}`, `urn:callsign:witness:${i}`])]) {
    const key = await generateEd25519KeyPair(); const kid = `${did}#${key.kid}`;
    await mkdir(resolve(root, name!.split("/")[0]!), { recursive: true, mode: 0o700 });
    await writeFile(resolve(root, `${name}.json`), JSON.stringify({ kid, privateJwk: await exportSigningPrivateJwk(key), publicJwk: key.publicJwk }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    publicKeys[name!] = { kid, publicJwk: key.publicJwk };completed.push(`${name}.json`);await progress();
  }
  await writeFile(resolve(root, "public-manifest.json"), JSON.stringify({ institutionUri:issuerDid, serviceUri:serviceDid, ...(issuerDid.startsWith("did:")&&serviceDid.startsWith("did:")?{issuerDid,serviceDid}:{}), publicKeys }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(progressPath,JSON.stringify({operation:"keys",status:"complete",completed:[...completed,"public-manifest.json"]},null,2)+"\n",{mode:0o600});
  console.log("New deployment keys prepared. Provision distinct contract approver/admin/stopper keys separately; do not copy local demo keys.");
} else if(operation==='approval-key'||operation==='service-key') {
  const source=process.env.PUBLIC_MANIFEST_PATH??resolve(root,'public-manifest.json'),manifest=JSON.parse(await readFile(source,'utf8')),approval=operation==='approval-key',version=Number(process.env[approval?'APPROVAL_KEY_VERSION':'SERVICE_KEY_VERSION']);
  if(!Number.isSafeInteger(version)||version<2||!trustOutput)throw new Error('ROTATION_VERSION_AND_NEW_PUBLIC_MANIFEST_OUTPUT_REQUIRED');
  const uri=registeredUriSchema.parse(approval?manifest.institutionUri:manifest.serviceUri),name=approval?`issuer/approval-v${version}`:`sender/key-v${version}`,file=resolve(root,`${name}.json`),progressFile=resolve(root,`preparation-${operation}-v${version}.json`);
  // A partially produced key is never silently replaced; the public manifest can be reconstructed only after owner review.
  await writeFile(progressFile,JSON.stringify({operation,status:'in-progress',keyFile:`${name}.json`,publicManifest:trustOutput,recovery:'Preserve the generated key on failure. Review its publicJwk before reconstructing a new manifest; never regenerate this version or activate it from a journal flag.'})+'\n',{flag:'wx',mode:0o600});
  const key=await generateEd25519KeyPair(),kid=`${uri}#${key.kid}`;
  await writeFile(file,JSON.stringify({kid,privateJwk:await exportSigningPrivateJwk(key),publicJwk:key.publicJwk},null,2)+'\n',{flag:'wx',mode:0o600});
  const next={...manifest,publicKeys:{...manifest.publicKeys,[name]:{kid,publicJwk:key.publicJwk}}};
  await writeFile(resolve(trustOutput),JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(progressFile,JSON.stringify({operation,status:'complete',keyFile:`${name}.json`,publicManifest:trustOutput,active:false})+'\n',{mode:0o600});
  console.log('New inactive role key/public manifest prepared. Joint recovery/key approval, confirmed epoch and explicit trust/web publication are still required. Old keys are preserved.');
} else {
  const manifest = JSON.parse(await readFile(process.env.PUBLIC_MANIFEST_PATH??resolve(root, "public-manifest.json"), "utf8"));
  const deployment = JSON.parse(await readFile(resolve(root, "deployment.json"), "utf8"));
  if (typeof deployment.networkId !== "string" || !/^\d+$/.test(deployment.networkId) || !/^0x[0-9a-f]{64}$/.test(deployment.genesisHash) || !/^0x[0-9a-fA-F]{40}$/.test(deployment.registryAddress) || !process.env.INSTITUTION_ID || deployment.institutionId?.toLowerCase() !== keccak256(stringToHex(process.env.INSTITUTION_ID))) throw new Error("DEPLOYMENT_CHAIN_REGISTRY_INSTITUTION_METADATA_REQUIRED");
  if(process.env.SERVICE_PROFILE!=="finals"&&deployment.registryProfile!=="CALLSIGN_SERVICE_JOINT_CONFIGURATION_1")throw new Error("NEW_SERVICE_REGISTRY_DEPLOYMENT_REQUIRED");
  if(!/^[1-9][0-9]*$/.test(process.env.SERVICE_POLICY_VERSION??"1")||!Number.isSafeInteger(Number(process.env.SERVICE_POLICY_VERSION??1)))throw new Error("INVALID_SERVICE_POLICY_VERSION");
  const approvalKeyVersion = Number(process.env.APPROVAL_KEY_VERSION ?? "1"), serviceKeyVersion = Number(process.env.SERVICE_KEY_VERSION ?? "1");
  if (!Number.isSafeInteger(approvalKeyVersion) || approvalKeyVersion < 1 || !Number.isSafeInteger(serviceKeyVersion) || serviceKeyVersion < 1) throw new Error("INVALID_KEY_VERSION");
  const issuer = manifest.publicKeys[`issuer/approval-v${approvalKeyVersion}`], service = manifest.publicKeys[serviceKeyVersion===1?"sender/key":`sender/key-v${serviceKeyVersion}`];
  if(!manifest.publicKeys["pbx/evidence"])throw new Error("PBX_PUBLIC_KEY_MANIFEST_ENTRY_REQUIRED");
  if (!issuer || !service) throw new Error("CURRENT_PUBLIC_KEY_MANIFEST_ENTRY_REQUIRED");
  const didDocuments = Object.fromEntries([[manifest.issuerDid, issuer], [manifest.serviceDid, service]].filter(([did])=>typeof did==="string"&&did.startsWith("did:")).map(([did, key]) => [did, { "@context": ["https://www.w3.org/ns/did/v1"], id: did, verificationMethod: [{ id: key.kid, type: "JsonWebKey2020", controller: did, publicKeyJwk: key.publicJwk }], assertionMethod: [key.kid], authentication: [key.kid] }]));
  const bundle = { networkId: deployment.networkId, genesisHash: deployment.genesisHash, registryAddress: deployment.registryAddress, policyVersion: String(process.env.SERVICE_POLICY_VERSION??1),...(deployment.registryProfile==="CALLSIGN_SERVICE_JOINT_CONFIGURATION_1"?{registryProfile:"CALLSIGN_SERVICE_JOINT_CONFIGURATION_1" as const}:{}),witnessThreshold: 3,
    witnessPublicKeys: [1,2,3,4].map(i => ({ witnessId: `witness-${i}`, kid: manifest.publicKeys[`witness-keys/witness-${i}`].kid, jwk: manifest.publicKeys[`witness-keys/witness-${i}`].publicJwk })),
    endpoints: [1,2,3,4].map(i => ({ witnessId: `witness-${i}`, url: `http://witness${i}:${4200+i}` })),
    enrollmentPublicKey: issuer.publicJwk, supportedProtocolVersions: [1,2,3], didDocuments,
    service:{institutionUri:manifest.institutionUri??manifest.issuerDid,serviceUri:manifest.serviceUri??manifest.serviceDid,issuerKid:issuer.kid,issuerPublicKey:issuer.publicJwk,serviceKid:service.kid,servicePublicKey:service.publicJwk,approvalKeyVersion,serviceKeyVersion,policy:runtimePolicySchema.parse({leaseSeconds:Number(process.env.CALL_LEASE_SECONDS??30),maxCallSeconds:Number(process.env.CALL_MAX_SECONDS??14400)}),pbx:{kid:manifest.publicKeys["pbx/evidence"].kid,publicKey:manifest.publicKeys["pbx/evidence"].publicJwk,fingerprint:new X509Certificate(await readFile(process.env.PBX_DTLS_CERT_PATH??resolve(root,"asterisk/tls/cert.pem"))).fingerprint256}},
    ...(manifest.issuerDid&&manifest.serviceDid?{finals: { issuerDid: manifest.issuerDid, issuerKid: issuer.kid, issuerPublicKey: issuer.publicJwk, serviceDid: manifest.serviceDid, serviceKid: service.kid, servicePublicKey: service.publicJwk, approvalKeyVersion, serviceKeyVersion }}:{}) };
  const output = trustOutput ? resolve(trustOutput) : resolve(root, "trust/trust-bundle.json");
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`VITE_SERVICE_TRUST_SHA256=${hashCanonical(bundle)}\nVITE_FINALS_TRUST_SHA256=${hashCanonical(bundle)}`);
}
