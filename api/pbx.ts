import {createPbxRelay} from '../services/api/src/pbx-relay.js';
export const maxDuration=300;
export default createPbxRelay({origin:process.env.CALLSIGN_WEB_ORIGIN??'',backendOrigin:process.env.CALLSIGN_BACKEND_ORIGIN??''});
