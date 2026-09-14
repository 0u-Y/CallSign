CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  role text NOT NULL,
  demo_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id),
  institution_id text NOT NULL,
  opaque_id text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_owner_idx ON tasks(owner_id);
CREATE TABLE IF NOT EXISTS gateway_registrations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kid text NOT NULL UNIQUE,
  public_jwk jsonb NOT NULL,
  delegation_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipient_enrollments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kid text NOT NULL UNIQUE,
  public_jwk jsonb NOT NULL,
  proof_jws text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS authorizations (
  id text PRIMARY KEY,
  institution_id text NOT NULL,
  delegation_id text NOT NULL,
  gateway_registration_id text NOT NULL REFERENCES gateway_registrations(id),
  recipient_id text NOT NULL REFERENCES users(id),
  task_id text NOT NULL REFERENCES tasks(id),
  payload jsonb NOT NULL,
  signed_jws text NOT NULL,
  authorization_hash text NOT NULL,
  cancelled_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authorizations_recipient_idx ON authorizations(recipient_id);
CREATE TABLE IF NOT EXISTS authorization_consumptions (
  authorization_id text PRIMARY KEY REFERENCES authorizations(id),
  authorization_hash text NOT NULL,
  binding_hash text NOT NULL,
  recipient_id text NOT NULL,
  session_id text NOT NULL,
  consumed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS governance_proposals (
  id text PRIMARY KEY,
  action text NOT NULL,
  institution_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS proposal_signatures (
  proposal_id text NOT NULL REFERENCES governance_proposals(id),
  signer_user_id text NOT NULL REFERENCES users(id),
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, signer_user_id)
);
CREATE TABLE IF NOT EXISTS demo_runs (
  id text PRIMARY KEY,
  scenario text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verifier_events (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES demo_runs(id) ON DELETE CASCADE,
  code text NOT NULL,
  outcome text NOT NULL,
  latency_ms text NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verifier_events_run_idx ON verifier_events(run_id);
