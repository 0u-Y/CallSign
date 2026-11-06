export interface SessionUser { id: string; displayName: string; role: string }

let csrfToken = sessionStorage.getItem("ip_csrf") ?? "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const filmingRole=location.pathname.match(/^\/filming\/(gateway|recipient)$/)?.[1];
  if(filmingRole&&path.startsWith('/v3/')&&!path.startsWith('/v3/auth/'))headers.set('x-callsign-filming-role',filmingRole);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase()) && csrfToken && !headers.has("x-csrf-token")) headers.set("x-csrf-token", csrfToken);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
      if (!response.ok) {
        const value = await response.json().catch(() => ({}));
        throw new ApiError(response.status, value?.error?.code ?? "REQUEST_FAILED", value?.error?.message ?? "요청을 처리하지 못했습니다.");
      }
      return await response.json() as T;
    }
    catch (error) {
      // A transient network change may interrupt reads; never replay a command here.
      if (attempt || (init.method ?? 'GET').toUpperCase() !== 'GET' || !(error instanceof TypeError) || init.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
      init.signal?.throwIfAborted();
    }
  }
}

export async function demoLogin(demoCode: string): Promise<SessionUser> {
  const result = await api<{ user: SessionUser; csrfToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ demoCode }) });
  csrfToken = result.csrfToken;
  sessionStorage.setItem("ip_csrf", csrfToken);
  return result.user;
}

export async function me(): Promise<SessionUser | null> {
  try {
    const result = await api<{ user: SessionUser; csrfToken: string }>("/auth/me");
    csrfToken = result.csrfToken;
    sessionStorage.setItem("ip_csrf", csrfToken);
    return result.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function setCsrfToken(value: string): void { csrfToken = value; sessionStorage.setItem("ip_csrf", value); }

export async function logoutSession(purpose: "work" | "official"): Promise<void> {
  const session = await api<{ csrfToken: string }>(`/v2/auth/me?purpose=${purpose}`);
  await api("/v2/auth/logout", { method: "POST", headers: { "x-csrf-token": session.csrfToken }, body: JSON.stringify({ purpose }) });
  if (purpose === "work") { csrfToken = ""; sessionStorage.removeItem("ip_csrf"); }
}
