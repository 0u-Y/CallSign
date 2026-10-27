import { z } from "zod";
const secret = z.string().min(32);
export const finalsEnvironmentSchema = z.object({
  SERVICE_ROLE: z.enum(["platform", "issuer", "sender"]),
  WEB_ORIGIN: z.string().url(), PUBLIC_DEPLOYMENT: z.enum(["true", "false"]).default("false"),
  PLATFORM_INTERNAL_TOKEN: secret, SENDER_INTERNAL_TOKEN: secret.optional(),
  ISSUER_URL: z.string().url(), SENDER_URL: z.string().url(),
  INSTITUTION_ID: z.string().min(16), NETWORK_ID: z.string().regex(/^\d+$/), REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4100),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  TRUST_BUNDLE_PATH: z.string().min(1),
}).passthrough().superRefine((e, ctx) => {
  const origin = new URL(e.WEB_ORIGIN);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && e.PUBLIC_DEPLOYMENT !== "true") ctx.addIssue({ code: "custom", message: "External origin requires explicit public deployment mode" });
  if (origin.origin !== e.WEB_ORIGIN) ctx.addIssue({ code: "custom", message: "WEB_ORIGIN must be an origin" });
  if (e.SERVICE_ROLE !== "platform" && !e.SENDER_INTERNAL_TOKEN) ctx.addIssue({ code: "custom", message: "Sender channel credential required" });
  if (e.PLATFORM_INTERNAL_TOKEN === e.SENDER_INTERNAL_TOKEN) ctx.addIssue({ code: "custom", message: "Service credentials must differ" });
  if (e.PUBLIC_DEPLOYMENT === "true" && (origin.protocol !== "https:" || e.DEMO_MODE !== "false")) ctx.addIssue({ code: "custom", message: "Public deployment requires HTTPS and demo disabled" });
  for (const field of ["ISSUER_URL", "SENDER_URL"] as const) { const url = new URL(e[field]); if (url.username || url.password || url.search || url.hash || url.pathname !== "/") ctx.addIssue({ code: "custom", message: `${field} must be a fixed internal origin` }); }
});
export function finalsEnvironment(env: NodeJS.ProcessEnv) { return finalsEnvironmentSchema.parse(env); }
