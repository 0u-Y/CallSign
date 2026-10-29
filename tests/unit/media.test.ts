import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { turnCredentials, verifyPbxMapping } from "../../services/api/src/media.js";
import { LiveMedia } from "../../apps/web/src/lib/liveMedia.js";

describe("TURN/PBX boundaries", () => {
  it("issues scoped, bounded TURN credentials and refuses malformed URLs", () => {
    const result = turnCredentials({ urls: ["turns:turn.example:5349?transport=tcp"], secret: "s".repeat(32), sessionId: "session", userId: "recipient", now: 1000, ttl: 5000 });
    expect(result.expiresAt).toBe(1300); const server = result.iceServers[0]!;
    expect(server.credential).toBe(createHmac("sha1", "s".repeat(32)).update(server.username).digest("base64"));
    expect(() => turnCredentials({ urls: ["https://evil.example"], secret: "s".repeat(32), sessionId: "session", userId: "recipient", now: 1000 })).toThrow();
  });
  it("binds PBX evidence to a particular edge, leg and authorized session", () => {
    const leg = { version: 2, type: "PbxLegMapping", edgeId: "edge-1", attemptId: "attempt", sessionId: "session", bindingHash: "a".repeat(64), channelId: "channel", bridgeId: "bridge", endpoint: "media-edge", issuedAt: 1000, expiresAt: 1050 };
    const raw = JSON.stringify(leg); const secret = "s".repeat(32); const mac = createHmac("sha256", secret).update(raw).digest("hex");
    const expected = { edgeId: leg.edgeId, attemptId: leg.attemptId, sessionId: leg.sessionId, bindingHash: leg.bindingHash };
    expect(verifyPbxMapping({ raw, mac, secret, expected, now: 1001 }).endpoint).toBe("media-edge");
    expect(() => verifyPbxMapping({ raw, mac, secret, expected: { ...expected, sessionId: "other" }, now: 1001 })).toThrow("PBX_MAPPING_CONTEXT_INVALID");
    expect(() => verifyPbxMapping({ raw, mac, secret, expected, now: 1050 })).toThrow();
  });
});
describe("microphone lifecycle without a browser or microphone", () => {
  it('keeps both audio directions paused across asynchronous attachment until current verification explicitly resumes them',async()=>{
    const microphone={enabled:true,readyState:'live',onended:null,stop:vi.fn()},incoming={kind:'audio',enabled:true,stop:vi.fn()};let finish!:()=>void;
    const peer={addTransceiver:()=>({sender:{replaceTrack:()=>new Promise<void>(resolve=>{finish=resolve;})}}),close:vi.fn(),connectionState:'new',ontrack:undefined as undefined|((e:{track:typeof incoming})=>void)};
    vi.stubGlobal('MediaStream',class {tracks:unknown[]=[];addTrack(track:unknown){this.tracks.push(track);}getTracks(){return this.tracks;}});
    const media=new LiveMedia([],()=>{},()=>peer as unknown as RTCPeerConnection);await media.prepareMicrophone(async()=>({getTracks:()=>[microphone],getAudioTracks:()=>[microphone]}) as unknown as MediaStream);
    peer.ontrack!({track:incoming});expect(incoming.enabled).toBe(false);const accepted=media.accept(true);media.pause();finish();await accepted;
    expect(microphone.enabled).toBe(false);expect(incoming.enabled).toBe(false);media.resume(true);expect(incoming.enabled).toBe(true);expect(microphone.enabled).toBe(false);media.pause();expect(incoming.enabled).toBe(false);media.resume(false);expect(microphone.enabled).toBe(true);media.close();expect(()=>media.resume(false)).toThrow('MEDIA_NOT_ACCEPTED');
  });
  it("attaches no track before acceptance, gates mute and cleans up tracks", async () => {
    const stop = vi.fn(); const track = { enabled: true, readyState: "live", onended: null, stop }; const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const replaceTrack = vi.fn(async () => {}); const close = vi.fn();
    const peer = { addTransceiver: () => ({ sender: { replaceTrack } }), close, connectionState: "new" };
    vi.stubGlobal("MediaStream", class { getTracks() { return []; } });
    const media = new LiveMedia([], () => {}, () => peer as unknown as RTCPeerConnection);
    await media.prepareMicrophone(async () => stream as unknown as MediaStream);
    expect(track.enabled).toBe(false); expect(replaceTrack).not.toHaveBeenCalled();
    media.mute(false); expect(track.enabled).toBe(false);
    await media.accept(); expect(track.enabled).toBe(true); expect(replaceTrack).toHaveBeenCalledOnce();
    media.mute(true); expect(track.enabled).toBe(false); media.close(); media.close(); expect(stop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  });
});
