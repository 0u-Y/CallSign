import {createAudioRelay} from '../services/api/src/audio-relay.js';
// Analysis already reserves at most 300 seconds; function expiry closes it without ending the call.
export const maxDuration=300;
export default createAudioRelay({origin:process.env.CALLSIGN_WEB_ORIGIN??'',backendOrigin:process.env.CALLSIGN_BACKEND_ORIGIN??''});
