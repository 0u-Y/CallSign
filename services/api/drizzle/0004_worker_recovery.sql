BEGIN;
ALTER TABLE pbx.ps_endpoints ADD COLUMN media_address varchar(40),ADD COLUMN bind_rtp_to_media_address varchar(3);
ALTER TABLE issuer_v2.outbox ADD COLUMN claim_token text;
GRANT UPDATE ON issuer_v2.outbox TO callsign_issuer;
CREATE UNIQUE INDEX outbox_signer_nonce_unique ON issuer_v2.outbox(signer_address,transaction_nonce) WHERE signer_address IS NOT NULL AND transaction_nonce IS NOT NULL;
CREATE TABLE issuer_v2.processed_chain_events (
 deployment_id text NOT NULL, transaction_hash text NOT NULL, log_index integer NOT NULL,
 block_number bigint NOT NULL, block_hash text NOT NULL, PRIMARY KEY(deployment_id,transaction_hash,log_index)
);
CREATE TABLE issuer_v2.usage_reservations (
 id text PRIMARY KEY,institution_id text NOT NULL,unit text NOT NULL,quota_keys jsonb NOT NULL,
 reserved bigint NOT NULL CHECK(reserved>0),actual bigint CHECK(actual>=0 AND actual<=reserved),
 state text NOT NULL CHECK(state IN ('reserved','settled','released')),expires_at timestamptz NOT NULL
);
CREATE TABLE issuer_v2.quota_balances (
 key text PRIMARY KEY,used bigint NOT NULL DEFAULT 0 CHECK(used>=0),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),
 hard_limit bigint NOT NULL,expires_at timestamptz NOT NULL,CHECK(used+reserved<=hard_limit)
);
-- Journal hashes are retained even after sensitive receipt payload retention expires.
CREATE TABLE issuer_v2.consumption_journal (
 sequence bigint NOT NULL,institution_id text NOT NULL,authorization_id text NOT NULL,binding_hash text NOT NULL,
 entry_hash text NOT NULL,previous_hash text NOT NULL,PRIMARY KEY(institution_id,sequence),UNIQUE(institution_id,authorization_id)
);
GRANT SELECT,INSERT ON issuer_v2.consumption_journal TO callsign_issuer;
GRANT SELECT,INSERT,UPDATE ON issuer_v2.usage_reservations,issuer_v2.quota_balances TO callsign_issuer;
GRANT SELECT,INSERT,UPDATE,DELETE ON issuer_v2.processed_chain_events TO callsign_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON issuer_v2.usage_reservations,issuer_v2.quota_balances TO callsign_worker;
GRANT SELECT ON issuer_v2.consumption_journal TO callsign_worker;
GRANT UPDATE ON issuer_v2.recovery_gate TO callsign_worker,callsign_issuer;
-- Only receipt payloads may be minimized; approval IDs and binding hashes cannot be changed by the worker.
GRANT UPDATE(receipt) ON issuer_v2.approval_consumptions TO callsign_worker;
COMMIT;
