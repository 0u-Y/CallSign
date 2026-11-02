-- Bounded tenant operational reads; no authority or retention policy change.
CREATE INDEX audit_recall_lookup_idx ON issuer_v2.audit(institution_id, recorded_at DESC)
WHERE event->>'event' IN ('intent.cancelled','credential.revoke','institution.suspend','institution.configure','key.activated');
CREATE INDEX outbox_recall_lookup_idx ON issuer_v2.outbox(institution_id, created_at DESC)
WHERE kind IN ('credential.revoke','institution.suspend','institution.configure','institution.recover','call.cleanup','intent.cancelled','key.activated');
