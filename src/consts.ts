import _yargs from "yargs";
import pkg from "../package.json" with { type: "json" };

export const yargs = _yargs(process.argv.slice(2), process.cwd())
  .scriptName("midinormalizer")
  .usage("$ $0 [options]")
  .version(pkg.version)
  .option("config", {
    type: "string",
    alias: ["c", "cfg"],
    description: "Path to the configuration file (default: config.json)",
    default: "config.json",
  })
  .option("callerPath", {
    type: "string",
    description: "URI- and B64-encoded path of the directory the process was created from",
    default: btoa(encodeURIComponent(process.cwd())),
  })
  .option("help", {
    type: "boolean",
    alias: ["h", "H", "help", "?"],
    description: "Show this help message",
    default: false,
  })
  .option("version", {
    type: "boolean",
    alias: ["v", "V", "version"],
    description: "Show the current version",
  })
  .example("$ $0 -c myconfig.json", "Run the script with the given config file")
  .strict();

export const argv = yargs.parseSync();
