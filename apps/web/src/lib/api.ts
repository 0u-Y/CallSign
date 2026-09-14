export interface SessionUser { id: string; displayName: string; role: string }

let csrfToken = sessionStorage.getItem("ip_csrf") ?? "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase()) && csrfToken) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, value?.error?.code ?? "REQUEST_FAILED", value?.error?.message ?? "요청을 처리하지 못했습니다.");
  return value as T;
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
