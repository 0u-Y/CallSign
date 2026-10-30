if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||!process.env.CALLSIGN_RECOVERY_ID?.startsWith('callsign_test_'))throw new Error('RECOVERY_TLS_PROBE_BLOCKED');
const url=new URL(process.env.RECOVERY_ANCHOR_URL);if(url.protocol!=='https:'||url.hostname!=='127.0.0.1')throw new Error('LOCAL_TLS_PROBE_REQUIRED');
try{await fetch(process.env.RECOVERY_ANCHOR_URL,{signal:AbortSignal.timeout(2500)});console.log(JSON.stringify({tlsRejected:false}));}catch(error){console.log(JSON.stringify({tlsRejected:error.cause?.code==='DEPTH_ZERO_SELF_SIGNED_CERT'}));}
