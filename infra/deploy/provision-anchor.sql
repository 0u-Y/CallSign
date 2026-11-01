-- NEW independent AWS Anchor DB only, after anchor-schema.sql; never use to repair/rewind an existing Anchor.
\set ON_ERROR_STOP on
\getenv deployment DEPLOYMENT_ID
\getenv institution INSTITUTION_ID
\getenv password ANCHOR_APP_PASSWORD
BEGIN;
SELECT 1 / CASE WHEN length(:'deployment')>0 AND length(:'institution')>=16 AND length(:'password')>=32 THEN 1 ELSE 0 END;
CREATE ROLE callsign_anchor_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'password';
GRANT CONNECT ON DATABASE :"DBNAME" TO callsign_anchor_login;
GRANT USAGE ON SCHEMA public TO callsign_anchor_login;
GRANT SELECT,UPDATE ON callsign_anchors TO callsign_anchor_login;
INSERT INTO callsign_anchors(deployment,institution_id,state)
VALUES(:'deployment',:'institution',jsonb_build_object('deployment',:'deployment','institutionId',:'institution','sequence','0','hash',repeat('0',64),'epoch','1'));
COMMIT;
