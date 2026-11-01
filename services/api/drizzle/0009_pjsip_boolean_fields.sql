BEGIN;
-- PJSIP serializes ast_bool values as true/false; the legacy yes/no widths truncate false.
ALTER TABLE pbx.ps_contacts ALTER COLUMN qualify_2xx_only TYPE varchar(5), ALTER COLUMN authenticate_qualify TYPE varchar(5), ALTER COLUMN prune_on_boot TYPE varchar(5);
ALTER TABLE pbx.ps_aors ALTER COLUMN qualify_2xx_only TYPE varchar(5);
COMMIT;
