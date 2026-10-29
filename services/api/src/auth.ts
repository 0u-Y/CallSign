import type {} from "@fastify/cookie";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import { sessions, users } from "./schema.js";

export interface AuthSession {
  sessionId: string;
  userId: string;
  displayName: string;
  role: string;
  csrfToken: string;
  purpose: string;
  expiresAt: Date;
  authenticatedAt?:Date;
  membershipGeneration?:number;
}

export interface SessionPolicy {
  purpose: "work" | "official";
  issuer: string;
  clientId: string;
  audience: string;
}

export function sessionCookie(purpose: "legacy" | "work" | "official"): "ip_session" | "official_session" {
  return purpose === "official" ? "official_session" : "ip_session";
}

export class HttpError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message = code) {
    super(message);
  }
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function sessionForRequest(db: Database, request: FastifyRequest, policy?: SessionPolicy): Promise<AuthSession> {
  const purpose = policy?.purpose ?? "legacy";
  const token = request.cookies[sessionCookie(purpose)];
  if (!token) throw new HttpError(401, "AUTH_REQUIRED");
  const rows = await db.select({
    sessionId: sessions.id,
    userId: users.id,
    displayName: users.displayName,
    role: users.role,
    csrfToken: sessions.csrfToken,
    purpose: sessions.purpose,
    expiresAt: sessions.expiresAt,
    oidcIssuer: sessions.oidcIssuer,
    oidcClientId: sessions.oidcClientId,
    oidcAudience: sessions.oidcAudience,
    authenticatedAt: sessions.authenticatedAt,
    membershipGeneration:sessions.membershipGeneration,
  }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!rows[0]) throw new HttpError(401, "SESSION_EXPIRED");
  const row = rows[0];
  if (row.purpose !== purpose || (policy && (row.oidcIssuer !== policy.issuer || row.oidcClientId !== policy.clientId || row.oidcAudience !== policy.audience || !row.authenticatedAt))) {
    throw new HttpError(403, purpose === "official" ? "OFFICIAL_SCOPE_REQUIRED" : "SESSION_SCOPE_INVALID");
  }
  return { membershipGeneration:row.membershipGeneration??0,sessionId: row.sessionId, userId: row.userId, displayName: row.displayName, role: row.role, csrfToken: row.csrfToken, purpose: row.purpose, expiresAt: row.expiresAt, ...(row.authenticatedAt?{authenticatedAt:row.authenticatedAt}:{}) };
}

export function requireRole(session: AuthSession, ...roles: string[]): void {
  if (!roles.includes(session.role)) throw new HttpError(403, "ROLE_FORBIDDEN");
}

export function assertCsrf(request: FastifyRequest, session: AuthSession, allowedOrigin: string): void {
  if (request.headers.origin !== allowedOrigin) throw new HttpError(403, "ORIGIN_FORBIDDEN");
  const supplied = request.headers["x-csrf-token"];
  if (typeof supplied !== "string") throw new HttpError(403, "CSRF_REQUIRED");
  const expectedBytes = Buffer.from(session.csrfToken);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) throw new HttpError(403, "CSRF_INVALID");
}

export function assertRecentAuthentication(session:Pick<AuthSession,'authenticatedAt'>,now=Date.now()){
 const at=session.authenticatedAt?.getTime();if(at===undefined||!Number.isFinite(at)||now-at>300000||at>now+1000)throw new HttpError(403,'RECENT_AUTHENTICATION_REQUIRED');
}
