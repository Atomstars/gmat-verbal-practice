/**
 * Copies public diagram assets only. Question banks and embeddings are published
 * to Supabase and must never enter public/.
 */
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const pub = join(here, "..", "public");

const diagrams = join(root, "diagrams");
if (existsSync(diagrams)) {
  cpSync(diagrams, join(pub, "diagrams"), { recursive: true });
  console.log("sync-data: diagrams/");
}
