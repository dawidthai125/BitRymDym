// Wypisuje id rekordu aplikacji w App Store Connect dla bundle ID (pusty wynik = rekordu brak).
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (plik .p8). Użycie: node scripts/asc-app-id.mjs pl.bitrymdym.app
import crypto from "node:crypto";
import fs from "node:fs";

const bundleId = process.argv[2] ?? "pl.bitrymdym.app";
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unsigned = `${b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })}`;
const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: fs.readFileSync(ASC_KEY_PATH, "utf8"), dsaEncoding: "ieee-p1363" });
const res = await fetch(
  `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`,
  { headers: { Authorization: `Bearer ${unsigned}.${sig.toString("base64url")}` } },
);
if (!res.ok) {
  console.error(`App Store Connect API: HTTP ${res.status}`);
  process.exit(2);
}
const { data } = await res.json();
const app = data.find((a) => a.attributes?.bundleId === bundleId);
process.stdout.write(app ? app.id : "");
