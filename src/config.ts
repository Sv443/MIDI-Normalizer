import { readFile, writeFile } from "node:fs/promises";
import { styleText } from "node:util";
import { scheduleExit } from "@sv443-network/coreutils";
import { argv } from "./consts.js";
import { getPathRelativeToCaller, hasProps } from "./utils.js";
import type { Config } from "./types.js";
import cfgTemplate from "../config.template.json" with { type: "json" };

/** Loads the config and returns it. If it doesnt exist, creates a default config from config.template.json and returns it. */
export async function loadConfig(): Promise<Config> {
  const configPath = getPathRelativeToCaller(argv.config);
  try {
    const config = JSON.parse(String(await readFile(configPath))) as Config;
    if(!hasProps(config, ["input", "output", "velocities", "channels"]))
      throw new Error("Invalid config format, missing one or more required properties.");
    return config as Config;
  }
  catch {
    console.log(styleText("yellow", "\nCouldn't load config file, creating a new one..."));
    await writeFile(configPath, JSON.stringify(cfgTemplate, null, 2));
    console.log(styleText("green", `Created new config file at ${argv.config}\nPlease edit it, then run the script again.\n`));
    return scheduleExit(0), cfgTemplate as Config;
  }
}
