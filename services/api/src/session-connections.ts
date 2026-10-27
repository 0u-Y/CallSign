// Logout closes local connections immediately; periodic checks cover expiry and other replicas.
export class SessionConnections {
  private readonly sessions = new Map<string, Set<() => void>>();

  watch(sessionId: string, check: () => Promise<void>, invalidate: () => void, intervalMs = 1000, checkTimeoutMs = 2000): () => void {
    let closed = false, checking = false;
    let checkDeadline: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (closed) return;
      closed = true; clearInterval(timer); clearTimeout(checkDeadline);
      const entries = this.sessions.get(sessionId);
      entries?.delete(revoke);
      if (!entries?.size) this.sessions.delete(sessionId);
    };
    const revoke = () => { if (closed) return; stop(); invalidate(); };
    const poll = async () => {
      if (closed || checking) return;
      checking = true;
      try {
        await Promise.race([check(), new Promise<never>((_resolve, reject) => {
          checkDeadline = setTimeout(() => reject(new Error("SESSION_CHECK_TIMEOUT")), checkTimeoutMs);
          checkDeadline.unref?.();
        })]);
      } catch { revoke(); } finally { clearTimeout(checkDeadline); checking = false; }
    };
    const timer = setInterval(() => { void poll(); }, intervalMs);
    timer.unref?.();
    const entries = this.sessions.get(sessionId) ?? new Set<() => void>();
    entries.add(revoke); this.sessions.set(sessionId, entries);
    void poll();
    return stop;
  }

  revoke(sessionId: string) { for (const revoke of [...(this.sessions.get(sessionId) ?? [])]) revoke(); }
  close() { for (const id of [...this.sessions.keys()]) this.revoke(id); }
}
