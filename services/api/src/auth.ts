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

export async function sessionForRequest(db: Database, request: FastifyRequest): Promise<AuthSession> {
  const token = request.cookies.ip_session;
  if (!token) throw new HttpError(401, "AUTH_REQUIRED");
  const rows = await db.select({
    sessionId: sessions.id,
    userId: users.id,
    displayName: users.displayName,
    role: users.role,
    csrfToken: sessions.csrfToken,
  }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!rows[0]) throw new HttpError(401, "SESSION_EXPIRED");
  return rows[0];
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
