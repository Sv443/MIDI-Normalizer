import { writeFile, readFile, stat, mkdir, readdir, unlink } from "node:fs/promises";
import { resolve, basename, extname, join } from "node:path";
import { styleText } from "node:util";
import { parseMidi, writeMidi, type MidiData } from "midi-file";
import { randomId } from "@sv443-network/coreutils";
import meow from "meow";
import type { ChannelsOptions, Config, MidiObj, MiscOptions, OutputOptions, VelocitiesOptions } from "./types.js";
import cfgTemplate from "../config.template.json" with { type: "json" };
import pkg from "../package.json" with { type: "json" };

//#region cli

const { flags } = meow({
  flags: {
    callerPath: {
      type: "string",
      description: "URI- and B64-encoded path from where the script was called",
      default: btoa(encodeURIComponent(process.cwd())),
    },
    config: {
      type: "string",
      shortFlag: "C",
      aliases: ["c", "cfg"],
      default: "config.json",
    },
    help: {
      type: "boolean",
      shortFlag: "h",
      aliases: ["H", "help", "?"],
      description: "Show this help message",
    },
    version: {
      type: "boolean",
      shortFlag: "v",
      aliases: ["V", "version"],
      description: "Show the current version",
    },
  },
  allowUnknownFlags: false,
  importMeta: import.meta,
  inferType: true,
});

console.log(flags);

if(flags.help) {
  console.log(`
  ${styleText("bold", "Usage:")}
    $ midinrm [options]

  ${styleText("bold", "Options:")}
    --config, -c  Path to the configuration file (default: config.json)
                  If it doesn't exist, it will be created with default values
    --help        Show this help message
    --version     Show the current version

  ${styleText("bold", "Example:")}
    $ midinrm -c myconfig.json
`);
  process.exit(0);
}

if(flags.version) {
  console.log(`${pkg.name} v${pkg.version}`);
  process.exit(0);
}

//#region consts

/** Fallback instrument when a MIDI track doesn't contain an `instrumentName` event. */
const defaultInstrumentName = "Grand Piano";

/** Fallback track name when a MIDI track doesn't contain a `trackName` event. */
const defaultTrackName = "Unknown Track";

