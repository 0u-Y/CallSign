import { assertLedgerBinding, verifyStateBundle, type StateBundle, type TrustBundle } from '@callsign/verifier';
import { servicePolicy } from '@callsign/protocol';
import type { InstitutionRecord } from './finals-model.js';

// Runs inside the institution transaction; checkpoints survive issuer restarts.
export async function currentServiceState(record: InstitutionRecord, digest: string, bundle: StateBundle, trust: TrustBundle, now: number): Promise<'current' | 'revoked'> {
  const s = record.serviceV3, credential = s?.credentials[digest];
  if (!s || !credential) throw new Error('CREDENTIAL_NOT_REGISTERED');
  const verified = await verifyStateBundle(bundle, trust, { expectedInstitutionId: record.id, expectedDelegationId: digest, nowWallSeconds: now, nowMonotonicMs: performance.now(), maxStateAgeSeconds: servicePolicy.observedStateAgeSeconds, maxFutureSkewSeconds: servicePolicy.eachClockSkewSeconds });
  const snapshot = verified.snapshot, previous = s.checkpoints[digest];
  if (previous && (BigInt(snapshot.blockNumber) < BigInt(previous.height) || (snapshot.blockNumber === previous.height && (snapshot.blockHash !== previous.hash || verified.snapshotHash !== previous.payloadHash)))) throw new Error('STATE_ROLLBACK_OR_CONFLICT');
  if (previous && now < previous.firstSeenAt) throw new Error('CLOCK_ROLLBACK');
  s.checkpoints[digest] = { height: snapshot.blockNumber, hash: snapshot.blockHash, payloadHash: verified.snapshotHash, firstSeenAt: previous?.hash === snapshot.blockHash ? previous.firstSeenAt : now, blockTimestamp: snapshot.blockTimestamp };
  const vc = credential.vc;
  if (!snapshot.institutionState.exists || snapshot.institutionState.status !== 'Active' || snapshot.institutionState.epoch !== vc.credentialStatus.epoch || snapshot.delegationState.revoked || (snapshot.delegationState.exists && snapshot.delegationState.epoch !== vc.credentialStatus.epoch)) return 'revoked';
  // An absent delegation can be a not-yet-confirmed issuance, never evidence of authority.
  assertLedgerBinding(snapshot, { epoch: record.epoch, approvalPublicKey: record.approvalPublicKey, servicePublicKey: vc.credentialSubject.publicKey, now });
  return 'current';
}
