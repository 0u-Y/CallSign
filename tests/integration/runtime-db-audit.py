"""Read-only aggregate audit of one owned runtime database; no repair or deletion."""
import argparse,json,os,subprocess
from pathlib import Path

SQL="""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
 'migrations',(SELECT json_object_agg(id,source_hash) FROM public.callsign_migrations),
 'institutions',(SELECT count(*) FROM issuer_v2.institutions),
 'attempts',(SELECT count(*) FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(coalesce(i.state->'serviceV3'->'attempts','{}')) a),
 'nonterminalAttempts',(SELECT count(*) FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(coalesce(i.state->'serviceV3'->'attempts','{}')) a WHERE a.value->>'status' NOT IN ('ended','declined','cancelled','failed','no-answer')),
 'cancelledWork',(SELECT count(*) FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(coalesce(i.state->'serviceV3'->'intents',i.state->'intents','{}')) a WHERE a.value->>'status'='cancelled'),
 'sessions',(SELECT json_build_object('validByExpiry',count(*) FILTER(WHERE expires_at>now()),'expired',count(*) FILTER(WHERE expires_at<=now())) FROM public.sessions),
 'outbox',(SELECT coalesce(json_object_agg(status,n),'{}') FROM (SELECT status,count(*) n FROM issuer_v2.outbox GROUP BY status) q),
 'overduePending',(SELECT count(*) FROM issuer_v2.outbox WHERE status='pending' AND retry_at<=now()),
 'expiredClaims',(SELECT count(*) FROM issuer_v2.outbox WHERE status='processing' AND (lease_until IS NULL OR lease_until<=now())),
 'futureRetries',(SELECT count(*) FROM issuer_v2.outbox WHERE status='pending' AND retry_at>now()),
 'signerLeases',(SELECT json_build_object('current',count(*) FILTER(WHERE expires_at>now()),'expired',count(*) FILTER(WHERE expires_at<=now())) FROM issuer_v2.signer_leases),
 'reservedReservations',(SELECT count(*) FROM issuer_v2.usage_reservations WHERE state='reserved'),
 'expiredReservations',(SELECT count(*) FROM issuer_v2.usage_reservations WHERE state='reserved' AND expires_at<=now()),
 'reservationStates',(SELECT coalesce(json_object_agg(state,n),'{}') FROM (SELECT state,count(*) n FROM issuer_v2.usage_reservations GROUP BY state) q),
 'reservedBalance',(SELECT coalesce(sum(reserved),0) FROM issuer_v2.quota_balances),
 'consumptionReceipts',(SELECT count(*) FROM issuer_v2.approval_consumptions),
 'consumptionJournal',(SELECT count(*) FROM issuer_v2.consumption_journal),
 'recoveryGates',(SELECT coalesce(json_object_agg(status,n),'{}') FROM (SELECT status,count(*) n FROM issuer_v2.recovery_gate GROUP BY status) q));
ROLLBACK;"""

def assess(value,final):
    failures=[]
    if final:
        for key in ['nonterminalAttempts','reservedReservations','expiredReservations','reservedBalance','overduePending','expiredClaims']:
            if int(value[key]):failures.append(key)
        if int(value['outbox'].get('failed',0)):failures.append('failedOutbox')
    pending=final and (int(value['outbox'].get('processing',0)) or int(value['futureRetries']))
    return {'status':'FAIL' if failures else 'PARTIAL' if pending else 'PASS','failures':failures,'expectedRetained':'Consumed receipts/journal, settled usage, valid or expired session records and signer lease history are retained; expiry alone is not authorization proof. Future retries/current claims are reported, not deleted.'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--final',action='store_true');a=p.parse_args()
    if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise SystemExit('INTEGRATION_EXECUTION_BLOCKED')
    root=a.root.resolve();owner=json.loads((root/'ownership.json').read_text());assert root.name==owner['runId'] and root.name.startswith('media-delivery-') and root.stat().st_uid==os.getuid() and not root.stat().st_mode&0o077
    entry=next(x for x in reversed(owner['containers']) if x['name']==owner['runId']+'-database');info=json.loads(subprocess.check_output(['docker','inspect',entry['id']],timeout=5))[0];assert info['Id']==entry['id'] and info['Config']['Labels']['org.callsign.run-id']==owner['runId'] and info['State']['Running'] and not info['HostConfig']['PortBindings']
    db=json.loads((root/'private-database.json').read_text());assert db['database'].startswith('callsign_test_')
    result=subprocess.run(['docker','exec','-e','PGPASSWORD','-i',entry['id'],'psql','-X','-Atq','--no-password','-v','ON_ERROR_STOP=1','-U','callsign_migrator','-d',db['database']],env={**os.environ,'PGPASSWORD':db['ownerPassword']},input=SQL,capture_output=True,text=True,timeout=15)
    if result.returncode:raise RuntimeError('OWNED_SQL_AUDIT_QUERY_FAILED')
    values=[json.loads(x) for x in result.stdout.splitlines() if x.startswith('{')];assert len(values)==1
    value=values[0];out={**assess(value,a.final),'final':a.final,'observations':value,'scope':'One repeatable-read read-only SQL snapshot; this owned DB only. No raw rows, keys, tokens, receipt payloads or manual correction.'}
    a.output.write_text(json.dumps(out,indent=2)+'\n');a.output.chmod(0o600);print(json.dumps({'status':out['status'],'final':a.final}));raise SystemExit(0 if out['status']=='PASS' else 2)
if __name__=='__main__':main()
