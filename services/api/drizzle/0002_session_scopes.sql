-- Explicit operator migration; existing sessions remain legacy and cannot enter v2.
BEGIN;
ALTER TABLE public.sessions
  ADD COLUMN purpose text NOT NULL DEFAULT 'legacy',
  ADD COLUMN oidc_issuer text,
  ADD COLUMN oidc_client_id text,
  ADD COLUMN oidc_audience text,
  ADD COLUMN authenticated_at timestamptz,
  ADD CONSTRAINT sessions_purpose_valid CHECK (purpose IN ('legacy', 'work', 'official')),
  ADD CONSTRAINT sessions_oidc_context_required CHECK (
    purpose = 'legacy' OR (
      oidc_issuer IS NOT NULL AND oidc_client_id IS NOT NULL AND
      oidc_audience IS NOT NULL AND authenticated_at IS NOT NULL
    )
  );
CREATE INDEX sessions_expiry_idx ON public.sessions (expires_at);
-- Replay protection outlives logout/session deletion.
CREATE TABLE public.oidc_login_uses (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX oidc_login_uses_expiry_idx ON public.oidc_login_uses (expires_at);
REVOKE ALL ON public.oidc_login_uses FROM PUBLIC, callsign_platform, callsign_sender, callsign_issuer;
GRANT SELECT, INSERT, DELETE ON public.oidc_login_uses TO callsign_auth;
COMMIT;
