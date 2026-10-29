-- Explicit new-deployment owner operation AFTER migrations 0000..0005.
-- psql -X -v ON_ERROR_STOP=1 -f infra/deploy/provision-logins.sql
-- Read secrets from a protected process environment; never pass -v passwords or echo this session.
\set ON_ERROR_STOP on
\getenv issuer_password ISSUER_DB_PASSWORD
\getenv auth_password AUTH_DB_PASSWORD
\getenv worker_password WORKER_DB_PASSWORD
\getenv pbx_password PBX_DB_PASSWORD
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('callsign_issuer_login','callsign_auth_login','callsign_worker_login','callsign_pbx_login')) THEN
  RAISE EXCEPTION 'EXISTING_LOGIN_REQUIRES_EXPLICIT_REVIEW_NO_PASSWORD_RESET';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='callsign_worker') OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='callsign_pbx') THEN
  RAISE EXCEPTION 'APPLY_REVIEWED_MIGRATIONS_FIRST';
 END IF;
END $$;
SELECT 1 / CASE WHEN least(length(:'issuer_password'),length(:'auth_password'),length(:'worker_password'),length(:'pbx_password'))>=32
 AND :'issuer_password'<>:'auth_password' AND :'issuer_password'<>:'worker_password' AND :'issuer_password'<>:'pbx_password'
 AND :'auth_password'<>:'worker_password' AND :'auth_password'<>:'pbx_password' AND :'worker_password'<>:'pbx_password' THEN 1 ELSE 0 END;
CREATE ROLE callsign_issuer_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'issuer_password';
CREATE ROLE callsign_auth_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'auth_password';
CREATE ROLE callsign_worker_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'worker_password';
CREATE ROLE callsign_pbx_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'pbx_password';
GRANT callsign_issuer TO callsign_issuer_login;
GRANT callsign_auth TO callsign_auth_login;
GRANT callsign_worker TO callsign_worker_login;
GRANT callsign_pbx TO callsign_pbx_login;
GRANT CONNECT ON DATABASE :"DBNAME" TO callsign_issuer_login,callsign_auth_login,callsign_worker_login,callsign_pbx_login;
COMMIT;
