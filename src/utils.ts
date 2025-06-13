import { basename, extname, join } from "node:path";
import type { MidiData } from "midi-file";
import { randomId } from "@sv443-network/coreutils";
import { argv } from "./consts.js";
import type { MidiObj, OutputOptions } from "./types.js";

const callerPath = argv.callerPath && argv.callerPath.length > 0 ? decodeURIComponent(atob(argv.callerPath.replace(/"/g, ""))) : undefined;

/** Returns the path relative to the directory from where this program was called, falls back to the current working directory */
export function getPathRelativeToCaller(path: string) {
  return join(callerPath ?? process.cwd(), path);
}

/** Returns the output file name for the given MIDI object and output configuration. */
export function getOutFileName(midi: MidiObj, outCfg: OutputOptions): string {
  const inBaseName = basename(midi.path);
  const inFileExt = extname(inBaseName);
  const inFileName = inBaseName.slice(0, -inFileExt.length);

  return outCfg.fileName
    .replace("${full}", inBaseName)
    .replace("${name}", inFileName)
    .replace("${ext}", inFileExt.startsWith(".") ? inFileExt.slice(1) : inFileExt);
}

/** Returns true, if {@linkcode obj} has all the properties in the {@linkcode props} array */
export function hasProps(obj: object, props: string[]): boolean {
  return props.every(prop => prop in obj);
}

/** Fallback instrument when a MIDI track doesn't contain an `instrumentName` event. */
const defaultInstrumentName = "Grand Piano";

/** Fallback track name when a MIDI track doesn't contain a `trackName` event. */
const defaultTrackName = "Unknown Track";

/** Finds the `instrumentName` or `trackName` event in the MIDI data and returns it as a string. */
export function findInstrumentAndTrackNames(midi: MidiData): [instrumentNames: Record<number, string>, trackNames: Record<number, string>] {
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