const callerPath = flags.callerPath && flags.callerPath.length > 0 ? decodeURIComponent(atob(flags.callerPath.replace(/"/g, ""))) : undefined;

/** Returns the path relative to the directory from where this program was called, falls back to the current working directory */
const getPathRelativeToCaller = (path: string) => join(callerPath ?? process.cwd(), path);

/** Schedules a process exit after the current event loop tick. */
const schedExit = (code: number) => setImmediate(() => process.exit(code));

//#region run

async function run() {
  const config = await loadConfig();

  console.log("Loaded configuration.");

  const inputDir = config.input.directory;
  const filePattern = new RegExp(config.input.filePattern ?? ".*\\.midi?$", config.input.patternFlags);

  const midiFilePaths = (await readdir(getPathRelativeToCaller(inputDir)))
    .filter(path => filePattern.test(basename(path)))
    .map(file => resolve(inputDir, file));

  if(midiFilePaths.length === 0) {
    console.error(styleText("red", "No MIDI files found in the specified directory."));
    return schedExit(1);
  }

  const midisRaw: (MidiObj | null)[] = (await Promise.all(
    midiFilePaths.map(async (file) => {
      try {
        const data = parseMidi(await readFile(file));
        const [instrumentNames, trackNames] = findInstrumentAndTrackNames(data);
        return {
          path: file,
          data,
          instrumentNames,
          trackNames,
        };
      }
      catch(e) {
        console.error(styleText("red", `Error reading MIDI file ${file}:`), e);
        return null;
      }
    })
  ));

  const midis = midisRaw.filter((midi): midi is MidiObj => midi !== null);

  if(midis.length === 0) {
    console.error(styleText("red", "No valid MIDI files found."));
    return schedExit(1);
  }

  const noSilent = midis.map(removeSilent);

  console.log("Removed silent notes.");

  const velNormalized = noSilent.map(midi => normalizeVelocities(midi, config.velocities));

  console.log("Normalized velocities.");

  const chNormalized = velNormalized.map(midi => normalizeChannels(midi, config.channels));

  console.log("Normalized channels.");

  const buffersAdded = chNormalized.map(midi => addBuffers(midi, config.misc));

  console.log("Added buffers to first track, if specified.");

  const finalMidis = buffersAdded;

  console.log("Finalizing...");

  const outDir = getPathRelativeToCaller(config.output.directory);

  try {
    const outDirStat = await stat(outDir);
    if(!outDirStat.isDirectory())
      throw new Error(`Output directory ${outDir} is not a directory.`);
  }
  catch {
    await mkdir(outDir, { recursive: true });
    console.log("Created output directory:", outDir);
  }

  if(config.output.clearDirectory !== false) {
    const outFiles = (await readdir(outDir)).filter(file => filePattern.test(file));
    if(outFiles.length > 0) {
      await Promise.all(outFiles.map(file => unlink(resolve(outDir, file))));
      console.log("Cleared output directory:", outDir);
    }
  }

  await Promise.all(
    finalMidis.map(async (midi) => {
      const outFile = resolve(`${outDir}/${getOutFileName(midi, config.output)}`);
      try {
        await writeFile(outFile, Buffer.from(writeMidi(midi.data, { running: true, useByte9ForNoteOff: true })));
        console.log(styleText("green", `Saved normalized MIDI file to ${outFile}`));
      }
      catch(e) {
        console.error(styleText("red", `Error saving MIDI file ${outFile}:`), e);
      }
    })
  );
}

run();

//#region utils

/** Returns the output file name for the given MIDI object and output configuration. */
function getOutFileName(midi: MidiObj, outCfg: OutputOptions): string {
  const inBaseName = basename(midi.path);
  const inFileExt = extname(inBaseName);
  const inFileName = inBaseName.slice(0, -inFileExt.length);

  return outCfg.fileName
    .replace("${full}", inBaseName)
    .replace("${name}", inFileName)
    .replace("${ext}", inFileExt.startsWith(".") ? inFileExt.slice(1) : inFileExt);
}

/** Finds the `instrumentName` or `trackName` event in the MIDI data and returns it as a string. */
function findInstrumentAndTrackNames(midi: MidiData): [instrumentNames: Record<number, string>, trackNames: Record<number, string>] {
  const instrumentNames: Record<number, string> = {},
    trackNames: Record<number, string> = {};

  midi.tracks.forEach((track, ti) => {
    for(const event of track) {
      if(event.type === "instrumentName")
        instrumentNames[ti] = event.text ?? defaultInstrumentName;
      else if(event.type === "trackName")
        trackNames[ti] = event.text ?? `${defaultTrackName} ${randomId(5, 36, false, true)}`;
    }
  });

  return [instrumentNames, trackNames];
}

//#region config

/** Loads the config and returns it. If it doesnt exist, creates a default config from config.template.json and returns it. */
async function loadConfig(): Promise<Config> {
  const configPath = getPathRelativeToCaller(flags.config);
  try {
    const config = JSON.parse(String(await readFile(configPath))) as Config;
    if(!hasProps(config, ["input", "output", "velocities", "channels"]))
      throw new Error("Invalid config format, missing one or more required properties.");
    return config as Config;
  }
  catch {
    console.log(styleText("yellow", "\nCouldn't load config file, creating a new one..."));
    await writeFile(configPath, JSON.stringify(cfgTemplate, null, 2));
    console.log(styleText("green", `Created new config file at ${flags.config}\nPlease edit it, then run the script again.\n`));
    return schedExit(0), cfgTemplate as Config;
  }
}

/** Returns true, if {@linkcode obj} has all the properties in the {@linkcode props} array */
function hasProps(obj: object, props: string[]): boolean {
  return props.every(prop => prop in obj);
}

//#region normalizeVelocities

/**
 * Normalizes the velocities of all noteOn events in the given MIDI data.  
 * 1. Extracts the normal range of velocities from each channel.
 * 2. Scales the velocities to fit within the range of `minVelocity` and `maxVelocity`, while not messing up the relative differences between velocities, also across channels.
 */
function normalizeVelocities(midi: MidiObj, opts: VelocitiesOptions): MidiObj {
  const channelVelocities: Record<number, { min: number; max: number }> = {};

  // 1. extract normal range of velocities
  for(const track of midi.data.tracks) {
    for(const event of track) {
      if(event.type === "noteOn" && event.velocity > 0) {
        const channel = event.channel;
        if(!channelVelocities[channel])
          channelVelocities[channel] = { min: event.velocity, max: event.velocity };
        else {
          channelVelocities[channel].min = Math.min(channelVelocities[channel].min, event.velocity);
          channelVelocities[channel].max = Math.max(channelVelocities[channel].max, event.velocity);
        }
      }
    }
  }

  // 2. scale velocities - don't mess up relative differences between velocities, also across channels
  for (const track of midi.data.tracks) {
    for (const event of track) {
      if (event.type === "noteOn" && event.velocity > 0) {
        const channel = event.channel;
        const { min, max } = channelVelocities[channel];
        if (min === max) {
          // if all velocities in the channel are the same, set to median of the range
          event.velocity = Math.round((opts.min + opts.max) / 2);
        } else {
          // scale velocity to fit within new range
          event.velocity = Math.round(((event.velocity - min) / (max - min)) * (opts.max - opts.min) + opts.min);
        }
      }
    }
  }

  return midi;
}

/** Removes all noteOn events and their associated noteOff event with a velocity of 0 from the MIDI data. */
function removeSilent(midi: MidiObj): MidiObj {
  for (const track of midi.data.tracks) {
    for (let i = track.length - 1; i >= 0; i--) {
      const event = track[i];
      if (event.type === "noteOn" && event.velocity === 0) {
        track.splice(i, 1);
        // find the next noteOff event for the same note and channel
        for (let j = i; j < track.length; j++) {
          const nextEvent = track[j];
          if (nextEvent.type === "noteOff" && nextEvent.noteNumber === event.noteNumber && nextEvent.channel === event.channel) {
            track.splice(j, 1);
            break;
          }
        }
      }
    }
  }
  return midi;
}

//#region normalizeChannels

/**
 * Normalizes the channels of the MIDI files according to the given options.  
 * The goal is to have a consistent set of channels associated to instruments, regardless of the original MIDI file input.
 */
function normalizeChannels(midi: MidiObj, options: ChannelsOptions): MidiObj {
  for(const match of options.match) {
    midi.data.tracks.forEach((track, ti) => {
      if("patterns" in match) {
        if(match.patterns.some(pattern =>
          (midi.instrumentNames[ti] && new RegExp(pattern, match.patternFlags ?? "i").test(midi.instrumentNames[ti])) ||
          (midi.trackNames[ti] && new RegExp(pattern, match.patternFlags ?? "i").test(midi.trackNames[ti]))
        )) {
          track.forEach(event => {
            if("channel" in event)
              event.channel = match.channel;
          });
        }
      }
      else if("includes" in match) {
        if(match.includes.some(include =>
          (midi.instrumentNames[ti] && midi.instrumentNames[ti].includes(include)) ||
          (midi.trackNames[ti] && midi.trackNames[ti].includes(include))
        )) {
          track.forEach(event => {
            if("channel" in event)
              event.channel = match.channel;
          });
        }
      }
    });
  }
  return midi;
}

//#region addBuffers

/** Adds buffers to the beginning or end of the first track of the MIDI file, if specified in the options. */
function addBuffers(midi: MidiObj, opts: MiscOptions): MidiObj {
  if(opts.startBuffer || opts.endBuffer) {
    const firstTrack = midi.data.tracks[0];
    if(!firstTrack)
      return midi;

    const tpb = midi.data.header.ticksPerBeat ?? 480;

    const startBufferTicks = opts.startBuffer ? Math.round(opts.startBuffer * tpb) : 0;
    const endBufferTicks = opts.endBuffer ? Math.round(opts.endBuffer * tpb) : 0;

    if(startBufferTicks > 0) {
      firstTrack.unshift({
        deltaTime: 0,
        type: "setTempo",
        microsecondsPerBeat: 500000, // default tempo (120 BPM)
      });
      firstTrack.unshift({
        deltaTime: startBufferTicks,
        type: "noteOn",
        noteNumber: 0,
        velocity: 0,
        channel: 0,
      });
    }

    if(endBufferTicks > 0) {
      firstTrack.push({
        deltaTime: endBufferTicks,
        type: "noteOff",
        noteNumber: 0,
        velocity: 0,
        channel: 0,
      });
    }
  }
  return midi;
}
