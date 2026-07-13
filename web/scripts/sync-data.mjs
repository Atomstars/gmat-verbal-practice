/**
 * Copies the question banks + embeddings + diagrams from the repo root
 * (single source of truth, written by the Python pipeline) into web/public/
 * so the Next.js app can fetch them. Runs automatically before dev/build.
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const pub = join(here, "..", "public");

const dataFiles = [
  "questions-og.json",
  "questions.json",
  "questions-quant.json",
  "embeddings.json",
];

mkdirSync(join(pub, "data"), { recursive: true });
for (const f of dataFiles) {
  const src = join(root, f);
  if (!existsSync(src)) {
    console.warn(`sync-data: MISSING ${f} (run the pipeline from repo root)`);
    continue;
  }
  cpSync(src, join(pub, "data", f));
  console.log(`sync-data: ${f}`);
}

const diagrams = join(root, "diagrams");
if (existsSync(diagrams)) {
  cpSync(diagrams, join(pub, "diagrams"), { recursive: true });
  console.log("sync-data: diagrams/");
}
