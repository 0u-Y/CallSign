import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, parseEther, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(import.meta.dirname, "..");
const artifactPath = resolve(root, "contracts/out/InstitutionRegistry.sol/InstitutionRegistry.json");
const deploymentPath = resolve(root, ".local/deployment.json");
const rolesPath = resolve(root, ".local/ledger-roles.json");
const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
const chain = { id: 20260914, name: "CallSign Local QBFT", nativeCurrency: { name: "Demo Ether", symbol: "DEMO", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;

// Deterministic, publicly known keys for the disposable local demo chain only.
// Never fund or reuse these keys on any public or production network.
const privateKeys = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  approver1: `0x${"11".repeat(32)}`,
  approver2: `0x${"22".repeat(32)}`,
  approver3: `0x${"33".repeat(32)}`,
  administrator: `0x${"44".repeat(32)}`,
  emergencyStopper: `0x${"55".repeat(32)}`,
} satisfies Record<string, Hex>;

const accounts = Object.fromEntries(Object.entries(privateKeys).map(([role, key]) => [role, privateKeyToAccount(key)])) as Record<keyof typeof privateKeys, ReturnType<typeof privateKeyToAccount>>;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const deployer = createWalletClient({ account: accounts.deployer, chain, transport: http(rpcUrl) });

try {
  const previous = JSON.parse(await readFile(deploymentPath, "utf8")) as { registryAddress: Hex; brand?: string };
  if (previous.brand === "CallSign" && (await publicClient.getCode({ address: previous.registryAddress })) !== undefined) {
    console.log(JSON.stringify({ reused: true, ...previous }));
    process.exit(0);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as { abi: readonly unknown[]; bytecode: { object: Hex } };
const approvers = [accounts.approver1.address, accounts.approver2.address, accounts.approver3.address] as const;
const deployHash = await deployer.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [approvers] });
const deployed = await publicClient.waitForTransactionReceipt({ hash: deployHash });
if (!deployed.contractAddress) throw new Error("REGISTRY_DEPLOYMENT_ADDRESS_MISSING");

for (const account of [accounts.administrator, accounts.emergencyStopper]) {
  const hash = await deployer.sendTransaction({ to: account.address, value: parseEther("2") });
  await publicClient.waitForTransactionReceipt({ hash });
}

const issuer = JSON.parse(await readFile(resolve(root, ".local/test-keys/issuer-ed25519.json"), "utf8")) as { publicJwk: { x: string } };
const approvalPublicKey = `0x${Buffer.from(issuer.publicJwk.x, "base64url").toString("hex")}` as Hex;
const institutionId = keccak256(stringToHex("inst_mock_a_city_01HZZZZZZZZZZZZZZZZ"));
const request = {
  institutionId,
  administrator: accounts.administrator.address,
  approvalPublicKey,
  emergencyStopper: accounts.emergencyStopper.address,
  directoryHash: keccak256(stringToHex("/official:mock-a-city:v1")),
  directoryVersion: 1n,
  policyVersion: 1n,
  nonce: keccak256(stringToHex(`register:${deployed.contractAddress}`)),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
};
const domain = { name: "CallSign Registry", version: "1", chainId: chain.id, verifyingContract: deployed.contractAddress } as const;
const types = { RegisterInstitution: [
  { name: "actionType", type: "bytes32" }, { name: "institutionId", type: "bytes32" }, { name: "administrator", type: "address" },
  { name: "approvalPublicKey", type: "bytes32" }, { name: "emergencyStopper", type: "address" }, { name: "directoryHash", type: "bytes32" },
  { name: "directoryVersion", type: "uint64" }, { name: "policyVersion", type: "uint64" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint64" },
] } as const;
const message = { actionType: keccak256(stringToHex("REGISTER_INSTITUTION")), ...request };
const signatures = await Promise.all([accounts.approver1, accounts.approver2].map((account) => account.signTypedData({ domain, types, primaryType: "RegisterInstitution", message })));
const registerHash = await deployer.writeContract({ address: deployed.contractAddress, abi: artifact.abi, functionName: "registerInstitution", args: [request, signatures] });
await publicClient.waitForTransactionReceipt({ hash: registerHash });

const genesis = await publicClient.getBlock({ blockNumber: 0n });
const deployment = { brand: "CallSign", networkId: String(chain.id), genesisHash: genesis.hash, registryAddress: deployed.contractAddress, institutionId, deploymentBlock: String(deployed.blockNumber), deployTransaction: deployHash, registerTransaction: registerHash, approvers, administrator: accounts.administrator.address, emergencyStopper: accounts.emergencyStopper.address, approvalPublicKey };
await mkdir(dirname(deploymentPath), { recursive: true });
await writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, { mode: 0o600 });
await writeFile(rolesPath, `${JSON.stringify({ privateKeys, addresses: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, account.address])) }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ reused: false, ...deployment }));
