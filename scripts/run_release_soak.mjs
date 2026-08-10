#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const evidenceIndex = process.argv.indexOf("--evidence");
const evidencePath =
  evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : undefined;
if (evidenceIndex >= 0 && !evidencePath)
  throw new Error("--evidence requires a path");

function run(command, argumentsList, environment = process.env) {
  const result = spawnSync(command, argumentsList, {
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"]);
const startedAt = Date.now();
process.stdout.write(
  `FreeSki fixed 20-minute soak started ${new Date(startedAt).toISOString()}\n`,
);
run(
  resolve("node_modules/.bin/playwright"),
  [
    "test",
    "--config",
    "playwright.production.config.ts",
    "tests/e2e/soak.spec.ts",
  ],
  {
    ...process.env,
    ...(evidencePath ? { FREESKI_GATE7_SOAK: resolve(evidencePath) } : {}),
    FREESKI_RUN_SOAK: "1",
  },
);
process.stdout.write(
  `FreeSki fixed soak completed ${new Date().toISOString()} after ${Date.now() - startedAt} ms\n`,
);
