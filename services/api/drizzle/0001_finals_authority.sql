-- Explicit operator migration only. Never run at service startup.
BEGIN;
CREATE SCHEMA IF NOT EXISTS issuer_v2;
CREATE TABLE issuer_v2.institutions (
  id text PRIMARY KEY,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND state->>'id' = id),
  revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE issuer_v2.audit (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES issuer_v2.institutions(id),
  event jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Login roles and passwords are provisioned separately; these group roles have no secrets.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'callsign_platform') THEN CREATE ROLE callsign_platform NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'callsign_issuer') THEN CREATE ROLE callsign_issuer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'callsign_sender') THEN CREATE ROLE callsign_sender NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'callsign_auth') THEN CREATE ROLE callsign_auth NOLOGIN; END IF;
END $$;
REVOKE ALL ON SCHEMA issuer_v2 FROM PUBLIC, callsign_platform, callsign_sender, callsign_auth;
GRANT USAGE ON SCHEMA issuer_v2 TO callsign_issuer;
REVOKE ALL ON ALL TABLES IN SCHEMA issuer_v2 FROM PUBLIC, callsign_platform, callsign_sender, callsign_auth;
GRANT SELECT, UPDATE ON issuer_v2.institutions TO callsign_issuer;
GRANT SELECT, INSERT ON issuer_v2.audit TO callsign_issuer;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM callsign_platform, callsign_sender;
GRANT USAGE ON SCHEMA public TO callsign_auth;
GRANT SELECT ON users TO callsign_auth;
GRANT SELECT, INSERT, DELETE ON sessions TO callsign_auth;
COMMIT;
