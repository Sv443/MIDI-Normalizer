import { readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { styleText } from "node:util";
import { pathToFileURL } from "node:url";
import { Midi } from "@tonejs/midi";
import prompt from "prompts";
import type { NrmChannelsOptions, NrmConfig, NrmVelocitiesOptions } from "./types.js";
import cfgTemplate from "../config.template.json" with { type: "json" };

const { exit } = process;

function schedExit(code: number) {
  setImmediate(() => exit(code));
}

//#region run

async function run() {
  const { midiDir } = await prompt({
    name: "midiDir",
    type: "text",
    message: "Path to the directory containing the MIDI files",
  });

  const midiFiles = await findFiles(dirname(resolve(midiDir)));

  if(midiFiles.length === 0) {
    console.error(styleText("red", "No MIDI files found in the specified directory."));
    return schedExit(1);
  }

  const { outDir } = await prompt({
    name: "outDir",
    type: "text",
    message: "Path to the directory to save the normalized MIDI files",
  });

  const midis = (await Promise.all(
    midiFiles.map(async (file) => {
      try {
        return Midi.fromUrl(String(pathToFileURL(file)));
      }
      catch(e) {
        console.error(styleText("red", `Error reading MIDI file ${file}:`), e);
        return null;
      }
    })
  )).filter((midi): midi is Midi => midi !== null);

  if(midis.length === 0) {
    console.error(styleText("red", "No valid MIDI files found."));
    return schedExit(1);
  }

  const config = await loadConfig();

  const velNormalized = normalizeVelocities(midis, config.velocities);
  const chNormalized = normalizeChannels(velNormalized, config.channels);

  await Promise.all(
    chNormalized.map(async (midi) => {
      const outFile = resolve(`${outDir}/${midi.name}.mid`);
      try {
        await writeFile(outFile, midi.toArray());
        console.log(styleText("green", `Saved normalized MIDI file to ${outFile}`));
      }
      catch(e) {
        console.error(styleText("red", `Error saving MIDI file ${outFile}:`), e);
      }
    })
  );
}

run();

//#region config

/** Loads the config and returns it. If it doesnt exist, creates a default config from config.template.json and returns it. */
async function loadConfig(): Promise<NrmConfig> {
  const configPath = resolve("config.json");
  try {
    const config = await import(configPath);
    return config.default;
  }
  catch {
    console.log(styleText("yellow", "Couldn't load config file, creating a new one..."));
    await writeFile(configPath, JSON.stringify(cfgTemplate, null, 2));
    return cfgTemplate as NrmConfig;
  }
}

//#region findFiles

/** Returns an array of all MIDI files in the given directory, with absolute paths */
async function findFiles(baseDir: string) {
  const files = await readdir(baseDir, { withFileTypes: true });
  const midiFiles = files
    .filter((file) => file.isFile() && file.name.match(/\.midi?$/i))
    .map((file) => resolve(`${baseDir}/${file.name}`));
  return midiFiles;
}

//#region normalizeVelocities

/**
 * Normalizes the velocities of the MIDI files according to the given options.  
 * The intent is to make the volume uniform across all MIDI files without changing the relative dynamics of the notes.
 */
function normalizeVelocities(midis: Midi[], options: NrmVelocitiesOptions): Midi[] {
  void ["TODO:", midis, options];
  return midis;
}

//#region normalizeChannels

/**
 * Normalizes the channels of the MIDI files according to the given options.  
 * The goal is to have a consistent set of channels associated to instruments, regardless of the original MIDI file input.
 */
function normalizeChannels(midis: Midi[], options: NrmChannelsOptions): Midi[] {
  void ["TODO:", midis, options];
  return midis;
}
