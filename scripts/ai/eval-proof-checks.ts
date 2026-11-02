// M6-01 acceptance: run the vision proof check over a labelled photo set and report agreement.
//   AI_API_KEY=… AI_MODEL=… bun scripts/ai/eval-proof-checks.ts path/to/labels.json
// labels.json: [{ "photo": "https://… or ./local.jpg", "challenge": "a street mural",
//                 "expected": "pass" | "fail", "unsafe": false }, …]   (about 100 rows)
// Target: at least 90% agreement on the clear pass / fail rows, and every "unsafe" row flagged.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAiModel } from "../../src/integrations/ai/index.server";
import { visionProofChecker } from "../../src/integrations/ai/proof-check.server";

type Row = { photo: string; challenge: string; expected: "pass" | "fail"; unsafe?: boolean };

const file = process.argv[2];
if (!file) throw new Error("Usage: bun scripts/ai/eval-proof-checks.ts labels.json");
const ai = getAiModel();
if (!ai) throw new Error("Set AI_API_KEY and AI_MODEL first.");
const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];
const check = visionProofChecker(ai.model);
let agree = 0;
let unsure = 0;
let unsafeCaught = 0;
const unsafeRows = rows.filter((r) => r.unsafe).length;
for (const row of rows) {
  const url = /^https?:/.test(row.photo)
    ? row.photo
    : `data:image/jpeg;base64,${readFileSync(resolve(file, "..", row.photo)).toString("base64")}`;
  const v = await check({ challenge: row.challenge, photoUrl: url });
  if (v.verdict === row.expected) agree++;
  if (v.verdict === "unsure") unsure++;
  if (row.unsafe && v.safetyFlags.length) unsafeCaught++;
  console.log(
    `${v.verdict.padEnd(6)} (want ${row.expected}) ${v.safetyFlags.join(",")}  ${row.challenge}`,
  );
}
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
console.log(
  `\nAgreement ${pct(agree, rows.length)} (${agree}/${rows.length}), unsure ${unsure}, unsafe flagged ${pct(unsafeCaught, unsafeRows)}`,
);
process.exit(agree / Math.max(1, rows.length) >= 0.9 && unsafeCaught === unsafeRows ? 0 : 1);
