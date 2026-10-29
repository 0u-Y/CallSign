-- Apply only to the independent anchor database, under separately authorized provisioning.
CREATE TABLE callsign_anchors(deployment text NOT NULL,institution_id text NOT NULL,state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(deployment,institution_id));
-- Provision exactly one initial zero hash/sequence anchor for a NEW empty deployment.
-- Never restore this table from the issuer VM backup. Separate DB owner and narrowly scoped service login are required.
