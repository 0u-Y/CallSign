export class LiveMedia {
  readonly peer: RTCPeerConnection;
  private microphone: MediaStream | undefined;
  private sender: RTCRtpSender | undefined;
  private accepted = false;
  private muted = true;
  private switching = false;
  private recording: {stream: MediaStream; stop:()=>void} | undefined;
  private pendingSourceStop: (()=>void) | undefined;
  private clearRecording() {this.recording?.stop();this.recording=undefined;}
  async playRecording(file: File,onEnded:()=>void=()=>{}) {
    if(this.closed||!this.accepted||!this.sender||this.switching)throw new Error('AUDIO_SOURCE_NOT_READY');
    if(!file.size||file.size>20*1024*1024)throw new Error('AUDIO_FILE_SIZE_INVALID');
    this.switching=true;
    let stop:()=>void=()=>{};
    try {
      const context=new AudioContext(),audio=new Audio(),url=URL.createObjectURL(file);let stream:MediaStream|undefined,released=false;
      stop=()=>{if(released)return;released=true;audio.onended=null;audio.pause();audio.removeAttribute('src');audio.load();stream?.getTracks().forEach(t=>{t.enabled=false;t.stop();});void context.close();URL.revokeObjectURL(url);};
      this.pendingSourceStop=stop;audio.src=url;audio.onended=()=>{if(!this.closed&&this.recording?.stop===stop){stop();onEnded();}};
      const destination=context.createMediaStreamDestination();stream=destination.stream;context.createMediaElementSource(audio).connect(destination);
      const track=stream.getAudioTracks()[0]!;track.enabled=false;
      await context.resume();if(this.closed)throw new Error('MEDIA_CLOSED');await audio.play();
      if(this.closed)throw new Error('MEDIA_CLOSED');
      await this.sender.replaceTrack(track);
      if(this.closed)throw new Error('MEDIA_CLOSED');
      this.clearRecording();this.recording={stream,stop};this.pendingSourceStop=undefined;this.mute(this.muted);
    } catch(error) {stop();this.pendingSourceStop=undefined;throw error;}
    finally {this.switching=false;}
  }
  async useMicrophone() {
    if(this.closed||!this.accepted||!this.sender||this.switching)throw new Error('AUDIO_SOURCE_NOT_READY');
    const track=this.microphone?.getAudioTracks()[0];if(!track||track.readyState!=='live')throw new Error('MICROPHONE_UNAVAILABLE');
    this.switching=true;
    try {await this.sender.replaceTrack(track);if(this.closed)throw new Error('MEDIA_CLOSED');this.clearRecording();this.mute(this.muted);}
    finally {this.switching=false;}
  }
  private remoteAccepted = false;
  private closed = false;
  readonly remote = new MediaStream();
  constructor(iceServers: RTCIceServer[], private readonly invalidate: (reason: string) => void, factory = (config: RTCConfiguration) => new RTCPeerConnection(config)) {
    this.peer = factory({ bundlePolicy: "max-bundle", iceServers });
    this.peer.ontrack = e => { if (e.track.kind === "audio") {e.track.enabled=this.remoteAccepted;this.remote.addTrack(e.track);} };
    this.peer.onconnectionstatechange = () => { if (["disconnected", "failed", "closed"].includes(this.peer.connectionState)) { this.invalidate("연결 변경: 새 통화 시도와 재검증이 필요합니다."); this.close(); } };
  }
  async prepareMicrophone(getUserMedia = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints),deviceId?:string) {
    if (this.microphone || this.closed) throw new Error("MICROPHONE_SESSION_INVALID");
    const stream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true,...(deviceId?{deviceId:{exact:deviceId}}:{}) }, video: false });
    for (const track of stream.getTracks()) track.enabled = false;
    if (this.closed) { stream.getTracks().forEach(t => t.stop()); throw new Error("MEDIA_CLOSED"); }
    this.microphone = stream;
    const microphone = stream.getAudioTracks()[0];
    if (!microphone || microphone.readyState !== "live") { this.close(); throw new Error("MICROPHONE_UNAVAILABLE"); }
    // Negotiate sendrecv with a disabled track; attaching only after acceptance negotiates recvonly.
    try { this.sender = this.peer.addTrack(microphone, stream); } catch (error) { this.close(); throw error; }
    if (this.closed) throw new Error("MEDIA_CLOSED");
    for (const track of stream.getTracks()) track.onended = () => { this.invalidate("마이크 장치가 종료됐습니다."); this.close(); };
  }
  async accept(startMuted=false) {
    if (this.closed || !this.microphone || !this.sender) throw new Error("MICROPHONE_NOT_READY");
    const track = this.microphone.getAudioTracks()[0]; if (!track || track.readyState === "ended") throw new Error("MICROPHONE_UNAVAILABLE");
    if(this.accepted)return;
    await this.sender.replaceTrack(track); if (this.closed || this.microphone.getAudioTracks()[0]?.readyState !== "live") throw new Error("MEDIA_CLOSED"); this.accepted = true;this.muted=startMuted;track.enabled=!startMuted;if(!startMuted){this.remoteAccepted=true;for(const incoming of this.remote.getTracks())incoming.enabled=true;}
  }
  mute(value: boolean) {
    this.muted=value;const enabled=this.accepted&&!value&&!this.closed;
    for(const track of this.microphone?.getAudioTracks()??[])track.enabled=enabled&&!this.recording;
    for(const track of this.recording?.stream.getAudioTracks()??[])track.enabled=enabled;
  }
  pause(){this.mute(true);this.remoteAccepted=false;for(const track of this.remote.getTracks())track.enabled=false;}
  resume(muted:boolean){if(!this.accepted||this.closed)throw new Error("MEDIA_NOT_ACCEPTED");this.remoteAccepted=true;for(const track of this.remote.getTracks())track.enabled=true;this.mute(muted);}
  close() {
    if (this.closed) return; this.closed = true; this.accepted = false;this.pendingSourceStop?.();this.pendingSourceStop=undefined;this.clearRecording();
    for (const track of this.microphone?.getTracks() ?? []) { track.enabled = false; track.onended = null; track.stop(); }
    for (const track of this.remote.getTracks()) track.stop(); this.peer.close();
  }
}

