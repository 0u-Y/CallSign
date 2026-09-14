import { resolve } from "node:path";
import { loadOrCreateSigningKey } from "../services/api/src/keys.js";

const directory = resolve(import.meta.dirname, "../.local/test-keys");
const issuer = await loadOrCreateSigningKey(resolve(directory, "issuer-ed25519.json"));
const enrollment = await loadOrCreateSigningKey(resolve(directory, "enrollment-ed25519.json"));
console.log(JSON.stringify({ issuerKid: issuer.kid, enrollmentKid: enrollment.kid }));
