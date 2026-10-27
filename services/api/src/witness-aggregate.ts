import { verifyStateBundle, type StateBundle, type TrustBundle } from "@callsign/verifier";
import { hashCanonical } from "@callsign/protocol";

export interface WitnessEndpoint { witnessId: string; url: string }
// Every witness proposes its own latest canonical block; no aggregator RPC oracle.
export async function aggregateWitnesses(input: {
  endpoints: WitnessEndpoint[]; institutionId: string; delegationId: string; trust: TrustBundle;
  fetcher?: typeof fetch; now?: number; timeoutMs?: number;
}): Promise<StateBundle> {
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 2500);
  const request = async (url: string, body?: unknown) => {
    const response = await fetcher(url, { signal: controller.signal, ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error("WITNESS_UNAVAILABLE");
    const text = await response.text(); if (text.length > 65536) throw new Error("WITNESS_RESPONSE_TOO_LARGE"); return JSON.parse(text);
  };
  const query = { institutionId: input.institutionId, delegationId: input.delegationId };
  try {
    // Resolve at first valid quorum; the slowest endpoint cannot hold it hostage.
    return await new Promise<StateBundle>((resolve, reject) => {
      const proposals = new Set<string>(); const groups = new Map<string, StateBundle>(); let pending = input.endpoints.length; let settled = false; let unavailable = "WITNESS_THRESHOLD_UNAVAILABLE";
      const failure = () => Object.assign(new Error(unavailable), { statusCode: 503, code: unavailable });
      const finished = () => { pending--; if (pending === 0 && !settled) reject(failure()); };
      const collect = async (endpoint: WitnessEndpoint, body: unknown) => {
        pending++;
        try {
          const result = await request(`${endpoint.url}/snapshot`, body) as { witnessId: string; snapshot: StateBundle["snapshot"]; jws: string };
          if (result.witnessId !== endpoint.witnessId) return;
          const one = { snapshot: result.snapshot, signatures: [{ witnessId: result.witnessId, jws: result.jws }] };
          // A bad signature cannot occupy a group or advance the candidate height.
          await verifyStateBundle(one, { ...input.trust, witnessThreshold: 1 }, { nowWallSeconds: result.snapshot.blockTimestamp, nowMonotonicMs: 0, expectedInstitutionId: query.institutionId, expectedDelegationId: query.delegationId });
          const key = hashCanonical(result.snapshot); const group = groups.get(key) ?? { snapshot: result.snapshot, signatures: [] };
          if (!group.signatures.some(s => s.witnessId === result.witnessId)) group.signatures.push(one.signatures[0]!);
          groups.set(key, group);
          if (!settled && group.signatures.length >= input.trust.witnessThreshold) {
            try {
              await verifyStateBundle(group, input.trust, { nowWallSeconds: input.now ?? Math.floor(Date.now()/1000), nowMonotonicMs: 0, expectedInstitutionId: query.institutionId, expectedDelegationId: query.delegationId });
              if (!settled) { settled = true; resolve(group); controller.abort(); }
            } catch (error) {
              unavailable = error instanceof Error && error.message === "STALE_SNAPSHOT" ? "STALE_WITNESS_QUORUM_CHAIN_PROGRESS_UNAVAILABLE" : "WITNESS_QUORUM_TIME_INVALID";
            }
          }
        } catch { /* Partial failure cannot create a quorum. */ } finally { finished(); }
      };
      if (!pending) { reject(failure()); return; }
      for (const endpoint of input.endpoints) {
        void request(`${endpoint.url}/head`).then(async (head: { blockNumber: string; blockHash: string }) => {
          const key = `${head.blockNumber}:${head.blockHash}`;
          if (proposals.has(key)) return; proposals.add(key);
          // At most four distinct candidate blocks, independently checked by all witnesses.
          await Promise.all(input.endpoints.map(e => collect(e, { ...query, blockNumber: head.blockNumber, blockHash: head.blockHash })));
        }).catch(() => {}).finally(finished);
      }
    });
  } finally { clearTimeout(timer); controller.abort(); }
}
