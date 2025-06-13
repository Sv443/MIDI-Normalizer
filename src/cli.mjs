#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join } from "node:path";
import { scheduleExit } from "@sv443-network/coreutils";

const args = [
  "--no-warnings=ExperimentalWarning",
  "--enable-source-maps",
  "--loader=ts-node/esm",
  join(import.meta.dirname, "./main.ts"),
  ...process.argv.slice(2),
  ...(process.argv.every(a => !a.includes("caller-path")) ? [
    "--caller-path",
    `"${btoa(encodeURIComponent(process.cwd()))}"`,
  ] : []),
];

const child = spawn("node", args, {
  stdio: "inherit",
  cwd: join(import.meta.dirname, "../"),
});

child.on("exit", (code, signal) => {
  if(code)
    scheduleExit(code);
  else if(signal)
    process.kill(process.pid, signal);
});
