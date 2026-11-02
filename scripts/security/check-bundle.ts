// M6-07: fails if anything server-only reaches the browser bundle (.output/public). Run after
// `bun run build`:   bun scripts/security/check-bundle.ts
// It looks for the names of server secrets and server-only modules, a service-role JWT, and the
// actual secret values when they are set in this environment (as in the deploy script).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", ".output", "public");
const names = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "EMAIL_API_KEY",
  "AI_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "SMTP_PASS",
  "GOOGLE_CLIENT_SECRET",
  "client.server",
  "supabaseAdmin",
];
// base64 of "service_role" as it appears inside a JWT payload, at each of the three alignments.
const jwtRole = ["c2VydmljZV9yb2xl", "NlcnZpY2Vfcm9sZ", "zZXJ2aWNlX3JvbG"];
const values = names
  .map((n) => process.env[n])
  .filter((v): v is string => typeof v === "string" && v.length >= 12);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.(js|mjs|css|html|json|map|webmanifest)$/.test(f)
        ? [p]
        : [];
  });
}

const problems: string[] = [];
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  for (const n of names) if (text.includes(n)) problems.push(`${file}: mentions ${n}`);
  for (const r of jwtRole)
    if (text.includes(r)) problems.push(`${file}: looks like a service-role JWT`);
  for (const v of values) if (text.includes(v)) problems.push(`${file}: contains a secret value`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`No server secrets in ${root}`);
