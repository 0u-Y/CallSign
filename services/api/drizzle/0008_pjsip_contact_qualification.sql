BEGIN;
-- Asterisk 22.11 writes this option on every realtime contact registration.
ALTER TABLE pbx.ps_contacts ADD COLUMN qualify_2xx_only varchar(3);
ALTER TABLE pbx.ps_aors ADD COLUMN qualify_2xx_only varchar(3);
COMMIT;
