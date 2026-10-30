BEGIN;
-- One persistent admission fence per database, shared by all application replicas.
CREATE TABLE issuer_v2.backup_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 phase text NOT NULL CHECK(phase IN ('open','draining','fenced')),
 token text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO issuer_v2.backup_control(singleton,phase,token) VALUES(true,'open','initial');
GRANT SELECT ON issuer_v2.backup_control TO callsign_issuer,callsign_worker,callsign_auth;
COMMIT;
