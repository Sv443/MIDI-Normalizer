#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join } from "node:path";

const args = [
  "--no-warnings=ExperimentalWarning",
  "--enable-source-maps",
  "--loader=ts-node/esm",
  join(import.meta.dirname, "./index.ts"),
  ...process.argv.slice(2),
  "--caller-path",
  `"${btoa(encodeURIComponent(process.cwd()))}"`,
];

console.log(args);

const child = spawn("node", args, {
  stdio: "inherit",
  cwd: join(import.meta.dirname, "../"),
});

child.on("exit", (code, signal) =>
  setImmediate(() => {
    if(code)
      process.exit(code);
    else if(signal)
      process.kill(process.pid, signal);
  })
);
