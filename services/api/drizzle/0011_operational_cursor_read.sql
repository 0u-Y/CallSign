-- Operational health reads the worker cursor; issuer must not mutate it.
GRANT SELECT (deployment_id, block_number, block_hash) ON issuer_v2.event_cursor TO callsign_issuer;
