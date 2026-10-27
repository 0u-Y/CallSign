BEGIN;
CREATE TABLE issuer_v2.approval_consumptions (
 institution_id text NOT NULL, authorization_id text NOT NULL, protocol_version integer NOT NULL CHECK (protocol_version IN (1,2,3)),
 binding_hash text NOT NULL, receipt jsonb NOT NULL, consumed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(institution_id, authorization_id)
);
INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt)
 SELECT a.institution_id,c.authorization_id,1,c.binding_hash,to_jsonb(c) FROM public.authorization_consumptions c JOIN public.authorizations a ON a.id=c.authorization_id;
INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt)
 SELECT i.id,c.key,2,c.value->'payload'->>'bindingHash',c.value FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(COALESCE(i.state->'consumptions','{}'::jsonb)) c;
CREATE FUNCTION issuer_v2.record_legacy_consumption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,issuer_v2,public AS $$
DECLARE institution text; prior issuer_v2.approval_consumptions;
BEGIN
 SELECT institution_id INTO STRICT institution FROM public.authorizations WHERE id=NEW.authorization_id;
 INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt)
 VALUES(institution,NEW.authorization_id,1,NEW.binding_hash,to_jsonb(NEW)) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT prior FROM issuer_v2.approval_consumptions WHERE institution_id=institution AND authorization_id=NEW.authorization_id;
 IF prior.protocol_version<>1 OR prior.binding_hash<>NEW.binding_hash THEN RAISE EXCEPTION 'CROSS_PROFILE_CONSUMPTION_CONFLICT'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION issuer_v2.record_legacy_consumption() FROM PUBLIC;
CREATE TRIGGER legacy_consumption_namespace BEFORE INSERT ON public.authorization_consumptions FOR EACH ROW EXECUTE FUNCTION issuer_v2.record_legacy_consumption();
CREATE TABLE issuer_v2.outbox (
 id text PRIMARY KEY, institution_id text NOT NULL, kind text NOT NULL, object_id text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, retry_at timestamptz NOT NULL DEFAULT now(), last_error text,
 transaction_hash text, signed_transaction text, signer_address text, transaction_nonce bigint, receipt_block bigint
);
CREATE INDEX outbox_work_idx ON issuer_v2.outbox(status,retry_at,created_at);
CREATE TABLE issuer_v2.global_quota (key text PRIMARY KEY, used bigint NOT NULL CHECK(used>=0), hard_limit bigint NOT NULL CHECK(hard_limit>=0 AND used<=hard_limit), expires_at timestamptz NOT NULL);
CREATE TABLE issuer_v2.event_cursor (deployment_id text PRIMARY KEY, block_number bigint NOT NULL, block_hash text NOT NULL, log_index integer NOT NULL DEFAULT -1);
CREATE TABLE issuer_v2.recovery_gate (institution_id text PRIMARY KEY REFERENCES issuer_v2.institutions(id), status text NOT NULL DEFAULT 'blocked' CHECK(status IN ('ready','blocked')), anchor_hash text, checked_at timestamptz);
INSERT INTO issuer_v2.recovery_gate(institution_id) SELECT id FROM issuer_v2.institutions;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='callsign_worker') THEN CREATE ROLE callsign_worker NOLOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='callsign_pbx') THEN CREATE ROLE callsign_pbx NOLOGIN; END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA issuer_v2 FROM PUBLIC, callsign_platform, callsign_sender, callsign_pbx;
GRANT SELECT,INSERT ON issuer_v2.approval_consumptions TO callsign_issuer;
GRANT SELECT,INSERT ON issuer_v2.outbox TO callsign_issuer;
GRANT SELECT,INSERT,UPDATE ON issuer_v2.global_quota TO callsign_issuer;
GRANT SELECT ON issuer_v2.recovery_gate TO callsign_issuer;
GRANT USAGE ON SCHEMA issuer_v2 TO callsign_worker;
GRANT SELECT,UPDATE ON issuer_v2.institutions TO callsign_worker;
GRANT SELECT,INSERT,UPDATE ON issuer_v2.outbox,issuer_v2.event_cursor TO callsign_worker;
GRANT SELECT,INSERT ON issuer_v2.audit TO callsign_worker;
GRANT SELECT ON issuer_v2.approval_consumptions,issuer_v2.recovery_gate TO callsign_worker;
GRANT SELECT,DELETE ON issuer_v2.global_quota TO callsign_worker;
-- Asterisk realtime objects; no public SIP trunk and no cleartext password column.
CREATE SCHEMA pbx;
CREATE TABLE pbx.ps_auths(id varchar(100) PRIMARY KEY,auth_type varchar(20),username varchar(100),realm varchar(100),password_digest varchar(255),supported_algorithms_uas varchar(100));
CREATE TABLE pbx.ps_aors(id varchar(100) PRIMARY KEY,max_contacts integer,remove_existing varchar(3),default_expiration integer,maximum_expiration integer,minimum_expiration integer);
CREATE TABLE pbx.ps_endpoints(id varchar(100) PRIMARY KEY,transport varchar(40),aors varchar(100),auth varchar(100),context varchar(40),disallow varchar(100),allow varchar(100),direct_media varchar(3),webrtc varchar(3),dtls_auto_generate_cert varchar(3),dtls_cert_file varchar(255),dtls_private_key varchar(255),rtp_symmetric varchar(3),rewrite_contact varchar(3),force_rport varchar(3),media_encryption varchar(20),ice_support varchar(3),rtcp_mux varchar(3));
CREATE TABLE pbx.ps_contacts(id varchar(255) PRIMARY KEY,uri varchar(511),expiration_time bigint,qualify_frequency integer,outbound_proxy varchar(255),path text,user_agent varchar(255),qualify_timeout double precision,reg_server varchar(255),authenticate_qualify varchar(3),via_addr varchar(255),via_port integer,call_id varchar(255),endpoint varchar(100),prune_on_boot varchar(3));
CREATE TABLE pbx.endpoint_leases(id varchar(100) PRIMARY KEY,institution_id text NOT NULL,attempt_id text NOT NULL,user_id text NOT NULL,expires_at timestamptz NOT NULL);
REVOKE ALL ON SCHEMA pbx FROM PUBLIC;
GRANT USAGE ON SCHEMA pbx TO callsign_issuer,callsign_pbx,callsign_worker;
GRANT SELECT,INSERT,DELETE ON ALL TABLES IN SCHEMA pbx TO callsign_issuer;
GRANT SELECT ON pbx.ps_auths,pbx.ps_aors,pbx.ps_endpoints,pbx.endpoint_leases TO callsign_pbx;
GRANT SELECT,INSERT,UPDATE,DELETE ON pbx.ps_contacts TO callsign_pbx;
GRANT SELECT,DELETE ON ALL TABLES IN SCHEMA pbx TO callsign_worker;
COMMIT;
