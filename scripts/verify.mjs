#!/usr/bin/env node
/** quality gate for the webui: format → lint → typecheck → unit → contract → build */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  console.log(`\n==> ${label}\n> ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\n[verify] FAILED: ${label}`);
    process.exit(r.status ?? 1);
  }
}

run("format check", "npm", ["run", "format:check"]);
run("lint", "npm", ["run", "lint"]);
run("typecheck (renderer)", "npx", ["tsc", "--noEmit", "-p", "tsconfig.renderer.json"]);
run("dependency contract", "node", ["scripts/check-dependency-contract.mjs"]);
run("architecture boundaries and structure", "node", ["scripts/check-architecture.mjs"]);
run("unit tests", "npm", ["test"]);
run("contract coverage", "node", ["scripts/check-contract-coverage.mjs"]);
run("Browser i18n invariants", "npm", ["run", "check:browser-i18n"]);
run("build", "npm", ["run", "build:renderer"]);

console.log("\n[verify] all checks passed\n");
