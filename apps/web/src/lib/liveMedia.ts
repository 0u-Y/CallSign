export class LiveMedia {
  readonly peer: RTCPeerConnection;
  private microphone: MediaStream | undefined;
  private sender: RTCRtpSender;
  private accepted = false;
  private closed = false;
  readonly remote = new MediaStream();
  constructor(iceServers: RTCIceServer[], private readonly invalidate: (reason: string) => void, factory = (config: RTCConfiguration) => new RTCPeerConnection(config)) {
    this.peer = factory({ bundlePolicy: "max-bundle", iceServers });
    this.sender = this.peer.addTransceiver("audio", { direction: "sendrecv" }).sender;
    this.peer.ontrack = e => { if (e.track.kind === "audio") this.remote.addTrack(e.track); };
    this.peer.onconnectionstatechange = () => { if (["disconnected", "failed", "closed"].includes(this.peer.connectionState)) { this.invalidate("연결 변경: 새 통화 시도와 재검증이 필요합니다."); this.close(); } };
  }
  async prepareMicrophone(getUserMedia = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints)) {
    if (this.microphone || this.closed) throw new Error("MICROPHONE_SESSION_INVALID");
    const stream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    for (const track of stream.getTracks()) track.enabled = false;
    if (this.closed) { stream.getTracks().forEach(t => t.stop()); throw new Error("MEDIA_CLOSED"); }
    this.microphone = stream;
    for (const track of stream.getTracks()) track.onended = () => { this.invalidate("마이크 장치가 종료됐습니다."); this.close(); };
  }
  async accept() {
    if (this.closed || !this.microphone) throw new Error("MICROPHONE_NOT_READY");
    const track = this.microphone.getAudioTracks()[0]; if (!track || track.readyState === "ended") throw new Error("MICROPHONE_UNAVAILABLE");
    await this.sender.replaceTrack(track); if (this.closed || this.microphone.getAudioTracks()[0]?.readyState !== "live") throw new Error("MEDIA_CLOSED"); track.enabled = true; this.accepted = true;
  }
  mute(value: boolean) { for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = this.accepted && !value && !this.closed; }
  close() {
    if (this.closed) return; this.closed = true; this.accepted = false;
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
