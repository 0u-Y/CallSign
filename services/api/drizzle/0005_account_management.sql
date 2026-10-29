-- Apply explicitly after 0004; never on application startup.
BEGIN;
CREATE TABLE issuer_v2.worker_status(institution_id text NOT NULL,stage text NOT NULL CHECK(stage IN ('events','maintenance','job')),last_error text,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(institution_id,stage));
GRANT SELECT,INSERT,UPDATE ON issuer_v2.worker_status TO callsign_worker;
GRANT SELECT ON issuer_v2.worker_status TO callsign_issuer;
CREATE TABLE issuer_v2.configuration_history(id text NOT NULL,institution_id text NOT NULL,proposal jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(institution_id,id));
GRANT SELECT,INSERT ON issuer_v2.configuration_history TO callsign_worker;
GRANT SELECT ON issuer_v2.configuration_history TO callsign_issuer;
CREATE TABLE issuer_v2.signer_leases (signer text PRIMARY KEY,owner text NOT NULL,expires_at timestamptz NOT NULL);
GRANT SELECT,INSERT,UPDATE,DELETE ON issuer_v2.signer_leases TO callsign_worker;
CREATE TABLE issuer_v2.notifications (
 id text NOT NULL,institution_id text NOT NULL,user_id text NOT NULL,code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',acknowledged_at timestamptz,
 PRIMARY KEY(institution_id,user_id,id)
);
CREATE INDEX notifications_inbox ON issuer_v2.notifications(institution_id,user_id,created_at DESC);
CREATE TABLE issuer_v2.notification_preferences(institution_id text NOT NULL,user_id text NOT NULL,enabled boolean NOT NULL,PRIMARY KEY(institution_id,user_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON issuer_v2.notifications TO callsign_issuer,callsign_worker;
GRANT SELECT,INSERT,UPDATE ON issuer_v2.notification_preferences TO callsign_issuer;
ALTER TABLE issuer_v2.recovery_gate ADD COLUMN verification_token text;
ALTER TABLE public.sessions ADD COLUMN membership_generation integer NOT NULL DEFAULT 0;
CREATE TABLE issuer_v2.identity_links (
 user_id text PRIMARY KEY REFERENCES public.users(id), institution_id text NOT NULL REFERENCES issuer_v2.institutions(id)
);
-- Duplicate institution membership is an error, never choose one arbitrarily.
INSERT INTO issuer_v2.identity_links SELECT m.key,i.id FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(i.state->'members') m JOIN public.users u ON u.id=m.key;
CREATE TABLE issuer_v2.account_requests (
 institution_id text NOT NULL,actor_id text NOT NULL,request_id text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(institution_id,actor_id,request_id)
);
-- The issuer has no general INSERT/UPDATE grant on public.users or sessions.
CREATE FUNCTION issuer_v2.manage_account(p_institution text,p_actor text,p_request text,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s jsonb; a jsonb; m jsonb; prior record; target text; result jsonb; permission text; generation integer; t record;
BEGIN
 SELECT state INTO STRICT s FROM issuer_v2.institutions WHERE id=p_institution FOR UPDATE;
 a:=s->'members'->p_actor;
 IF a IS NULL OR a->>'role' IS DISTINCT FROM 'institution' OR COALESCE((a->>'active')::boolean,true)=false OR NOT COALESCE(a->'permissions' ? 'institution.recover',false) OR COALESCE((a->>'sessionGeneration')::integer,0)<>COALESCE((p_body->>'actorGeneration')::integer,0) THEN RAISE EXCEPTION 'ACCOUNT_MANAGER_REQUIRED'; END IF;
 SELECT * INTO prior FROM issuer_v2.account_requests WHERE institution_id=p_institution AND actor_id=p_actor AND request_id=p_request;
 IF FOUND THEN IF prior.payload<>p_body THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN prior.result; END IF;
 IF jsonb_typeof(p_body->'permissions') IS DISTINCT FROM 'array' OR jsonb_typeof(p_body->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_body->'displayName') IS DISTINCT FROM 'string' OR p_body->>'role' IS NULL THEN RAISE EXCEPTION 'ACCOUNT_INPUT_INVALID'; END IF;
 target:=p_body->>'userId'; m:=s->'members'->target;
 IF target IS NULL OR target=p_actor OR p_body->>'role' NOT IN ('institution','gateway','recipient') OR (m IS NOT NULL AND (m->>'role'='approver' OR m->'permissions' ? 'governance.approve')) THEN RAISE EXCEPTION 'ACCOUNT_SCOPE_INVALID'; END IF;
 IF p_body->>'issuer' IS NULL OR p_body->>'subject' IS NULL OR target<>(p_body->>'issuer')||'|'||(p_body->>'subject') THEN RAISE EXCEPTION 'ACCOUNT_IDENTITY_INVALID'; END IF;
 IF p_body->>'role'<>'institution' AND jsonb_array_length(p_body->'permissions')<>0 THEN RAISE EXCEPTION 'ACCOUNT_PERMISSION_INVALID'; END IF;
 FOR permission IN SELECT jsonb_array_elements_text(p_body->'permissions') LOOP
  IF permission='governance.approve' OR NOT (a->'permissions' ? permission) THEN RAISE EXCEPTION 'ACCOUNT_PERMISSION_ESCALATION'; END IF;
 END LOOP;
 IF p_body->>'role'='gateway' AND (p_body->>'serviceUri' IS NULL OR NOT COALESCE((s->'services'->(p_body->>'serviceUri')->>'active')::boolean,false)) THEN RAISE EXCEPTION 'ACCOUNT_SERVICE_INVALID'; END IF;
 IF (m IS NULL AND EXISTS(SELECT FROM public.users WHERE id=target)) OR EXISTS(SELECT FROM issuer_v2.identity_links WHERE user_id=target AND institution_id<>p_institution) THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_BOUND'; END IF;
 generation:=COALESCE((m->>'sessionGeneration')::integer,0)+1;
 IF m IS NULL THEN
  INSERT INTO public.users(id,display_name,role,demo_code) VALUES(target,p_body->>'displayName',p_body->>'role','disabled-'||md5(p_institution||p_request||target));
  INSERT INTO issuer_v2.identity_links VALUES(target,p_institution);
 ELSE
  UPDATE public.users SET display_name=p_body->>'displayName',role=p_body->>'role' WHERE id=target;
 END IF;
 -- Revocation is permanent for all old sessions, including a later reactivation.
 DELETE FROM public.sessions WHERE user_id=target;
 m:=jsonb_build_object('role',p_body->>'role','active',(p_body->>'active')::boolean,'permissions',p_body->'permissions','sessionGeneration',generation);
 IF p_body->>'role'='gateway' THEN m:=m||jsonb_build_object('serviceDid',p_body->>'serviceUri'); END IF;
 s:=jsonb_set(s,ARRAY['members',target],m);
 FOR t IN SELECT key,value FROM jsonb_each(COALESCE(s->'serviceV3'->'attempts','{}'::jsonb)) LOOP
  IF (t.value->>'agentId'=target OR s->'intents'->(t.value->>'intentId')->>'recipientId'=target) AND t.value->>'status' NOT IN ('ended','cancelled','declined','failed','no-answer') THEN
   s:=jsonb_set(s,ARRAY['serviceV3','attempts',t.key],t.value||jsonb_build_object('status','cancelled','reason','membership-changed','endedAt',extract(epoch from clock_timestamp())::bigint,'revision',COALESCE((t.value->>'revision')::integer,0)+1,'consent',jsonb_build_object('granted',false,'generation',COALESCE((t.value->'consent'->>'generation')::integer,0)+1,'at',extract(epoch from clock_timestamp())::bigint)));
   INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES('account-cleanup:'||p_request||':'||t.key,p_institution,'call.cleanup',t.key,'{}'::jsonb) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 UPDATE issuer_v2.institutions SET state=s,revision=revision+1 WHERE id=p_institution;
 INSERT INTO issuer_v2.audit(id,institution_id,event) VALUES('account:'||p_actor||':'||p_request,p_institution,jsonb_build_object('event','member.managed','actor',p_actor,'objectId',target,'at',extract(epoch from clock_timestamp())::bigint));
 result:=jsonb_build_object('userId',target,'role',p_body->>'role','active',(p_body->>'active')::boolean,'sessionGeneration',generation,'identity','requires-verified-oidc-login');
 INSERT INTO issuer_v2.account_requests VALUES(p_institution,p_actor,p_request,p_body,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION issuer_v2.manage_account(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issuer_v2.manage_account(text,text,text,jsonb) TO callsign_issuer;
REVOKE ALL ON issuer_v2.identity_links,issuer_v2.account_requests FROM PUBLIC,callsign_platform,callsign_sender,callsign_auth,callsign_worker,callsign_issuer;
COMMIT;
