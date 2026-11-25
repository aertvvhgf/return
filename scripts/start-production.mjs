import { spawn } from "node:child_process";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runMigration() {
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const result = await new Promise(resolve => {
      const child = spawn("node", ["scripts/ensure-local-auth-schema.mjs"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
      child.on("close", code => resolve(code ?? 1));
      child.on("error", error => { lastError = error; resolve(1); });
    });
    if (result === 0) return;
    console.error(`[Startup] Database migration attempt ${attempt}/12 failed`, lastError?.message ?? "");
    await sleep(5000);
  }
  throw new Error("Database migration failed after 12 attempts");
}

await runMigration();
const server = spawn("node", ["dist/index.js"], { stdio: "inherit", env: process.env });
const shutdown = signal => { server.kill(signal); };
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
server.on("exit", code => process.exit(code ?? 1));