export function streamRemoteAudio(stream: MediaStream, attemptId: string, onEvent: (value: unknown) => void, version: 2 | 3 = 2) {
  if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus") || !stream.getAudioTracks().length) throw new Error("REMOTE_AUDIO_RECORDING_UNSUPPORTED");
  const url = new URL(`/api/v${version}/audio?attemptId=${encodeURIComponent(attemptId)}`, location.origin); url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url); const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 }); let stopped = false;
  socket.onmessage = event => {
    if (stopped) return;
    try { const value = JSON.parse(String(event.data)); onEvent(value);
      if (value.type === "ready") socket.send(JSON.stringify({ type: "consent", consent: true }));
      if (value.type === "provider-ready" && recorder.state === "inactive" && !stopped) recorder.start(250);
      if (value.type === "unavailable") stop();
    } catch { onEvent({ type: "unavailable", code: "AUDIO_MESSAGE_INVALID" }); stop(); }
  };
  recorder.ondataavailable = event => { if (!stopped && event.data.size && socket.readyState === WebSocket.OPEN) { if (socket.bufferedAmount > 524288) { onEvent({ type: "unavailable", code: "BROWSER_BACKPRESSURE" }); stop(); } else socket.send(event.data); } };
  const stop = () => { if (stopped) return; stopped = true; if (recorder.state !== "inactive") recorder.stop(); if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop", consent: false })); socket.close(); };
  socket.onerror = () => { onEvent({ type: "unavailable", code: "AUDIO_CONNECTION_FAILED" }); stop(); };
  socket.onclose = () => { if (!stopped) onEvent({ type: "unavailable", code: "AUDIO_CONNECTION_CLOSED" }); stop(); };
  return stop;
}
