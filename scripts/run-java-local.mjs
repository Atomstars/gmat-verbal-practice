#!/usr/bin/env node
/** Load server-only local settings without copying secrets between services. */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const service = process.argv[2];
if (!new Set(["backend", "rag-service", "progress-service"]).has(service)) {
  console.error("Usage: node scripts/run-java-local.mjs <backend|rag-service|progress-service>");
  process.exit(2);
}

const root = resolve(import.meta.dirname, "..");
const env = { ...process.env };
for (const line of readFileSync(resolve(root, "backend", ".env.local"), "utf8").split(/\r?\n/)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
  const separator = line.indexOf("=");
  env[line.slice(0, separator)] = line.slice(separator + 1);
}

const command = process.platform === "win32" ? "cmd.exe" : "mvn";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "mvn spring-boot:run"] : ["spring-boot:run"];
const child = spawn(command, args, {
  cwd: resolve(root, service),
  env,
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
