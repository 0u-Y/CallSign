BEGIN;
-- PostgreSQL row locks require UPDATE privilege on at least one column, including cleanup readers.
GRANT UPDATE(id) ON pbx.endpoint_leases TO callsign_issuer,callsign_worker;
COMMIT;
