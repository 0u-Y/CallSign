import { expect, test } from "@playwright/test";
test("v2 real microphone acceptance and cleanup (requires separately approved live stack)", async ({ browser }) => {
  const gatewayStorage = process.env.CALLSIGN_MEDIA_GATEWAY_STORAGE;
  const recipientStorage = process.env.CALLSIGN_MEDIA_RECIPIENT_STORAGE;
  const intentId = process.env.CALLSIGN_MEDIA_INTENT_ID;
  const credential = process.env.CALLSIGN_MEDIA_CREDENTIAL_DIGEST;
  test.skip(!gatewayStorage || !recipientStorage || !intentId || !credential || !process.env.CALLSIGN_MEDIA_ORIGIN, "NOT-RUN: approved v2 origin, live role sessions, assigned intent and registered credential are required");
  const senderContext = await browser.newContext({ storageState: gatewayStorage!, permissions: ["microphone"] });
  const receiverContext = await browser.newContext({ storageState: recipientStorage!, permissions: ["microphone"] });
  try {
    await senderContext.addInitScript(() => {
      const peers: RTCPeerConnection[] = []; (window as unknown as { __callsignPeers: RTCPeerConnection[] }).__callsignPeers = peers;
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer { constructor(config?: RTCConfiguration) { super(config); peers.push(this); } };
    });
    const sender = await senderContext.newPage(), receiver = await receiverContext.newPage();
    await sender.goto(`${process.env.CALLSIGN_MEDIA_ORIGIN}/finals`);
    await sender.locator("li").filter({ hasText: intentId! }).getByRole("button", { name: "새 통화 시도" }).click();
    await sender.getByLabel("유효 위임").selectOption(credential!);
    await sender.getByRole("button", { name: "Sender 허가와 기관 승인 발급" }).click();
    const attemptId = await sender.getByLabel("통화 시도", { exact: true }).inputValue();
    await receiver.goto(`${process.env.CALLSIGN_MEDIA_ORIGIN}/finals`);
    await receiver.getByLabel("통화 시도", { exact: true }).selectOption(attemptId);
    await sender.getByRole("button", { name: "마이크 준비 및 연결 대기" }).click();
    await receiver.getByRole("button", { name: "마이크 준비 및 연결 대기" }).click();
    await expect(sender.getByText(/연결 대기: 상대도/)).toBeVisible();
    await expect(receiver.getByText(/연결 대기: 상대도/)).toBeVisible();
    await sender.getByRole("button", { name: "통화 발신", exact: true }).click();
    await expect(receiver.getByRole("button", { name: "검증한 통화 수락" })).toBeEnabled({ timeout: 20000 });
    const audioBytes = () => sender.evaluate(async () => {
      let bytes = 0;
      for (const peer of (window as unknown as { __callsignPeers: RTCPeerConnection[] }).__callsignPeers) for (const report of (await peer.getStats()).values()) if (report.type === "outbound-rtp" && report.kind === "audio") bytes += Number(report.bytesSent ?? 0);
      return bytes;
    });
    expect(await audioBytes()).toBe(0);
    await receiver.getByRole("button", { name: "검증한 통화 수락" }).click();
    await expect.poll(audioBytes, { timeout: 10000 }).toBeGreaterThan(0);
    await expect(receiver.getByText(/통화 중: 마이크 음성 전송/)).toBeVisible();
    await receiver.getByRole("button", { name: "음소거", exact: true }).click();
    await expect(receiver.getByRole("button", { name: "음소거 해제" })).toBeVisible();
    await receiver.getByRole("button", { name: "거절·종료" }).click();
    await expect.poll(() => receiver.evaluate(() => Array.from(document.querySelectorAll("audio")).flatMap(el => (el.srcObject as MediaStream | null)?.getTracks() ?? []).every(track => track.readyState === "ended"))).toBe(true);
    // STT consent is intentionally separate; this test never calls a paid provider.
  } finally { await senderContext.close(); await receiverContext.close(); }
});
